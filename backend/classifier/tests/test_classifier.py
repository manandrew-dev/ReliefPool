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
    model, (_, X_test, _, y_test) = trained_model
    data = classifier.load_data(classifier.DEFAULT_DATASET_PATH)
    assert len(data) == 3976
    assert data[classifier.TARGET_COLUMN].value_counts().to_dict() == {0: 3710, 1: 266}
    assert classifier.FEATURE_COLUMNS == [
        "magnitude", "depth", "latitude", "longitude"
    ]
    metrics = classifier.evaluate_model(model, X_test, y_test)
    assert metrics["positiveClass"] == 1
    assert metrics["confusionMatrix"] == [[659, 84], [10, 43]]
    assert metrics["accuracy"] == pytest.approx(0.8819095477386935)
    assert metrics["precision"] == pytest.approx(0.33858267716535434)
    assert metrics["recall"] == pytest.approx(0.8113207547169812)
    assert metrics["f1"] == pytest.approx(0.4777777777777778)
    assert metrics["rocAuc"] == pytest.approx(0.9162751720460144)


def test_prediction_contract_and_validation(trained_model):
    model, _ = trained_model
    result = classifier.predict_risk(model, 7.3, 41.0, 37.7, 141.6)
    assert 0 <= result["probability"] <= 1
    assert result["riskScore"] == round(result["probability"] * 100)
    assert result["modelVersion"] == "v1"

    for bad_value in [None, math.nan, math.inf, "not-numeric"]:
        with pytest.raises(ValueError):
            classifier.predict_risk(model, bad_value, 41.0, 37.7, 141.6)
