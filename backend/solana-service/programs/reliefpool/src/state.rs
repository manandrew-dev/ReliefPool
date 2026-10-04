use anchor_lang::prelude::*;

// Shapes from docs/api.md §5.2.

pub const MAX_RESPONDERS: usize = 5;
pub const TOTAL_SHARE_BPS: u16 = 10_000;
// Solana caps each PDA seed at 32 bytes, and the event ID seeds the payout record.
pub const MAX_EVENT_ID_BYTES: usize = 32;

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub admin: Pubkey,
    pub oracle: Pubkey,
    pub region_id: u16,
    pub threshold: u8,
    pub payout_cap_lamports: u64,
    #[max_len(MAX_RESPONDERS)]
    pub responders: Vec<ResponderShare>,
    pub total_contributed: u64,
    pub total_paid_out: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct ResponderShare {
    pub wallet: Pubkey,
    pub share_bps: u16,
}

// Holds the pool's SOL. Owned by the program, so only trigger_payout can move lamports out.
#[account]
#[derive(InitSpace)]
pub struct Vault {}

#[account]
#[derive(InitSpace)]
pub struct Contribution {
    pub pool: Pubkey,
    pub contributor: Pubkey,
    // Running total for this contributor.
    pub amount: u64,
}

#[account]
#[derive(InitSpace)]
pub struct PayoutRecord {
    pub pool: Pubkey,
    #[max_len(MAX_EVENT_ID_BYTES)]
    pub event_id: String,
    pub risk_score: u8,
    // Lamports actually sent to responders in total.
    pub amount: u64,
    pub timestamp: i64,
}
