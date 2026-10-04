# ReliefPool Anchor Service Implementation Plan

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

## Recommended next step

Start by scaffolding the Anchor program and implementing the `initialize_pool` + `register_responder` + `contribute` instructions first. After those pass tests, implement `trigger_payout` and only then wire the oracle service to it. This order keeps the funding and authorization model correct before adding the more sensitive payout logic.

This is the safest path to a maintainable, production-friendly ReliefPool payout flow.
