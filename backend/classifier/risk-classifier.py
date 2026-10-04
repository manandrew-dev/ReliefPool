"""
Tsunami risk classifier for ReliefPool.

Responsibilities:
- Train and evaluate the tsunami-risk model.
- Receive earthquake features from Backend Dev 2.
- Return a tsunami risk probability and risk score.

This component does NOT fetch earthquake data from USGS.
This component does NOT interact with Solana.
"""

import argparse
import json
import math
from pathlib import Path

import joblib
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


FEATURE_COLUMNS = ["magnitude", "depth", "latitude", "longitude"]
TARGET_COLUMN = "tsunami"
MODEL_VERSION = "v1"
RANDOM_STATE = 42
DEFAULT_DATASET_PATH = Path("Data/merged_usgs_noaa_tsunami_training.csv")
DEFAULT_MODEL_PATH = Path("artifacts/tsunami-risk-classifier-v1.joblib")


def load_data(path):
    """Load the training dataset."""
    dataset_path = Path(path)
    if not dataset_path.is_file():
        raise FileNotFoundError(f"Training dataset not found: {dataset_path}")

    try:
        return pd.read_csv(dataset_path)
    except (OSError, pd.errors.ParserError, UnicodeError) as exc:
        raise ValueError(f"Unable to read training dataset {dataset_path}: {exc}") from exc


def preprocess_data(df):
    """Validate the dataset and return a reproducible stratified split."""
    required_columns = FEATURE_COLUMNS + [TARGET_COLUMN]
    missing_columns = [column for column in required_columns if column not in df.columns]
    if missing_columns:
        raise ValueError(
            "Dataset is missing required column(s): " + ", ".join(missing_columns)
        )
    if df.empty:
        raise ValueError("Training dataset contains no rows")

    prepared = df[required_columns].copy()
    for column in required_columns:
        try:
            prepared[column] = pd.to_numeric(prepared[column], errors="raise")
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Dataset column '{column}' must be numeric") from exc

    if prepared.isna().any().any():
        bad_columns = prepared.columns[prepared.isna().any()].tolist()
        raise ValueError(
            "Dataset contains missing values in required column(s): "
            + ", ".join(bad_columns)
        )
    finite_mask = prepared.apply(lambda column: column.map(math.isfinite))
    if not finite_mask.all().all():
        bad_columns = finite_mask.columns[~finite_mask.all()].tolist()
        raise ValueError(
            "Dataset contains non-finite values in required column(s): "
            + ", ".join(bad_columns)
        )

    if not prepared["latitude"].between(-90, 90).all():
        raise ValueError("Dataset latitude values must be between -90 and 90")
    if not prepared["longitude"].between(-180, 180).all():
        raise ValueError("Dataset longitude values must be between -180 and 180")

    target_values = set(prepared[TARGET_COLUMN].unique())
    if target_values != {0, 1}:
        raise ValueError(
            "Target column 'tsunami' must contain both binary classes 0 and 1; "
            f"found {sorted(target_values)}"
        )

    X = prepared[FEATURE_COLUMNS]
    y = prepared[TARGET_COLUMN].astype(int)
    return train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=RANDOM_STATE,
        stratify=y,
    )


def train_model(X_train, y_train):
    """Train and return the tsunami-risk classifier."""
    model = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            (
                "classifier",
                LogisticRegression(
                    class_weight="balanced",
                    max_iter=1000,
                    random_state=RANDOM_STATE,
                ),
            ),
        ]
    )
    model.fit(X_train, y_train)
    return model


def evaluate_model(model, X_test, y_test):
    """Evaluate the model, treating tsunami class ``1`` as positive."""
    predictions = model.predict(X_test)
    metrics = {
        "positiveClass": 1,
        "accuracy": float(accuracy_score(y_test, predictions)),
        "precision": float(precision_score(y_test, predictions, zero_division=0)),
        "recall": float(recall_score(y_test, predictions, zero_division=0)),
        "f1": float(f1_score(y_test, predictions, zero_division=0)),
        "confusionMatrix": confusion_matrix(y_test, predictions, labels=[0, 1]).tolist(),
    }

    if len(set(y_test)) == 2 and hasattr(model, "predict_proba"):
        positive_index = list(model.classes_).index(1)
        probabilities = model.predict_proba(X_test)[:, positive_index]
        metrics["rocAuc"] = float(roc_auc_score(y_test, probabilities))
    else:
        metrics["rocAuc"] = None

    return metrics


