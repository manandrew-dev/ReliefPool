use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

pub use instructions::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod reliefpool {
    use super::*;

    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        region_id: u16,
        threshold: u8,
        payout_cap_lamports: u64,
        oracle: Pubkey,
    ) -> Result<()> {
        instructions::initialize_pool::handler(ctx, region_id, threshold, payout_cap_lamports, oracle)
    }

    pub fn register_responder(
        ctx: Context<RegisterResponder>,
        wallet: Pubkey,
        share_bps: u16,
    ) -> Result<()> {
        instructions::register_responder::handler(ctx, wallet, share_bps)
    }

    pub fn contribute(ctx: Context<Contribute>, amount: u64) -> Result<()> {
        instructions::contribute::handler(ctx, amount)
    }

    pub fn trigger_payout(ctx: Context<TriggerPayout>, event_id: String, risk_score: u8) -> Result<()> {
        instructions::trigger_payout::handler(ctx, event_id, risk_score)
    }
}
