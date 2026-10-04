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
MODEL_VERSION = "model-v1"
RANDOM_STATE = 42
DEFAULT_DATASET_PATH = Path("Data/merged_usgs_noaa_tsunami_training.csv")
DEFAULT_MODEL_PATH = Path("artifacts/tsunami-risk-classifier-v1.joblib")
DEFAULT_DEMO_HOLDOUT_IDS = (
    "usc000f03a",
    "us6000h519",
    "official20110311054624120_30",
)
CANDIDATE_THRESHOLDS = (30, 40, 50, 60, 70, 80, 90)


def load_data(path):
    """Load the training dataset."""
    dataset_path = Path(path)
    if not dataset_path.is_file():
        raise FileNotFoundError(f"Training dataset not found: {dataset_path}")

    try:
        return pd.read_csv(dataset_path)
    except (OSError, pd.errors.ParserError, UnicodeError) as exc:
        raise ValueError(f"Unable to read training dataset {dataset_path}: {exc}") from exc


def extract_demo_holdouts(df, demo_holdout_ids=DEFAULT_DEMO_HOLDOUT_IDS):
    """Separate demo rows by stable ID, without modifying the source dataset."""
    if not demo_holdout_ids:
        return df.copy(), df.iloc[:0].copy()
    if "event_id" not in df.columns:
        raise ValueError("Dataset is missing required column: event_id")
    missing_ids = sorted(set(demo_holdout_ids) - set(df["event_id"]))
    if missing_ids:
        raise ValueError("Demo holdout event ID(s) not found: " + ", ".join(missing_ids))
    demo_mask = df["event_id"].isin(demo_holdout_ids)
    return df.loc[~demo_mask].copy(), df.loc[demo_mask].copy()


def preprocess_data(df, demo_holdout_ids=DEFAULT_DEMO_HOLDOUT_IDS):
    """Exclude demos, validate data, and return the fixed stratified split."""
    df, _ = extract_demo_holdouts(df, demo_holdout_ids)
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


def evaluate_thresholds(model, X_test, y_test, thresholds=CANDIDATE_THRESHOLDS):
    """Analyze integer risk-score cutoffs on the ordinary test set only."""
    positive_index = list(model.classes_).index(1)
    probabilities = model.predict_proba(X_test)[:, positive_index]
    risk_scores = pd.Series(
        [round(float(probability) * 100) for probability in probabilities],
        index=X_test.index,
    )
    results = []
    for threshold in thresholds:
        predictions = (risk_scores >= threshold).astype(int)
        tn, fp, fn, tp = confusion_matrix(y_test, predictions, labels=[0, 1]).ravel()
        results.append({
            "threshold": threshold,
            "truePositives": int(tp),
            "falsePositives": int(fp),
            "trueNegatives": int(tn),
            "falseNegatives": int(fn),
            "precision": float(precision_score(y_test, predictions, zero_division=0)),
            "recall": float(recall_score(y_test, predictions, zero_division=0)),
            "f1": float(f1_score(y_test, predictions, zero_division=0)),
        })
    return results


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
            "modelVersion": "model-v1"
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
    """Train and persist the baseline, evaluating ordinary tests and demos apart."""
    dataset = load_data(dataset_path)
    ordinary, demo_rows = extract_demo_holdouts(dataset)
    X_train, X_test, y_train, y_test = preprocess_data(ordinary, demo_holdout_ids=())
    model = train_model(X_train, y_train)
    metrics = evaluate_model(model, X_test, y_test)
    save_model(model, model_path)
    metrics["modelVersion"] = MODEL_VERSION
    metrics["rowCounts"] = {
        "dataset": len(dataset),
        "ordinaryModeling": len(ordinary),
        "demoHoldouts": len(demo_rows),
        "train": len(X_train),
        "test": len(X_test),
    }
    metrics["thresholdAnalysis"] = evaluate_thresholds(model, X_test, y_test)
    demos_by_id = demo_rows.set_index("event_id")
    metrics["demoScores"] = []
    for event_id in DEFAULT_DEMO_HOLDOUT_IDS:
        row = demos_by_id.loc[event_id]
        result = predict_risk(
            model, row["magnitude"], row["depth"], row["latitude"], row["longitude"]
        )
        metrics["demoScores"].append({
            "event_id": event_id,
            **{feature: float(row[feature]) for feature in FEATURE_COLUMNS},
            "tsunami": int(row[TARGET_COLUMN]),
            **result,
        })
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
