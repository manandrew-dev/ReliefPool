import importlib.util
import math
from pathlib import Path

import pytest


ROOT = Path(__file__).parents[1]
SPEC = importlib.util.spec_from_file_location(
    "risk_classifier_under_test", ROOT / "risk-classifier.py"
)
classifier = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(classifier)


@pytest.fixture(scope="module")
def trained_model(tmp_path_factory):
    dataframe = classifier.load_data(classifier.DEFAULT_DATASET_PATH)
    split = classifier.preprocess_data(dataframe)
    model = classifier.train_model(split[0], split[2])
    path = tmp_path_factory.mktemp("model") / "classifier.joblib"
    classifier.save_model(model, path)
    return classifier.load_model(path), split


def test_dataset_and_reproducible_baseline(trained_model):
    model, (X_train, X_test, y_train, y_test) = trained_model
    data = classifier.load_data(classifier.DEFAULT_DATASET_PATH)
    assert len(data) == 3976
    assert data[classifier.TARGET_COLUMN].value_counts().to_dict() == {0: 3710, 1: 266}
    assert classifier.FEATURE_COLUMNS == [
        "magnitude", "depth", "latitude", "longitude"
    ]
    metrics = classifier.evaluate_model(model, X_test, y_test)
    assert metrics["positiveClass"] == 1
    assert (len(X_train), len(X_test)) == (3178, 795)
    assert metrics["confusionMatrix"] == [[648, 94], [8, 45]]
    assert metrics["accuracy"] == pytest.approx(0.8716981132075472)
    assert metrics["precision"] == pytest.approx(0.3237410071942446)
    assert metrics["recall"] == pytest.approx(0.8490566037735849)
    assert metrics["f1"] == pytest.approx(0.46875)
    assert metrics["rocAuc"] == pytest.approx(0.9301225652240248)
    repeated_split = classifier.preprocess_data(data)
    for first, repeated in zip((X_train, X_test, y_train, y_test), repeated_split):
        assert first.equals(repeated)


def test_demo_holdouts_are_removed_before_split_and_remain_available(monkeypatch):
    data = classifier.load_data(classifier.DEFAULT_DATASET_PATH)
    original_data = data.copy(deep=True)
    expected_ids = {"usc000f03a", "us6000h519", "official20110311054624120_30"}
    assert set(classifier.DEFAULT_DEMO_HOLDOUT_IDS) == expected_ids
    ordinary, demos = classifier.extract_demo_holdouts(data)
    assert set(demos["event_id"]) == expected_ids
    assert len(demos) == 3
    assert len(ordinary) == 3973
    assert not set(ordinary["event_id"]) & expected_ids
    assert data.equals(original_data)

    original_split = classifier.train_test_split

    def checked_split(X, y, **kwargs):
        assert len(X) == len(y) == 3973
        assert not set(data.loc[X.index, "event_id"]) & expected_ids
        assert kwargs == {"test_size": 0.2, "random_state": 42, "stratify": y}
        return original_split(X, y, **kwargs)

    monkeypatch.setattr(classifier, "train_test_split", checked_split)
    X_train, X_test, y_train, y_test = classifier.preprocess_data(data)
    assert not set(data.loc[X_train.index, "event_id"]) & expected_ids
    assert not set(data.loc[X_test.index, "event_id"]) & expected_ids
    assert set(X_train.index).isdisjoint(X_test.index)
    assert set(X_train.index) | set(X_test.index) == set(ordinary.index)
    assert X_train.index.equals(y_train.index)
    assert X_test.index.equals(y_test.index)


@pytest.mark.parametrize("missing_id", classifier.DEFAULT_DEMO_HOLDOUT_IDS)
def test_missing_demo_holdout_fails_clearly(missing_id):
    data = classifier.load_data(classifier.DEFAULT_DATASET_PATH)
    data = data.loc[data["event_id"] != missing_id]
    with pytest.raises(ValueError, match=missing_id):
        classifier.preprocess_data(data)


def test_missing_event_id_column_fails_clearly():
    data = classifier.load_data(classifier.DEFAULT_DATASET_PATH).drop(columns="event_id")
    with pytest.raises(ValueError, match="event_id"):
        classifier.preprocess_data(data)


