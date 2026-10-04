# ReliefPool frontend

React + Vite + Tailwind dashboard for ReliefPool on Solana devnet. Wallet connection and chain access use `@solana/client` and `@solana/react-hooks` (built on `@solana/kit`). The contract with the backend and the program is [`docs/api.md`](../docs/api.md).

## Run it

Needs Node 20.19+ or 22.12+ (required by Vite 7).

```shell
cp .env.example .env   # then edit if needed
npm install
npm run dev            # http://localhost:5173
```

Other scripts:

| Script          | What it does                                 |
| --------------- | -------------------------------------------- |
| `npm run build` | Type check and production build into `dist/` |
| `npm run lint`  | ESLint                                       |
| `npm test`      | Vitest unit tests                            |
| `npm run ci`    | Build, lint, format check and tests          |

## Environment variables

Set in `.env` (gitignored; copy `.env.example`). Vite reads them at startup, so restart `npm run dev` after a change.

| Variable           | Default                            | Meaning                                                                            |
| ------------------ | ---------------------------------- | ---------------------------------------------------------------------------------- |
| `VITE_ORACLE_URL`  | `http://localhost:3001/api`        | Oracle service REST API base URL                                                   |
| `VITE_ORACLE_MOCK` | on                                 | Serve oracle responses from fixtures. Only the exact value `false` turns this off. |
| `VITE_PROGRAM_ID`  | `REPLACE_WITH_DEPLOYED_PROGRAM_ID` | ReliefPool program ID on devnet, once deployed                                     |

The Solana RPC endpoint is set in `src/providers.tsx` (`https://api.devnet.solana.com`).

## Use the real oracle service

1. Start the oracle service (see `backend/oracle/`) so it answers at `VITE_ORACLE_URL`, with CORS allowing `http://localhost:5173`.
2. In `.env`, set `VITE_ORACLE_MOCK=false`.
3. Restart `npm run dev`.

The header dot then shows **Backend online** (green) or **Backend offline** (red). The **Mock data** badge stays while the program client is still mocked; its tooltip says which source is mocked.

## Mock mode

- Mock state lives in memory (`src/mocks/`), so it resets to the fixtures on every page reload.
- A replayed payout stays **Payout pending** for about 3 seconds (`MOCK_CONFIRMATION_MS` in `src/api/oracle.ts`), then turns **Paid** on the next poll and moves money in the mock vault.
- Payouts follow the program's rule: the per-event cap, or less if the vault cannot cover it and stay rent-exempt. When nothing is left, the event fails with `InsufficientFunds`.
- Every mock wallet starts with 3 SOL.

## Swap-in checklist

The UI talks to the oracle only through `src/api/oracle.ts` and to the program only through `src/program/client.ts`. Swapping in real services changes those files and nothing else.

### `src/api/oracle.ts` (oracle service)

The real HTTP calls are already written; `VITE_ORACLE_MOCK=false` switches to them. The backend must:

| Function               | Endpoint                | The backend must                                                                                                                                                        |
| ---------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getHealth()`          | `GET /health`           | Return `status: "ok"` when healthy. Anything else, or no answer within 5 s, shows offline.                                                                              |
| `getPool()`            | `GET /pool`             | Return `poolAddress` and `vaultAddress` (the chain reads depend on them), `cluster: "devnet"`, the region, and wallet labels.                                           |
| `getEvents(query)`     | `GET /events`           | Return newest first and support `limit` (1 to 100), `status` and `since`. Polled every 4 s.                                                                             |
| `getReplayScenarios()` | `GET /replay/scenarios` | Include at least one scenario below the threshold and one above it, inside the pool's region.                                                                           |
| `postReplay(body)`     | `POST /replay`          | Score before responding and return `202` with the event as `scored`, `pending` or `failed` (section 3.7). Return `409 EVENT_ALREADY_PROCESSED` for a repeated event ID. |

All errors must use the shape in `docs/api.md` section 2.

### `src/program/client.ts` (Solana program)

Generate a Kit client with Codama from the program's committed IDL, then replace each mock body. Keep the exported signatures and types; on-chain values stay `Address` and `bigint`. Use the same devnet RPC as `src/providers.tsx`. Account seeds are in `docs/api.md` section 5.3.

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
