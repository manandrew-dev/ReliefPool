"""FastAPI integration for the persisted ReliefPool tsunami-risk model."""

from contextlib import asynccontextmanager
import importlib.util
import math
import os
from pathlib import Path

from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict, Field, StrictStr, field_validator


def _load_classifier_module():
    module_path = Path(__file__).with_name("risk-classifier.py")
    spec = importlib.util.spec_from_file_location("risk_classifier", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to import classifier module from {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


classifier = _load_classifier_module()
MODEL_PATH = Path(
    os.environ.get("TSUNAMI_MODEL_PATH", classifier.DEFAULT_MODEL_PATH)
)


class ScoreRequest(BaseModel):
    """Backend Dev 2 scoring request; metadata is excluded from the model."""

    model_config = ConfigDict(extra="forbid")

    eventId: StrictStr = Field(min_length=1)
    magnitude: float = Field(strict=True)
    depthKm: float = Field(strict=True)
    latitude: float = Field(strict=True, ge=-90, le=90)
    longitude: float = Field(strict=True, ge=-180, le=180)

    @field_validator("magnitude", "depthKm", "latitude", "longitude")
    @classmethod
    def numeric_fields_must_be_finite(cls, value):
        if not math.isfinite(value):
            raise ValueError("must be finite")
        return value


class ScoreResponse(BaseModel):
    eventId: str
    riskScore: int
    probability: float
    modelVersion: str


class HealthResponse(BaseModel):
    status: str
    modelVersion: str


@asynccontextmanager
async def lifespan(app_instance):
    """Load the artifact once at startup and retain it for all requests."""
    try:
        app_instance.state.model = classifier.load_model(MODEL_PATH)
    except (FileNotFoundError, RuntimeError, TypeError) as exc:
        raise RuntimeError(
            f"Classifier startup failed. Train the model first with "
            f"'python risk-classifier.py train --model {MODEL_PATH}': {exc}"
        ) from exc
    yield
    app_instance.state.model = None


app = FastAPI(title="ReliefPool Tsunami Risk Classifier", lifespan=lifespan)


@app.get("/health", response_model=HealthResponse)
def health():
    """Report that the service and its in-memory model are available."""
    return {"status": "ok", "modelVersion": classifier.MODEL_VERSION}


@app.post("/score", response_model=ScoreResponse)
def score(request: ScoreRequest):
    """Score one earthquake without training, disk access, or data fetching."""
    result = classifier.predict_risk(
        app.state.model,
        magnitude=request.magnitude,
        depth_km=request.depthKm,
        latitude=request.latitude,
        longitude=request.longitude,
    )
    return {"eventId": request.eventId, **result}
