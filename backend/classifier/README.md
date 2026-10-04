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

Before the ordinary train/test split, training extracts these authoritative
demo holdouts by `event_id`:

- `usc000f03a`
- `us6000h519`
- `official20110311054624120_30`

All three must exist or training fails with the missing IDs. The authoritative
CSV remains unchanged: 3,976 source rows yield 3,973 ordinary modeling rows and
3 separate demo rows. The existing stratified 80/20 split with random state 42
produces 3,178 training rows and 795 ordinary test rows. The demo rows are
excluded from fitting, ordinary evaluation, and threshold analysis, then scored
only after training. Scaling, balanced LogisticRegression, features, target,
and hyperparameters remain unchanged.

The training command prints actual held-out metrics, row counts, candidate
threshold results (30, 40, 50, 60, 70, 80, 90), and the three demo scores with
`modelVersion: "model-v1"`. Threshold analysis compares
`round(probability * 100) >= threshold` on the ordinary test set. Threshold
selection and payout handling belong to Backend Dev 2; no payout threshold is
implemented in the classifier or `/score`.

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

Response:

```json
{ "status": "ok", "modelVersion": "model-v1" }
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
    "longitude": 141.6
  }'
```

Exactly these five fields are required and must be non-null. Extra fields,
including `time`, are forbidden and return HTTP 422. Predictive numbers must
be finite, with latitude in [-90, 90] and longitude in [-180, 180]. `eventId`
is echoed exactly for integration tracking and never passed to the model.
`depthKm` maps to the model's `depth` feature.

The response contains `eventId`, model-derived `probability` in [0, 1], integer
`riskScore = round(probability * 100)` in [0, 100], and
`modelVersion: "model-v1"`.

## Verify locally

Run commands from `backend/classifier`:

```bash
python -m pip install -r requirements-dev.txt
python -m pytest -q
python risk-classifier.py train
uvicorn api:app --host 127.0.0.1 --port 8000
```

Use the health and five-field scoring curl commands above in another terminal.
