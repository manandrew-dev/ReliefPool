# Running ReliefPool with Docker

中文版: [docker.zh.md](docker.zh.md)

Docker Compose runs the classifier, the oracle and the frontend. The Solana program is not containerized: it is already deployed on devnet (`docs/api.md` §5.6).

| Service | URL on the host | Image |
|---|---|---|
| Frontend | http://localhost:8080 | `frontend/Dockerfile`: Vite build served by nginx |
| Oracle | http://localhost:3001/api | `backend/oracle/Dockerfile` |
| Classifier | http://localhost:8000 | `backend/classifier/Dockerfile`, serving the committed `model-v1` artifact |

Requires Docker with Compose v2.17 or later (Docker Desktop includes it).

## Simulated chain (default)

```bash
docker compose up --build
```

Open http://localhost:8080. This needs no keys. The classifier is real; the oracle simulates the program (threshold 70, 0.1 SOL payouts, fake signatures), so replays and the payout flow work offline from Solana. The cards that read the chain show "Pool not deployed yet", because the simulated chain has no pool address.

## Real program on devnet

Needs the oracle keypair, which only the oracle owner has (`backend/oracle/oracle-keypair.json`, gitignored):

```bash
docker compose -f docker-compose.yml -f docker-compose.devnet.yml up --build
```

The keypair is mounted read-only into the oracle container and never copied into an image. Payouts are real devnet transactions from the demo pool's vault.

If the keypair file is missing, Compose stops with an error that names the path (`bind source path does not exist`). Save the key there and run the command again.

To use a keypair stored elsewhere, or another pool, set these in the shell or in a `.env` file at the repo root (gitignored):

| Variable | Default |
|---|---|
| `ORACLE_KEYPAIR` | `./backend/oracle/oracle-keypair.json` |
| `POOL_ADDRESS` | `5Mf43LGs8F95EE9Ucx2zNhTeC9eKDiYSP2VQZ22dckeV` |
| `RPC_URL` | `https://api.devnet.solana.com` |
| `POLL_ENABLED` | `true`. Set `false` to stop polling the USGS live feed, for example during a rehearsal |

## Things to know

- **The frontend's settings are baked in at build time.** Vite writes `VITE_*` values into the bundle, so they are build args in `docker-compose.yml`, not runtime env. After changing one, rebuild with `docker compose build frontend`.
- **The browser calls the oracle directly**, so `VITE_ORACLE_URL` is `http://localhost:3001/api` (the host port), not `http://oracle:3001`. If you change the oracle's published port or serve the page from another origin, change `VITE_ORACLE_URL` and the oracle's `CORS_ORIGIN` together.
- **Events persist** in the `oracle-data` volume: `events.json` for the simulated chain, `devnet-events.json` for devnet. `docker compose down -v` deletes them, which also resets the double-payout guard for replays without a fresh event ID.
- **Startup order:** the oracle waits for the classifier's health check, and the frontend waits for the oracle's.
- **IDL:** the oracle image copies `idl/reliefpool.json` from the repo root (the `idl` build context). Rebuild the oracle after the IDL changes.
