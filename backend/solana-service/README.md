# ReliefPool program

Anchor 0.30.1 program for the pool, contributions and payouts. Interface: [docs/api.md §5](../../docs/api.md#5-on-chain-interface-solana-program). 中文：[README.zh.md](README.zh.md).

## Toolchain

- Rust stable, plus `nightly-2025-04-15` (Anchor 0.30.1 builds the IDL with it): `rustup toolchain install nightly-2025-04-15`
- Solana CLI 3.1.10: `sh -c "$(curl -sSfL https://release.anza.xyz/v3.1.10/install)"`
- Anchor CLI 0.30.1, built with Rust 1.79 (newer compilers fail on the `time` crate):
  `cargo +1.79.0 install --git https://github.com/coral-xyz/anchor --tag v0.30.1 anchor-cli --locked`
- `proc-macro2` is pinned to 1.0.94 in `Cargo.lock`; newer versions break Anchor 0.30.1. Do not `cargo update` it.

## Build, test, deploy

```bash
npm install
./scripts/build.sh                 # program + IDL; copies the IDL and types to idl/ at the repo root
anchor test --skip-build           # 19 tests on a local validator (Anchor.toml targets Localnet)
./scripts/deploy-devnet.sh         # needs the program keypair, see below
npx tsx scripts/setup-demo-pool.ts # demo pool from demo-pool.json, on devnet by default
```

- **Program keypair:** the address in `declare_id!` belongs to `~/.config/solana/reliefpool-program-keypair.json`, held by Khan. Only that keypair can deploy or upgrade the program. Never commit it.
- **Setup script:** initializes the pool, registers the responders in order, and makes each contribution; a step already done is skipped, so it is safe to rerun. Responder and contributor keypairs are generated in `~/.config/solana/reliefpool-demo/` (outside the repo). A contributor without enough SOL is skipped with its address printed; fund it and run again. At the end it prints the values for `backend/oracle/.env` and the `labels` for `backend/oracle/pool.config.json`.
- Env for the setup script: `RPC_URL` (default devnet), `ADMIN_KEYPAIR` (default `~/.config/solana/id.json`), `WALLET_DIR`.

## Design notes

The original implementation plan follows.

### ReliefPool Anchor Service Implementation Plan

## Goal

Build a Solana Anchor program in `backend/solana-service` that handles payouts for ReliefPool events. When the ReliefPool Oracle Service calls `trigger_payout`, the program should transfer lamports from the pool vault (funded by the local government or other funder) to registered responder wallets in the correct share proportions.

This implementation should follow the contract already described in the repo documentation, especially the shapes in [docs/api.md](../../docs/api.md) and the oracle flow in [docs/oracle-plan.md](../../docs/oracle-plan.md).

## Core design decision

Use the pool vault as the source of funds, not a mutable funder wallet directly in the payout instruction.

Why this is better:
- It keeps the payment source explicit and auditable.
- It keeps payout authorization separated from funding authority.
- It reduces the chance of a malicious or accidental direct transfer from a government wallet.
- It matches the standard vault/PDA pattern used in crowdfunding and treasury apps.

In practice:
- The government or funder contributes to the Pool vault before the payout event.
- `trigger_payout` verifies that the event meets the threshold, is not a duplicate, and is authorized by the oracle.
- If valid, the program transfers lamports from the vault to responder wallets according to the configured share allocations.

---

## Recommended project structure

```text
backend/solana-service/
  Anchor.toml
  programs/
    reliefpool/
      src/
        lib.rs
        state.rs
        errors.rs
        instructions/
          mod.rs
          initialize_pool.rs
          register_responder.rs
          contribute.rs
          trigger_payout.rs
        utils.rs
      tests/
        initialize_pool.rs
        trigger_payout.rs
        share_distribution.rs
  app/
    src/
      index.ts
      client.ts
      config.ts
  scripts/
    deploy-local.sh
    seed-devnet.sh
```

This keeps the on-chain logic isolated from the client tooling and makes tests easier to run independently.

---

## On-chain state model

Define a small, explicit set of account structs:

### Pool
- `admin: Pubkey`
- `oracle: Pubkey`
- `region_id: u16`
- `threshold: u8`
- `payout_cap_lamports: u64`
- `total_contributed: u64`
- `total_paid_out: u64`
- `responder_count: u8`
- `bump: u8`

### Responder
- `pool: Pubkey`
- `wallet: Pubkey`
- `share_bps: u16`
- `active: bool`

### Contribution
- `pool: Pubkey`
- `contributor: Pubkey`
- `amount: u64`
- `timestamp: i64`

### PayoutRecord
- `pool: Pubkey`
- `event_id: String`
- `risk_score: u8`
- `amount: u64`
- `timestamp: i64`

Use PDA seeds consistent with the repo contract:
- Pool: `"pool", admin, region_id`
- Vault: `"vault", pool`
- Contribution: `"contribution", pool, contributor`
- PayoutRecord: `"payout", pool, event_id`

---

## Suggested instructions

### 1) `initialize_pool`
Purpose: set up the pool, vault, and oracle authorization.

Inputs:
- `region_id`
- `threshold`
- `payout_cap_lamports`
- `oracle`

Checks:
- `admin` is signer
- `oracle` is valid
- pool does not already exist
- vault is initialized with rent-exempt lamports logic

Good practice:
- Use `#[account(mut)]` for the vault and pool accounts.
- Keep the instruction narrow and single-purpose.

### 2) `register_responder`
Purpose: allow admin to register wallets eligible for payouts.

Inputs:
- `wallet`
- `share_bps`

Checks:
- `admin` signer
- responder count under max (e.g., 5)
- `share_bps > 0`
- no duplicate wallet
- `shares_total` can still sum correctly at payout time

Good practice:
- Store an explicit `active` flag rather than deleting records in-place.
- Validate at payout time that all active responders sum to 10,000 basis points.

### 3) `contribute`
Purpose: let the government or other funder deposit funds into the vault.

Inputs:
- `amount`

Checks:
- `amount > 0`
- source wallet has enough lamports
- contribution record is created or updated

Good practice:
- Only transfer from the contributor account into the vault PDA via `system_program::transfer`.
- Avoid allowing arbitrary tokens or custom token logic unless required.

### 4) `trigger_payout`
Purpose: execute a payout when the oracle confirms a high-risk event.

Inputs:
- `event_id`
- `risk_score`

Account pattern:
- `pool`
- `vault`
- `oracle` signer
- `payout_record` PDA
- each responder account in `remaining_accounts` or a fixed list if the responder count is small

Checks:
- oracle signer is authorized
- `risk_score >= pool.threshold`
- event id has not already been paid
- payout record does not already exist
- responders are valid and `share_bps` total is 10,000
- vault balance is sufficient to distribute without breaking rent exemption
- payout amount is within `payout_cap_lamports` if the product requires cap enforcement

Payout flow:
1. derive payout total for the event
2. calculate each responder share from `share_bps`
3. transfer lamports from the vault to each responder wallet
4. write a `PayoutRecord` with the event id, timestamp, risk score, and amount
5. update pool totals

Important: prefer a single vault-to-wallet transfer pattern to minimize reentrancy and state complexity.

---

## Recommended payout algorithm

Use a deterministic, share-based distribution.

For each responder:
- `share_lamports = floor(total_payout_lamports * share_bps / 10_000)`
- Redistribute the remainder to the last responder or a designated lead responder to avoid rounding drift.

Example:
- total payout: 1_000_000_000 lamports
- shares: 6000, 2500, 1500
- payouts: 600_000_000, 250_000_000, 150_000_000

This is easy to test and explain to auditors and users.

---

## Security and risk controls

Follow these checks before moving to production:

### Authorization
- Only the `admin` can initialize and register responders.
- Only the configured `oracle` can trigger payouts.
- Oracle public key must be known and fixed at pool initialization.

### Duplicate prevention
- Prevent re-triggering the same event via the `PayoutRecord` PDA.
- Add a second guard in the off-chain oracle app so it does not call the instruction twice.

### Arithmetic safety
- Use checked arithmetic (`checked_add`, `checked_sub`, `checked_mul`) for lamports and shares.
- Reject invalid share totals.

### Fund safety
- Always ensure vault rent-exempt status is preserved after payout.
- Never transfer more than the vault balance minus rent floor.
- Require a clear cap or maximum payout rule for emergency events.

### Account validation
- Use `constraint = oracle.key() == pool.oracle` where appropriate.
- Validate responder wallets from the stored list, not from untrusted arbitrary accounts.
- Restrict `remaining_accounts` to a known set if possible.

### Error handling
- Define descriptive Anchor custom errors:
  - `Unauthorized`
  - `DuplicatePayout`
  - `BelowThreshold`
  - `InvalidShares`
  - `TooManyResponders`
  - `InsufficientFunds`
  - `ZeroAmount`

This gives the oracle service stable, readable errors that can be mapped to the frontend or API.

---

## Good engineering practices

### 1) Keep business logic explicit
Use one clear inflow and one clear payout path:
- funding happens via `contribute`
- payout happens via `trigger_payout`

Do not mix direct wallet-to-wallet transfers into the same instruction unless there is a strong reason.

### 2) Prefer deterministic state transitions
Avoid hidden side effects. Each instruction should update state in a straightforward order:
1. validate accounts
2. validate business conditions
3. transfer lamports
4. write on-chain state
5. emit event or record

### 3) Write tests before implementation
The minimum test set should include:
- initialize pool success
- admin rejects unauthorized setup
- valid responder registration
- invalid share sum rejected
- contribute zero amount rejected
- low-risk event rejected at threshold
- high-risk event triggers payout
- duplicate event id rejected
- insufficient vault funds rejected
- payout record written correctly

### 4) Keep client code separate from on-chain logic
The Anchor program should stay minimal and secure. The JS/TS client should handle:
- IDL loading
- PDA derivation
- amount conversion to/from lamports
- retry and confirmation handling

### 5) Use a small, auditable contract surface
Do not add extra features before the payout flow works and is tested.

---

## Implementation phases

### Phase 1: contract skeleton
- initialize Anchor project
- create `Pool`, `Responder`, `Contribution`, `PayoutRecord`
- scaffold instruction files and error enums
- verify build and compile with `anchor build`

### Phase 2: funding and setup logic
- implement `initialize_pool`
- implement `contribute`
- implement `register_responder`
- add tests for admin authorization and contribution validation

### Phase 3: payout logic
- implement `trigger_payout`
- validate oracle signer and threshold
- enforce duplicate event id prevention
- calculate share totals and transfer from vault
- persist payout record

### Phase 4: hardening and integration
- add edge-case tests for insufficient funds, zero amount, invalid shares, duplicate payouts
- connect with the ReliefPool Oracle Service
- validate account list and signer flow against the actual expected oracle transaction
- deploy to localnet or devnet

### Phase 5: observability and release readiness
- add `anchor test` coverage
- add README and deployment notes
- ensure `.env` and keypair files are never committed
- confirm funded government wallet and responder wallet addresses are valid in preprod

---

## Suggested validation checklist

Before marking the program ready:
- `anchor build` passes
- `anchor test` passes
- all custom errors map to the documented behavior
- event IDs are unique per payout
- threshold enforcement is correct
- share percentages sum to 10,000
- duplicate payouts cannot occur
- vault balance remains solvent after each payout
- the oracle service can call the instruction using the correct account list and signer

---

## Devnet deployment workflow

For actual end-to-end verification, run the program on Solana devnet instead of trying to keep everything local. This avoids the local wallet and toolchain mismatch issues that usually block Anchor testing in a small workstation setup.

### 1) Create or confirm a devnet wallet

```bash
solana config set --url devnet
solana-keygen new --outfile ~/.config/solana/id.json --no-bip39-passphrase --force
solana airdrop 2
```

### 2) Generate a fresh program keypair and sync it

```bash
cd backend/solana-service
mkdir -p scripts
solana-keygen new --outfile target/deploy/reliefpool-keypair.json --no-bip39-passphrase --force
anchor keys sync
anchor build
```

### 3) Deploy the program

```bash
anchor deploy --provider.cluster devnet
```

This writes a real program ID that can be copied into the Oracle service env values:

```bash
solana address -k target/deploy/reliefpool-keypair.json
```

### 4) Wire the oracle service to the deployed program

Set these values in the Oracle environment:

```bash
RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=<deployed-program-id>
POOL_ADDRESS=<pool-pda-or-address>
VAULT_ADDRESS=<vault-pda-or-address>
ORACLE_KEYPAIR_PATH=./oracle-keypair.json
PORT=3001
RESPONDER_WALLETS=<comma-separated responder wallet list>
```

### 5) Run the oracle service

```bash
cd backend/oracle
npm install
npm run build
npm start
```

Then call the trigger endpoint with a real `eventId` and `riskScore` to validate live payout behavior on devnet.

## Recommended next step

Start by scaffolding the Anchor program and implementing the `initialize_pool` + `register_responder` + `contribute` instructions first. After those pass tests, implement `trigger_payout` and only then wire the oracle service to it. This order keeps the funding and authorization model correct before adding the more sensitive payout logic.

This is the safest path to a maintainable, production-friendly ReliefPool payout flow.
