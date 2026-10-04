import math

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

import api


VALID_REQUEST = {
    "eventId": "test-event-01",
    "magnitude": 7.3,
    "depthKm": 41.0,
    "latitude": 37.7,
    "longitude": 141.6,
}


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    data = api.classifier.load_data(api.classifier.DEFAULT_DATASET_PATH)
    X_train, _, y_train, _ = api.classifier.preprocess_data(data)
    model = api.classifier.train_model(X_train, y_train)
    model_path = tmp_path_factory.mktemp("api-model") / "classifier.joblib"
    api.classifier.save_model(model, model_path)
    original_path = api.MODEL_PATH
    api.MODEL_PATH = model_path
    with TestClient(api.app) as test_client:
        yield test_client
    api.MODEL_PATH = original_path


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "modelVersion": "model-v1"}


def test_valid_score(client):
    response = client.post("/score", json=VALID_REQUEST)
    assert response.status_code == 200
    body = response.json()
    assert body["eventId"] == VALID_REQUEST["eventId"]
    assert 0 <= body["probability"] <= 1
    assert 0 <= body["riskScore"] <= 100
    assert body["riskScore"] == round(body["probability"] * 100)
    assert body["modelVersion"] == "model-v1"
    assert set(body) == {"eventId", "riskScore", "probability", "modelVersion"}
    assert isinstance(body["riskScore"], int)


@pytest.mark.parametrize("field", ["time", "unexpected"])
def test_extra_fields_are_rejected(client, field):
    request = {**VALID_REQUEST, field: "2026-10-03T18:42:10Z"}
    response = client.post("/score", json=request)
    assert response.status_code == 422
    assert any(error["type"] == "extra_forbidden" for error in response.json()["detail"])


def test_event_id_is_echoed_exactly_and_is_only_metadata(client):
    expected = client.post("/score", json=VALID_REQUEST).json()
    event_id = "  oracle-event/日本  "
    response = client.post("/score", json={**VALID_REQUEST, "eventId": event_id})
    assert response.status_code == 200
    assert response.json() == {**expected, "eventId": event_id}


@pytest.mark.parametrize("field", VALID_REQUEST)
def test_missing_required_fields_are_rejected(client, field):
    request = VALID_REQUEST.copy()
    request.pop(field)
    assert client.post("/score", json=request).status_code == 422


@pytest.mark.parametrize("field", VALID_REQUEST)
def test_null_fields_are_rejected(client, field):
    request = {**VALID_REQUEST, field: None}
    assert client.post("/score", json=request).status_code == 422


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("latitude", -91),
        ("latitude", 91),
        ("longitude", -181),
        ("longitude", 181),
        ("eventId", ""),
        ("eventId", 1791052930),
        ("magnitude", "7.3"),
    ],
)
def test_invalid_values_are_rejected(client, field, value):
    request = {**VALID_REQUEST, field: value}
    assert client.post("/score", json=request).status_code == 422


@pytest.mark.parametrize("field", ["magnitude", "depthKm", "latitude", "longitude"])
@pytest.mark.parametrize("non_finite_text", ["NaN", "Infinity", "-Infinity"])
def test_non_finite_text_values_are_rejected_over_http(
    client, field, non_finite_text
):
    # JSON has no non-finite numeric values. Send their names as valid JSON
    # strings and verify that strict numeric request fields reject them.
    request = {**VALID_REQUEST, field: non_finite_text}
    assert client.post("/score", json=request).status_code == 422


@pytest.mark.parametrize("field", ["magnitude", "depthKm", "latitude", "longitude"])
@pytest.mark.parametrize("non_finite", [math.nan, math.inf, -math.inf])
def test_non_finite_python_numbers_are_rejected_by_request_model(field, non_finite):
    # Exercise the finite-number validator directly because NaN and infinities
    # cannot be represented as JSON numbers on the HTTP boundary.
    request = {**VALID_REQUEST, field: non_finite}
    with pytest.raises(ValidationError):
        api.ScoreRequest.model_validate(request)


def test_model_is_loaded_once_and_reused(client, monkeypatch):
    in_memory_model = api.app.state.model
    monkeypatch.setattr(
        api.classifier,
        "load_model",
        lambda _: pytest.fail("score endpoint reloaded the model"),
    )
    monkeypatch.setattr(
        api.classifier,
        "train_model",
        lambda *_: pytest.fail("score endpoint retrained the model"),
    )
    assert client.post("/score", json=VALID_REQUEST).status_code == 200
    assert api.app.state.model is in_memory_model
