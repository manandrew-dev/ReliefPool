# ReliefPool: Oracle Service Plan (Khan)

## Context

ReliefPool is a 24-hour hackathon project. Partners pool SOL on-chain, and when an earthquake's tsunami risk score meets the threshold, local responders are paid automatically. Owners: Andrew (frontend), Alice (Solana/Anchor program), Keith (classifier), **Khan (oracle service)**.

The oracle sits in the middle and connects to all three other parts: USGS feed → Keith's classifier → Alice's `trigger_payout` → REST API for Andrew's frontend. That means **we lock the contracts first and build against mocks** ([requirements.md](requirements.md) §10).

Chinese version: [oracle-plan.zh.md](oracle-plan.zh.md) (same content).

I own FR-10 to FR-15, FR-30, NFR-1/2/4/5/7, and every endpoint in [api.md](api.md) §3. Code lives in `backend/oracle/` on the `kehan` branch.

Based on requirements v0.2: the classifier is now a baseline trained during the event, with a rule-based scorer behind the same `/score` endpoint as the fallback (FR-32, FR-33). For the oracle, that means a real `/score` endpoint exists from hour 1, and the scores may shift when the model replaces the rule-based scorer.

---

## 1. What I provide / what I need

### I provide to Andrew (frontend)
| Item | When |
|---|---|
| `/health`, `/pool`, `/events`, `/events/:id`, `/replay/scenarios`, `POST /replay` on `http://localhost:3001/api`, matching api.md §3 exactly | Mock version (hardcoded fake data) by hour 2; real data swapped in after that |
| `fixtures/events.sample.json` covering all four statuses: `scored`, `pending`, `paid`, `failed` | Hour 1 |
| CORS enabled for `http://localhost:3000` | From day one |
| Real `programId`, `poolAddress`, `vaultAddress`, region name and bounds, and wallet labels in `GET /pool` | After Alice deploys |

### I provide to Alice (program)
| Item | When |
|---|---|
| **Oracle public key**, generated with `solana-keygen new -o oracle-keypair.json`. `initialize_pool` needs it. The private key never goes into the repo. | Hour 1 |
| Devnet SOL in the oracle wallet to cover transaction fees | Hour 1 |
| How I'll call the program: `program.methods.triggerPayout(eventId, riskScore).accounts({...})`. I need her to confirm the account list. | Hour 1 |
| Reports of on-chain errors during integration (`BelowThreshold`, `InsufficientFunds`, and so on) | Integration |

### I need from Alice
- **IDL JSON + TS types**. An early interface-first IDL is enough to start.
- **Program ID** and the deployed **Pool address** (or the admin key + region_id, so I can derive the PDA myself).
- The **exact account list for `trigger_payout`**, including whether responder wallets go in `remaining_accounts`. I must confirm this with her; if it's wrong, the transaction will fail.
- The payout amount rule: does a payout send the per-event cap, or the whole vault minus rent? (Open question in requirements §13.) I'd rather **read `PayoutRecord.amount` after confirmation**, so the oracle works either way.
- Who writes the setup script (`initialize_pool` + `register_responder`)? I suggest Alice writes it and I supply the oracle key.

### I need from Keith
- The **rule-based scorer behind `POST /score` in hour 1** (FR-32), so I can call the real endpoint instead of my own mock.
- The **final input fields for `POST /score`**. api.md says the current fields are a guess. Lock them in hour 1, and keep them unchanged when the trained model (FR-33) replaces the scorer, so the oracle doesn't need to change.
- How scores are distributed for low-risk and high-risk quakes, so we can **pick the threshold** (for example 70).
- Two replay scenarios (one below the threshold, one above), checked against both the rule-based scorer and the trained model, so they land on either side of the threshold whichever one is live at demo time.
- The service on port `8000` with `GET /health`, and each score returned in under 2 seconds if possible. `modelVersion` in the response should tell us whether the rule-based scorer or the model produced the score.

### Team decisions (hour 1)
1. **Demo region:** I suggest Japan's east coast (roughly lat 30–46, lon 135–150). The 2011 Tōhoku M9.1 quake works as the payout scenario, and a small quake in the same area works as the no-payout scenario.
2. **Threshold value** (decide together with Keith).
3. **Event ID rules:** USGS IDs are already short (for example `us7000abcd`). Replay IDs use the format `<scenarioId>-<runId>` and must be 32 bytes or less.
4. Repo layout is already set: `program/`, `backend/oracle/`, `backend/classifier/`, `frontend/`. Each component has its own `.env.example`. Everyone works on a personal branch and opens PRs into `main`.

---

## 2. Technical approach

**Stack:** Node + TypeScript + Express, with `@coral-xyz/anchor` and `@solana/web3.js`. Storage is in-memory plus `data/events.json`, written on every status change. This keeps payout signatures safe if the service restarts mid-demo, which answers the open question in [api.md](api.md) §7.

### Layout
```
backend/oracle/
  src/
    index.ts        # boot: config, restore store, start poller, start express
    config.ts       # env: RPC_URL, PROGRAM_ID, POOL_ADDRESS, ORACLE_KEYPAIR_PATH,
                    #      CLASSIFIER_URL, POLL_INTERVAL_MS, REGION_*, MOCK_CLASSIFIER, MOCK_CHAIN
    store.ts        # Map<id, QuakeEvent> + JSON persistence + query (limit/status/since)
    usgs.ts         # fetch feed, convert each GeoJSON feature to an internal event
    region.ts       # bounding-box check
    classifier.ts   # POST /score, 3s timeout, 1 retry; local formula only if MOCK_CLASSIFIER=true
    chain.ts        # Anchor client: read Pool (threshold), check PayoutRecord, send trigger_payout
    pipeline.ts     # processEvent(evt): one shared path for live and replay events
    scenarios.ts    # hardcoded historical replay scenarios
    routes.ts       # every api.md §3 endpoint + the shared error format
  fixtures/events.sample.json
  .env.example      # .env and keypair files are listed in .gitignore
```

