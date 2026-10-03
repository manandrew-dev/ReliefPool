# ReliefPool Oracle Service

中文版: [README.zh.md](README.zh.md)

Reads earthquakes from USGS, scores them with the classifier, and calls `trigger_payout` on the Solana program when a score meets the pool threshold. It also serves the REST API the frontend uses ([docs/api.md](../../docs/api.md) §3). Plan: [docs/oracle-plan.md](../../docs/oracle-plan.md).

## Run

Requires Node 20+.

```bash
cd backend/oracle
npm install
npm run dev        # http://localhost:3001/api, reloads on change
```

With no `.env`, the service runs fully mocked: the classifier is a local formula and the chain is simulated. To change settings, copy `.env.example` to `.env`. The main switches:

| Variable | Default | Meaning |
|---|---|---|
| `MOCK_CLASSIFIER` | `true` | `false` calls Keith's service at `CLASSIFIER_URL`; `/health` then shows its `modelVersion` (`rules-v1` or `model-v1`) |
| `MOCK_CHAIN` | `true` | `false` uses the real program (not wired up yet; waits on the IDL) |
| `POLL_ENABLED` | `true` | Polls the USGS live feed every `POLL_INTERVAL_MS` |
| `MIN_MAGNITUDE` | `5.0` | In-region quakes below this are stored with score 0 and never scored |

The demo region and wallet labels for `GET /pool` are set in `pool.config.json`.

## How an event is processed

Live and replayed events take the same path ([src/pipeline.ts](src/pipeline.ts)):

1. Skip events that were already seen, or that are outside the region.
2. Read the threshold from the chain.
3. Below `MIN_MAGNITUDE`: `riskScore: 0`, stop.
4. Score with the classifier, sending exactly the five contract fields ([docs/api.md](../../docs/api.md) §4). If the classifier is unavailable, rejects the request, or breaks the contract, the event becomes `failed` (`CLASSIFIER_UNAVAILABLE`, `CLASSIFIER_REJECTED`, or `CLASSIFIER_INVALID_RESPONSE`) and is **never paid**.
5. Score below the threshold: `scored`, stop.
6. Send `trigger_payout`: status becomes `pending`, then `paid` once confirmed (or `failed` with the program's error name).

While an event is being scored, its status is `scored` with `riskScore: null`. Events are saved to `data/events.json` after every change, so a restart keeps payout signatures.

## Replay scenarios

`scenarios.json` holds real USGS events, so replays use the same data shape as the live feed:

| ID | Quake | Mock score (threshold 70) | Outcome |
|---|---|---|---|
| `jp-2025-m48` | M4.8 off Ōfunato, 2025 | 0 (below `MIN_MAGNITUDE`) | no payout |
| `jp-2013-m69-deep` | M6.9 near Obihiro, 107 km deep, 2013 | 27 | no payout |
| `jp-2022-m73` | M7.3 off Fukushima, 2022 | 77 | payout |
| `tohoku-2011-m91` | M9.1 Tōhoku, 2011 | 100 | payout |

```bash
curl -X POST localhost:3001/api/replay -H 'Content-Type: application/json' \
  -d '{"scenarioId":"jp-2022-m73","runId":"r1"}'
```

Without a `runId`, a second replay of the same scenario returns `409`. That's the double-payout guard working. To change the list, edit `scripts/build-scenarios.ts` and run `npm run scenarios:build`.

## For the frontend

`fixtures/events.sample.json` is a `GET /events` response covering every status: `scored`, `pending`, `paid`, and `failed`.

`GET /pool` returns `null` for `programId`, `poolAddress`, and `vaultAddress` until the program is deployed.

## Oracle key

```bash
npm run keygen     # writes oracle-keypair.json (gitignored) and prints the public key
npm run airdrop    # devnet SOL for fees; if rate-limited, use https://faucet.solana.com
```

Never commit `oracle-keypair.json` or `.env`. Share only the public key.

## Tests

```bash
npm test           # pipeline, store, and HTTP API
npm run typecheck
```
