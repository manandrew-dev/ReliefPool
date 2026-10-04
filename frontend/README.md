# ReliefPool frontend

React + Vite + Tailwind dashboard for ReliefPool on Solana devnet. Wallet connection and chain access use `@solana/client` and `@solana/react-hooks` (built on `@solana/kit`). The contract with the backend and the program is [`docs/api.md`](../docs/api.md).

## Run it

Needs Node 20.19+ or 22.12+ (required by Vite 7).

```shell
cp .env.example .env   # then edit if needed
npm install
npm run dev            # http://localhost:5173
```

The dev server always uses port 5173 (`strictPort` in `vite.config.ts`). If something else holds that port, `npm run dev` exits with an error instead of moving to another port. That's deliberate: the oracle's CORS allows only `http://localhost:5173` and `http://localhost:3000` by default (`docs/api.md` section 2), so a different port would fail every API call. Free the port, or add your origin to `CORS_ORIGIN` in the oracle's `.env`.

Other scripts:

| Script          | What it does                                 |
| --------------- | -------------------------------------------- |
| `npm run build` | Type check and production build into `dist/` |
| `npm run lint`  | ESLint                                       |
| `npm test`      | Vitest unit tests                            |
| `npm run ci`    | Build, lint, format check and tests          |

## Environment variables

Set in `.env` (gitignored; copy `.env.example`). Vite reads them at startup, so restart `npm run dev` after a change.

| Variable           | Default                            | Meaning                                                                                                      |
| ------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `VITE_RPC_URL`     | `https://api.devnet.solana.com`    | Solana RPC endpoint. Must be devnet; the hostname has to contain `devnet` or the wrong-network banner shows. |
| `VITE_ORACLE_URL`  | `http://localhost:3001/api`        | Oracle service REST API base URL                                                                             |
| `VITE_ORACLE_MOCK` | on                                 | Serve oracle responses from fixtures. Only the exact value `false` turns this off.                           |
| `VITE_PROGRAM_ID`  | `REPLACE_WITH_DEPLOYED_PROGRAM_ID` | ReliefPool program ID on devnet, once deployed                                                               |

## Use the real oracle service

1. Start the oracle service (see `backend/oracle/`) so it answers at `VITE_ORACLE_URL`, with CORS allowing `http://localhost:5173`.
2. In `.env`, set `VITE_ORACLE_MOCK=false`.
3. Restart `npm run dev`.

The header dot then reads `GET /health`:

- **Backend online** (green) when the classifier and Solana are both `"ok"`.
- An amber label naming anything down or mocked, for example **Backend: mock chain, payouts aren't real** when the oracle runs without a real chain.
- **Backend offline** (red) when the oracle doesn't answer within 5 s, or answers with a `status` other than `"ok"`.

The tooltip shows the classifier's model version and the last USGS poll ("No feed poll yet" until the first one). The **Mock data** badge stays while the program client is still mocked; its tooltip says which source is mocked.

## What the dashboard handles from the spec

These follow `docs/api.md` v0.4, mostly the frontend list in section 8:

- **Pending payouts** show an amber **Confirming…** badge and no amount, because `payout.amountLamports` is `0` until the payout confirms. Amounts appear only on `"paid"` events.
- **Failure reasons** are bare codes. Each code in section 3.1, and each program error name in section 5.4, is shown as readable text with the code beside it (`src/lib/errors.ts`). An unknown code is shown as it is.
- **Quakes below M5.0** have `riskScore` `0` and were never sent to the classifier, so they show **Below M5.0, not scored** instead of a risk bar.
- **Before deploy**, `GET /pool` returns `null` for `programId`, `poolAddress` and `vaultAddress`. The chain reads stay off and the pool cards show **Pool not deployed yet**, with Contribute disabled.
- **Replay scenario IDs** are read from `GET /replay/scenarios`, never hardcoded in the UI. Each replay gets a fresh run ID, and the combined event ID stays within 32 bytes (`src/lib/replay.ts`).
- **Map (FR-29):** the region box from `GET /pool` and the events from `GET /events`, drawn with Leaflet on OpenStreetMap tiles (the browser loads the tiles from `tile.openstreetmap.org`). Markers are coloured by status and sized by magnitude. Leaflet is lazy-loaded so it doesn't weigh on the first render.

## Mock mode

The mocks match the demo pool in `docs/api.md` section 5.6, so mock mode looks like the real demo:

