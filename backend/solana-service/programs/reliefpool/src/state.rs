use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub admin: Pubkey,
    pub oracle: Pubkey,
    pub region_id: u16,
    pub threshold: u8,
    pub payout_cap_lamports: u64,
    pub total_contributed: u64,
    pub total_paid_out: u64,
    pub responder_count: u8,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Responder {
    pub pool: Pubkey,
    pub wallet: Pubkey,
    pub share_bps: u16,
    pub active: bool,
}

#[account]
#[derive(InitSpace)]
pub struct Contribution {
    pub pool: Pubkey,
    pub contributor: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[account]
#[derive(InitSpace)]
pub struct PayoutRecord {
    pub pool: Pubkey,
    #[max_len(64)]
    pub event_id: String,
    pub risk_score: u8,
    pub amount: u64,
    pub timestamp: i64,
}