### `processEvent` (live and replay share one path, FR-30)
1. **Dedupe (FR-14 / NFR-5):** if the store already has this ID, skip it for live events; for replays, return `409 EVENT_ALREADY_PROCESSED`.
2. **Region filter (FR-11):** drop events outside the region and don't store them.
3. Store the event with `riskScore: null`, `status: "scored"`, and `processedAt` set.
4. **Score (FR-12):** call the classifier. If it fails, set `status: "failed"` and `failureReason: "CLASSIFIER_UNAVAILABLE"`, then **stop. Never pay out (NFR-7).**
5. Read `threshold` from the on-chain Pool (cached for 30 seconds) and store it on the event.
6. If `score < threshold`, the status stays `scored` and processing ends.
7. If `score ≥ threshold` (FR-15):
   - Check whether the PayoutRecord PDA (`"payout", pool, eventId`) already exists. If it does, mark the event as already handled and don't send a transaction. This is a second safeguard; the chain also rejects duplicates.
   - Send `trigger_payout(eventId, score)`, then set status to `pending` and store `payout.signature` and `explorerUrl`.
   - Wait for confirmation at `confirmed` commitment (NFR-1, under 5 seconds). On confirmation, set status to `paid`, store `confirmedAt`, and read the PayoutRecord to fill in `amountLamports`.
   - If the chain returns an error, set status to `failed` and put the Anchor error name (for example `InsufficientFunds`) in `failureReason`.
8. Save to the JSON file after every step.

### USGS polling (FR-10 / NFR-2)
- Fetch `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson` every 30 seconds, which keeps new events on screen within the 60-second requirement.
- Field mapping: `id`, `properties.mag`, `properties.place`, `properties.time` (milliseconds, converted to ISO), and `geometry.coordinates = [lon, lat, depthKm]`.
- If a fetch fails, log it and report it in `/health`; nothing else is affected. `lastFeedPollAt` updates only after a successful fetch.

### Recovery on restart
On startup, look up the signature of every event still in `pending`, then set each one to `paid` or `failed`.

### Mock switches (so I'm never blocked)
- `MOCK_CLASSIFIER=true`: a local formula replaces the classifier, for example `score = clamp((mag-5)*25 - depth/10)`. Since Keith's rule-based scorer should be up from hour 1, this is only for working offline or when his service is down.
- `MOCK_CHAIN=true`: threshold is fixed at 70, and `trigger_payout` returns a fake signature that turns `paid` after 1 second.
- This gives Andrew a working backend to build against from hour 2.

---

## 3. Timeline (24h)

| Hours | What I do | Who I work with |
|---|---|---|
| 0–1 | Alignment meeting: region, threshold, event ID rules, `trigger_payout` account list, classifier fields. Generate the oracle keypair, airdrop devnet SOL, send the public key to Alice, and send the sample JSON to Andrew. | Whole team |
| 1–3 | Express skeleton, every route (mock data first), shared error format, CORS, store + JSON persistence | Andrew starts integrating |
| 3–6 | USGS poller + region filter, replay scenarios and `POST /replay`. The pipeline runs end to end with both mock switches on. | — |
| 6–9 | Point the oracle at Keith's `/score` (rule-based scorer first), handle timeouts and failures. Recheck the threshold and replay scores whenever he swaps in the trained model. | Keith |
| 9–14 | Once the IDL arrives, write `chain.ts`: read Pool, check PayoutRecord, send `trigger_payout`. Get the first payout working on devnet. | Alice |
| 14–18 | Full integration: run acceptance criteria 1–7 one by one; fix error mapping and restart recovery | Whole team |
| 18–21 | Hardening: make `/health` report real classifier and Solana status, write the oracle section of the README (NFR-10), record a backup demo video | Andrew records |
| 21–24 | Demo rehearsal (replay repeatedly using `runId`); stretch goal if there's time: SSE `/events/stream` | — |

**Fallback:** if the program isn't on devnet by hour 12, I keep demoing the backend flow in `MOCK_CHAIN` mode and help Alice (for example by writing the setup script or tests).

---

## 4. Verification

1. **Oracle alone (mock mode):**
   - `curl localhost:3001/api/health`
   - `curl localhost:3001/api/replay/scenarios`
   - `POST /replay` with `replay-minor-01`: the event should show as `scored` in `GET /events`
   - `POST /replay` with `replay-major-01`: the status should go from `pending` to `paid`
   - Send `replay-major-01` again: expect `409`
   - Send it again with a `runId`: expect success
2. **Classifier failure:** stop Keith's service, then replay. The event should be `failed`, with no on-chain transaction (NFR-7).
3. **Devnet end to end ([requirements.md](requirements.md) §11 acceptance criteria):** a low-score event causes no payout; a high-score event confirms in under 5 seconds and each responder's balance increases by its share; the explorer link opens; replaying the same event doesn't pay out a second time.
4. **Restart:** kill the process after a payout reaches `paid` and restart it. `GET /events?status=paid` should still show the signature.
5. **Security:** run `git status` to confirm `oracle-keypair.json` and `.env` aren't tracked (NFR-4).
