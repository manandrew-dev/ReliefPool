# ReliefPool: API and Interface Spec

Draft v0.1. Companion to `requirements.md`.

## 1. Who talks to whom

```
                  ┌──────────────┐   POST /score   ┌────────────┐
USGS feed ──────► │ Oracle       │ ──────────────► │ Classifier │
                  │ service (TS) │ ◄────────────── │ (Python)   │
                  └──────┬───────┘                 └────────────┘
        REST (events,    │      trigger_payout
        replay, labels)  │            │
                  ┌──────▼───────┐    ▼
                  │  Frontend    │ ◄──────► Solana program (devnet)
                  └──────────────┘  contribute, read pool state
```

There are three interfaces:

| Interface | Used for | Section |
|---|---|---|
| Frontend ↔ oracle service (REST) | Events, risk scores, replay, display labels | 3 |
| Oracle service ↔ classifier (REST, internal) | Scoring one event | 4 |
| Frontend and oracle ↔ Solana program | Money: contributions, pool state, payouts | 5 |

**Design decision:** the frontend reads pool state and contributions directly from the chain, not through the backend. The chain is the source of truth for anything involving money; the backend is the source of truth for earthquake events. This keeps the backend small and makes the "verifiable on-chain" claim true in the demo.

## 2. Conventions

- **Format:** JSON, `camelCase` keys, `Content-Type: application/json`.
- **Base URLs (local):** oracle service `http://localhost:3001/api`, classifier `http://localhost:8000`.
- **Amounts:** integer lamports (1 SOL = 1,000,000,000 lamports). Never send SOL as a decimal.
- **Risk score and threshold:** integer 0 to 100.
- **Shares:** basis points; all responders in a pool total 10,000.
- **Public keys and signatures:** base58 strings.
- **Timestamps:** ISO 8601 in UTC, for example `2026-10-03T18:42:10Z`.
- **Event IDs:** strings of at most 32 bytes, because the ID is used as a seed for the payout record's address and Solana caps each seed at 32 bytes.
- **CORS:** the oracle service allows the frontend's origin.

### Errors

Every error uses the same shape, with a matching HTTP status:

```json
{
  "error": {
    "code": "SCENARIO_NOT_FOUND",
    "message": "No replay scenario with id 'abc'."
  }
}
```

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_REQUEST` | Missing or malformed field |
| 404 | `EVENT_NOT_FOUND`, `SCENARIO_NOT_FOUND` | Unknown ID |
| 409 | `EVENT_ALREADY_PROCESSED` | Replay of an event ID that was already handled |
| 502 | `CLASSIFIER_UNAVAILABLE` | Classifier did not respond |
| 500 | `INTERNAL_ERROR` | Anything else |

## 3. Oracle service REST API (frontend ↔ backend)

### 3.1 Shared types

```ts
type EventStatus =
  | "scored"    // below threshold, no payout
  | "pending"   // payout transaction submitted, not yet confirmed
  | "paid"      // payout confirmed on-chain
  | "failed";   // scoring or payout failed; see failureReason

interface QuakeEvent {
  id: string;                 // USGS event ID, or a scenario ID for replays
  source: "live" | "replay";
  time: string;               // when the earthquake occurred
  processedAt: string;        // when the oracle scored it
  magnitude: number;
  depthKm: number;
  latitude: number;
  longitude: number;
  place: string;              // human-readable, from USGS
  riskScore: number | null;   // null only if scoring failed
  threshold: number;          // pool threshold at the time of scoring
  status: EventStatus;
  failureReason: string | null;
  payout: Payout | null;      // set when status is "pending" or "paid"
}