- **Pool:** "Japan Pacific Coast" (latitude 30 to 46, longitude 135 to 150), threshold 70, a payout cap of 0.1 SOL, and responders Coastal Relief NGO (60%) and Harbor Rescue Network (40%).
- **Contributors:** Regional Government, Pacific Aid Fund and Community Donors, 0.5 SOL each. One 0.1 SOL payout for Tohoku is already made, so the vault starts at 1.4 SOL plus the rent-exempt minimum. Every mock wallet starts with 1 SOL.
- **Replay scenarios:** the four in section 3.6. `jp-2025-m48` (M4.8) isn't scored, `jp-2013-m69-deep` scores 59 (no payout), and `jp-2022-m73` and `tohoku-2011-m91` score 95 and 100 (payout), as in requirements section 13. Tohoku is already paid, so replaying it without a fresh run ID returns the 409.
- **Payout timing:** a replayed payout shows **Confirming…** for about 3 seconds (`MOCK_CONFIRMATION_MS` in `src/api/oracle.ts`), then turns **Paid** on the next poll and moves money in the mock vault.
- **Payout amount:** the cap, or less if the vault can't cover it and stay rent-exempt. When nothing is left, the event fails with `InsufficientFunds`.
- **Reset:** mock state lives in memory (`src/mocks/`), so it resets to the fixtures on every page reload.

## Swap-in checklist

The UI talks to the oracle only through `src/api/oracle.ts` and to the program only through `src/program/client.ts`. Swapping in real services changes those files and nothing else.

### `src/api/oracle.ts` (oracle service)

The real HTTP calls are already written; `VITE_ORACLE_MOCK=false` switches to them. The backend must:

| Function               | Endpoint                | The backend must                                                                                                                                                                                    |
| ---------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getHealth()`          | `GET /health`           | Return `status: "ok"` when reachable, `classifier` and `solana` as `"ok"`, `"down"` or `"mock"`, `classifierModelVersion`, and `lastFeedPollAt` (`null` before the first poll).                     |
| `getPool()`            | `GET /pool`             | Return `poolAddress` and `vaultAddress` (the chain reads depend on them, and `null` shows "Pool not deployed yet"), `cluster: "devnet"`, the region, and wallet labels (may be empty).              |
| `getEvents(query)`     | `GET /events`           | Return newest first and support `limit` (1 to 100), `status` and `since`. Polled every 4 s.                                                                                                         |
| `getReplayScenarios()` | `GET /replay/scenarios` | Include at least one scenario below the threshold and one above it, inside the pool's region.                                                                                                       |
| `postReplay(body)`     | `POST /replay`          | Score before responding and return `202` with the event as `scored`, `pending` (with `amountLamports` `0`) or `failed` (section 3.7). Return `409 EVENT_ALREADY_PROCESSED` for a repeated event ID. |

All errors must use the shape in `docs/api.md` section 2, and `failureReason` must be a bare code from section 3.1 or a program error name.

### `src/program/client.ts` (Solana program)

Generate a Kit client with Codama from the program's committed IDL, then replace each mock body. Keep the exported signatures and types; on-chain values stay `Address` and `bigint`. Use the same devnet RPC as `src/providers.tsx` (`VITE_RPC_URL`). Account seeds are in `docs/api.md` section 5.3.

| Export                                         | The real implementation must                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isMock`                                       | Become `false`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `getPool(poolAddress)`                         | Fetch and decode the `Pool` account at `poolAddress` (from `GET /pool`). Throw if it does not exist.                                                                                                                                                                                                                                                                                                                                                                            |
| `getContributions(poolAddress)`                | Fetch every `Contribution` account owned by `VITE_PROGRAM_ID` whose `pool` field equals `poolAddress` (`getProgramAccounts` filtered by the account discriminator and a memcmp on `pool`), decoded.                                                                                                                                                                                                                                                                             |
| `getVaultBalance(vaultAddress)`                | Return the lamport balance of the vault PDA (`["vault", pool]`) at `vaultAddress`.                                                                                                                                                                                                                                                                                                                                                                                              |
| `getWalletBalance(walletAddress)`              | Return the wallet's lamport balance. Used only for the Contribute warning; a failure must not block contributing.                                                                                                                                                                                                                                                                                                                                                               |
| `contribute(amountLamports, { pool, wallet })` | Build the `contribute` instruction with the pool, vault PDA, contribution PDA (`["contribution", pool, contributor]`), contributor and system program. Build the signer with `createWalletTransactionSigner(wallet)` from `@solana/client` and **require `mode === "partial"`**, so the wallet only signs and the app sends through its devnet RPC. Refuse `"send"` mode, where the wallet would send on whatever network it is set to. Resolve with the transaction signature. |
| `ProgramError`                                 | Map the program's custom error codes from the IDL to the `ProgramErrorCode` names in `docs/api.md` section 5.4, so `src/lib/errors.ts` shows readable messages.                                                                                                                                                                                                                                                                                                                 |

Then remove the `src/mocks/` imports from `src/program/client.ts`. After that, `src/mocks/` serves only the oracle's mock mode in `src/api/oracle.ts`.
