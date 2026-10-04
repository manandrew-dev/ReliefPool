# Tsunami Risk Classifier

This repository contains ReliefPool's MVP off-chain tsunami-risk classifier.
It is a hackathon prototype, not an official warning system and not validated
for emergency decisions.

## Train the model

Install dependencies and explicitly train the model from the merged NOAA/USGS
dataset:

```bash
python -m pip install -r requirements.txt
python risk-classifier.py train
```

The training command uses
`Data/merged_usgs_noaa_tsunami_training.csv` and writes
`artifacts/tsunami-risk-classifier-v1.joblib`. The four model features are
`magnitude`, `depth`, `latitude`, and `longitude`; `event_id` and `time` remain
metadata. The older Kaggle-derived CSV is not used.

The training population consists of worldwide USGS earthquakes of magnitude
6.0 or greater. Predictions below M6.0 are technically accepted by the API,
but performance for those events has not been validated.

## Run the API

Training and serving are separate operations. After the artifact exists, run:

```bash
uvicorn api:app --host 0.0.0.0 --port 8000
```

The application loads the saved artifact once during startup and retains it in
memory. It fails at startup with a training command if the artifact is absent.
Set `TSUNAMI_MODEL_PATH` before startup to use a different artifact path.

### Health

```bash
curl http://localhost:8000/health
```

### Score

```bash
curl -X POST http://localhost:8000/score \
  -H 'Content-Type: application/json' \
  -d '{
    "eventId": "test-event-01",
    "magnitude": 7.3,
    "depthKm": 41.0,
    "latitude": 37.7,
    "longitude": 141.6,
    "time": "2026-10-03T18:42:10Z"
  }'
```

`eventId` is echoed for integration tracking. `time` and `eventId` are never
passed to the model. Threshold comparison and payout handling belong to
Backend Dev 2 and are intentionally absent from this service.