interface Payout {
  signature: string;          // transaction signature
  amountLamports: number;
  explorerUrl: string;
  confirmedAt: string | null; // null while pending
}
```

### 3.2 `GET /health`

Lets the frontend show whether the backend and its dependencies are up.

```json
{
  "status": "ok",
  "classifier": "ok",
  "solana": "ok",
  "lastFeedPollAt": "2026-10-03T18:42:00Z"
}
```

### 3.3 `GET /pool`

Returns what the frontend needs to find the pool on-chain, plus display data that is not stored on-chain (region name, map bounds, readable names for wallets).

```json
{
  "programId": "<base58>",
  "poolAddress": "<base58>",
  "vaultAddress": "<base58>",
  "cluster": "devnet",
  "region": {
    "id": 1,
    "name": "Example Coast",
    "bounds": { "minLat": 0, "maxLat": 0, "minLon": 0, "maxLon": 0 }
  },
  "labels": {
    "<wallet base58>": { "name": "Coastal Relief NGO", "role": "responder" },
    "<wallet base58>": { "name": "Regional Government", "role": "contributor" }
  }
}
```

### 3.4 `GET /events`

Returns in-region events, newest first. The frontend polls this every 3 to 5 seconds.

| Query param | Type | Default | Notes |
|---|---|---|---|
| `limit` | integer | 20 | Maximum 100 |
| `status` | `EventStatus` | none | Filter, for example `status=paid` for payout history |
| `since` | timestamp | none | Only events processed after this time |

```json
{
  "events": [
    {
      "id": "replay-major-01",
      "source": "replay",
      "time": "2011-03-11T05:46:24Z",
      "processedAt": "2026-10-03T18:42:10Z",
      "magnitude": 9.1,
      "depthKm": 29.0,
      "latitude": 38.297,
      "longitude": 142.373,
      "place": "near the east coast of Honshu, Japan",
      "riskScore": 97,
      "threshold": 70,
      "status": "paid",
      "failureReason": null,
      "payout": {
        "signature": "<base58>",
        "amountLamports": 2000000000,
        "explorerUrl": "https://explorer.solana.com/tx/<signature>?cluster=devnet",
        "confirmedAt": "2026-10-03T18:42:11Z"
      }
    }
  ]
}
```

### 3.5 `GET /events/:id`

Returns one `QuakeEvent`, or `404 EVENT_NOT_FOUND`.

### 3.6 `GET /replay/scenarios`

Lists the historical earthquakes available for the demo. Include at least one that scores below the threshold and one that scores above it.

```json
{
  "scenarios": [
    {
      "id": "replay-minor-01",
      "label": "Minor offshore quake",
      "magnitude": 4.8,
      "expectedOutcome": "no_payout"
    },
    {
      "id": "replay-major-01",
      "label": "Major subduction quake",
      "magnitude": 9.1,
      "expectedOutcome": "payout"
    }
  ]
}
```

### 3.7 `POST /replay`

Injects a scenario into the same pipeline as a live event.

Request:

```json
{ "scenarioId": "replay-major-01", "runId": "rehearsal-2" }
```

- `scenarioId` is required.
- `runId` is optional. When present, the event ID becomes `<scenarioId>-<runId>`. Without it, a second replay of the same scenario returns `409 EVENT_ALREADY_PROCESSED`, which is the double-payout protection working as intended. Use `runId` for rehearsals so you do not need a new pool each time, and keep the combined ID within 32 bytes.

Response: `202 Accepted` with the new `QuakeEvent` (usually `riskScore: null` at first, then updated). The frontend does not wait on this call; it sees the result through its normal polling of `GET /events`, so live and replayed events share one code path.

### 3.8 Stretch: `GET /events/stream`

Server-sent events that push each new or updated `QuakeEvent`, replacing polling. Only build this if everything else is done.

## 4. Classifier API (oracle service ↔ classifier, internal)

Not called by the frontend.

### `POST /score`

Request:

```json
{
  "eventId": "replay-major-01",
  "magnitude": 9.1,
  "depthKm": 29.0,
  "latitude": 38.297,
  "longitude": 142.373,
  "time": "2011-03-11T05:46:24Z"
}
```

Response:

```json
{
  "eventId": "replay-major-01",
  "riskScore": 97,
  "probability": 0.968,
  "modelVersion": "v1"
}
```

- `riskScore` is `round(probability * 100)`; this integer is what goes on-chain.
- The request fields above are a guess at what the model needs. Change them to match the model's actual features, and do it early, since the oracle is built around this shape.

### `GET /health`

```json
{ "status": "ok", "modelVersion": "v1" }
```

## 5. On-chain interface (Solana program)

The frontend and the oracle service both use the Anchor TypeScript client generated from the program's IDL. This section is the contract the program author builds to.

### 5.1 Instructions

| Instruction | Signer | Arguments | Called by |
|---|---|---|---|
| `initialize_pool` | Admin | `region_id: u16`, `threshold: u8`, `payout_cap_lamports: u64`, `oracle: Pubkey` | Setup script |
| `register_responder` | Admin | `wallet: Pubkey`, `share_bps: u16` | Setup script |
| `contribute` | Contributor | `amount_lamports: u64` | Frontend |
| `trigger_payout` | Oracle | `event_id: String`, `risk_score: u8` | Oracle service |

### 5.2 Accounts

Shapes as the Anchor client returns them (`u64` fields arrive as `BN`; convert before display).

```ts
interface Pool {
  admin: PublicKey;
  oracle: PublicKey;
  regionId: number;
  threshold: number;            // 0 to 100
  payoutCapLamports: BN;
  responders: { wallet: PublicKey; shareBps: number }[];  // max 5
  totalContributed: BN;
  totalPaidOut: BN;
}

interface Contribution {
  pool: PublicKey;
  contributor: PublicKey;
  amount: BN;                   // cumulative
}

interface PayoutRecord {
  pool: PublicKey;
  eventId: string;
  riskScore: number;
  amount: BN;
  timestamp: BN;                // Unix seconds
}
```

### 5.3 Account addresses (PDA seeds)

| Account | Seeds |
|---|---|
| Pool | `"pool"`, admin, region ID |
| Vault | `"vault"`, pool |
| Contribution | `"contribution"`, pool, contributor |
| Payout record | `"payout"`, pool, event ID |

### 5.4 Program errors

The frontend and oracle should map these to readable messages.

| Error | Raised when |
|---|---|
| `Unauthorized` | Signer is not the admin (registration) or not the oracle (payout) |
| `TooManyResponders` | Registering a sixth responder |
| `InvalidShares` | Shares do not total 10,000 at payout time |
| `BelowThreshold` | `risk_score` is under the pool's threshold |
| `InsufficientFunds` | Vault cannot pay and stay rent-exempt |
| `ZeroAmount` | Contribution of 0 lamports |

A repeated event ID needs no custom error: creating a payout record that already exists fails on its own.

## 6. Where the frontend gets each thing

| Dashboard element | Source |
|---|---|
| Pool balance | Chain: vault account balance |
| Threshold, responders, shares, totals | Chain: `Pool` account |
| Contributions list | Chain: all `Contribution` accounts for the pool |
| Names for wallets, region name, map bounds | Backend: `GET /pool` |
| Event feed with risk scores | Backend: `GET /events` |
| Payout history with explorer links | Backend: `GET /events?status=paid` (the backend holds the transaction signatures) |
| Contribute button | Chain: `contribute` instruction via the wallet |
| Replay control | Backend: `GET /replay/scenarios`, `POST /replay` |

## 7. Open questions

- Which fields does the classifier actually need?
- Does the backend persist events (a JSON file is enough) so a restart mid-demo does not lose payout signatures?
- Final program ID and pool address, once deployed.