def test_training_report_scores_demos_only_after_fitting(tmp_path, monkeypatch):
    original_train = classifier.train_model
    original_predict = classifier.predict_risk
    data = classifier.load_data(classifier.DEFAULT_DATASET_PATH)
    fitted = False

    def checked_train(X, y):
        nonlocal fitted
        assert not set(data.loc[X.index, "event_id"]) & set(classifier.DEFAULT_DEMO_HOLDOUT_IDS)
        model = original_train(X, y)
        fitted = True
        return model

    def checked_predict(*args, **kwargs):
        assert fitted
        return original_predict(*args, **kwargs)

    original_thresholds = classifier.evaluate_thresholds

    def checked_thresholds(model, X, y):
        assert len(X) == 795
        assert not set(data.loc[X.index, "event_id"]) & set(classifier.DEFAULT_DEMO_HOLDOUT_IDS)
        return original_thresholds(model, X, y)

    monkeypatch.setattr(classifier, "train_model", checked_train)
    monkeypatch.setattr(classifier, "predict_risk", checked_predict)
    monkeypatch.setattr(classifier, "evaluate_thresholds", checked_thresholds)
    model_path = tmp_path / "retrained.joblib"
    report = classifier.train_and_save(model_path=model_path)
    assert report["rowCounts"] == {
        "dataset": 3976, "ordinaryModeling": 3973, "demoHoldouts": 3,
        "train": 3178, "test": 795,
    }
    assert report["modelVersion"] == "model-v1"
    assert [row["threshold"] for row in report["thresholdAnalysis"]] == [30, 40, 50, 60, 70, 80, 90]
    threshold_70 = next(row for row in report["thresholdAnalysis"] if row["threshold"] == 70)
    assert threshold_70 == {
        "threshold": 70, "truePositives": 38, "falsePositives": 46,
        "trueNegatives": 696, "falseNegatives": 15,
        "precision": pytest.approx(0.4523809523809524),
        "recall": pytest.approx(0.7169811320754716),
        "f1": pytest.approx(0.5547445255474452),
    }
    assert [row["event_id"] for row in report["demoScores"]] == list(classifier.DEFAULT_DEMO_HOLDOUT_IDS)
    persisted = classifier.load_model(model_path)
    for demo in report["demoScores"]:
        source = data.set_index("event_id").loc[demo["event_id"]]
        for column in classifier.FEATURE_COLUMNS + [classifier.TARGET_COLUMN]:
            assert demo[column] == source[column]
        result = original_predict(
            persisted, demo["magnitude"], demo["depth"], demo["latitude"], demo["longitude"]
        )
        assert demo["probability"] == result["probability"]
        assert demo["riskScore"] == result["riskScore"]
        assert demo["modelVersion"] == "model-v1"


def test_threshold_analysis_compares_rounded_integer_scores():
    import numpy as np
    import pandas as pd

    class FixedProbabilityModel:
        classes_ = [0, 1]

        def predict_proba(self, X):
            probabilities = np.array([0.6951, 0.6949, 0.7049, 0.7051])
            return np.column_stack([1 - probabilities, probabilities])

    result = classifier.evaluate_thresholds(
        FixedProbabilityModel(), pd.DataFrame(index=range(4)), pd.Series([1, 0, 0, 1]),
        thresholds=(70,),
    )
    assert result == [{
        "threshold": 70, "truePositives": 2, "falsePositives": 1,
        "trueNegatives": 1, "falseNegatives": 0,
        "precision": pytest.approx(2 / 3), "recall": 1.0, "f1": 0.8,
    }]


def test_prediction_contract_and_validation(trained_model):
    model, _ = trained_model
    result = classifier.predict_risk(model, 7.3, 41.0, 37.7, 141.6)
    assert 0 <= result["probability"] <= 1
    assert result["riskScore"] == round(result["probability"] * 100)
    assert result["modelVersion"] == "model-v1"

    for bad_value in [None, math.nan, math.inf, "not-numeric"]:
        with pytest.raises(ValueError):
            classifier.predict_risk(model, bad_value, 41.0, 37.7, 141.6)