def save_model(model, path):
    """Save the trained model."""
    model_path = Path(path)
    if model_path.parent != Path("."):
        model_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, model_path)


def load_model(path):
    """Load a previously trained model."""
    model_path = Path(path)
    if not model_path.is_file():
        raise FileNotFoundError(f"Model artifact not found: {model_path}")
    try:
        model = joblib.load(model_path)
    except Exception as exc:
        raise RuntimeError(f"Unable to load model artifact {model_path}: {exc}") from exc
    if not callable(getattr(model, "predict_proba", None)):
        raise TypeError("Loaded model is incompatible: predict_proba is required")
    return model


def predict_risk(
    model,
    magnitude,
    depth_km,
    latitude,
    longitude
):
    """
    Receive earthquake parameters supplied by Backend Dev 2
    and return the predicted tsunami risk.

    Returns:
        {
            "probability": float,
            "riskScore": int,
            "modelVersion": "v1"
        }
    """
    supplied_values = {
        "magnitude": magnitude,
        "depth": depth_km,
        "latitude": latitude,
        "longitude": longitude,
    }
    validated_values = {}
    for name, value in supplied_values.items():
        if value is None:
            raise ValueError(f"Missing required predictive field: {name}")
        try:
            numeric_value = float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Predictive field '{name}' must be numeric") from exc
        if not math.isfinite(numeric_value):
            raise ValueError(f"Predictive field '{name}' must be finite")
        validated_values[name] = numeric_value

    if not -90 <= validated_values["latitude"] <= 90:
        raise ValueError("latitude must be between -90 and 90")
    if not -180 <= validated_values["longitude"] <= 180:
        raise ValueError("longitude must be between -180 and 180")

    event = pd.DataFrame([validated_values], columns=FEATURE_COLUMNS)
    try:
        positive_index = list(model.classes_).index(1)
    except (AttributeError, ValueError) as exc:
        raise TypeError("Model is incompatible: positive class 1 is unavailable") from exc
    probability = float(model.predict_proba(event)[0, positive_index])
    if not math.isfinite(probability) or not 0.0 <= probability <= 1.0:
        raise ValueError("Model returned an invalid tsunami probability")

    return {
        "probability": probability,
        "riskScore": round(probability * 100),
        "modelVersion": MODEL_VERSION,
    }


def train_and_save(dataset_path=DEFAULT_DATASET_PATH, model_path=DEFAULT_MODEL_PATH):
    """Train, evaluate, and persist the fixed MVP baseline."""
    dataset = load_data(dataset_path)
    X_train, X_test, y_train, y_test = preprocess_data(dataset)
    model = train_model(X_train, y_train)
    metrics = evaluate_model(model, X_test, y_test)
    save_model(model, model_path)
    return metrics


def main(argv=None):
    """Run the explicit, offline model-training operation."""
    parser = argparse.ArgumentParser(description="Train the tsunami risk classifier")
    parser.add_argument(
        "command",
        choices=["train"],
        help="train and persist the classifier",
    )
    parser.add_argument(
        "--dataset",
        type=Path,
        default=DEFAULT_DATASET_PATH,
        help=f"training CSV (default: {DEFAULT_DATASET_PATH})",
    )
    parser.add_argument(
        "--model",
        type=Path,
        default=DEFAULT_MODEL_PATH,
        help=f"output model artifact (default: {DEFAULT_MODEL_PATH})",
    )
    args = parser.parse_args(argv)

    metrics = train_and_save(args.dataset, args.model)
    print(json.dumps(metrics, indent=2))
    print(f"Saved model artifact: {args.model}")


if __name__ == "__main__":
    main()
