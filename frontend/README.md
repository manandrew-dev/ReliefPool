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

| Variable           | Default                              | Meaning                                                                                                                                                                                |
| ------------------ | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_RPC_URL`     | `https://api.devnet.solana.com`      | Solana RPC endpoint. Must be devnet; the hostname has to contain `devnet` or the wrong-network banner shows.                                                                           |
| `VITE_ORACLE_URL`  | `http://localhost:3001/api`          | Oracle service REST API base URL                                                                                                                                                       |
| `VITE_ORACLE_MOCK` | on                                   | Serve oracle responses from fixtures and chain data from the matching mock chain. Only the exact value `false` turns this off, switching to the real oracle and the program on devnet. |
| `VITE_PROGRAM_ID`  | the address in `idl/reliefpool.json` | ReliefPool program on devnet (`7vBwrt8cAfrNHWNfCddQPRVdhbdKV8VhgP2xgq6qWsj3`). If `GET /pool` reports a different one, the wrong-network banner shows.                                 |

## Use the real oracle and program

1. Start the oracle service (see `backend/oracle/`) so it answers at `VITE_ORACLE_URL`, with CORS allowing `http://localhost:5173`.
2. In `.env`, set `VITE_ORACLE_MOCK=false`. This switches both the oracle and the chain data to the real services: the oracle fixtures hand out mock pool addresses that exist only in the mock chain, so the two are never mixed.
3. Restart `npm run dev`.

The header dot then reads `GET /health`:

- **Backend online** (green) when the classifier and Solana are both `"ok"`.
- An amber label naming anything down or mocked, for example **Backend: mock chain, payouts aren't real** when the oracle runs without a real chain.
- **Backend offline** (red) when the oracle doesn't answer within 5 s, or answers with a `status` other than `"ok"`.

The tooltip shows the classifier's model version and the last USGS poll ("No feed poll yet" until the first one). In mock mode the **Mock data** badge shows; its tooltip says what is mocked.

## What the dashboard handles from the spec

These follow `docs/api.md` v0.6, mostly the frontend list in section 8:

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

## Program client

The UI talks to the oracle only through `src/api/oracle.ts` and to the program only through `src/program/client.ts`, which picks the devnet client (`src/program/devnet.ts`) or the mock chain (`src/mocks/`).

`src/program/generated/` is a Kit client generated by Codama from `idl/reliefpool.json`. Don't edit it by hand; after the program's IDL changes, run:

```shell
npm run codegen
```

The Codama packages are pinned to the releases that generate code for `@solana/kit` 5, which `@solana/client` uses. Newer renderers target Kit 6 and later.

On devnet:

- **Reads:** `getPool` decodes the `Pool` account and checks that the ReliefPool program owns it. `getContributions` uses `getProgramAccounts` filtered by the `Contribution` size, discriminator and pool. Balances use `getBalance`.
- **Contribute:** builds the `contribute` instruction (the vault and contribution addresses are derived from the pool and the wallet) and simulates it first, so an error such as `ZeroAmount` or a wallet without enough SOL shows without a wallet prompt. The wallet then only signs (`createWalletTransactionSigner`, `mode === "partial"`), and the app sends through its own devnet RPC and polls until the transaction is confirmed. A wallet that can only send is refused, because it would send on whatever network it is set to.
- **Errors:** the program's custom error codes map to the names in `docs/api.md` section 5.4 (`src/program/transactionErrors.ts`), which `src/lib/errors.ts` turns into readable text.
