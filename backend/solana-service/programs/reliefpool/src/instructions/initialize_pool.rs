use anchor_lang::prelude::*;

use crate::{
    errors::ReliefPoolError,
    state::{Pool, Vault},
};

pub fn handler(
    ctx: Context<InitializePool>,
    region_id: u16,
    threshold: u8,
    payout_cap_lamports: u64,
    oracle: Pubkey,
) -> Result<()> {
    require!(threshold <= 100, ReliefPoolError::InvalidThreshold);

    let pool = &mut ctx.accounts.pool;
    pool.admin = ctx.accounts.admin.key();
    pool.oracle = oracle;
    pool.region_id = region_id;
    pool.threshold = threshold;
    pool.payout_cap_lamports = payout_cap_lamports;
    pool.responders = Vec::new();
    pool.total_contributed = 0;
    pool.total_paid_out = 0;
    pool.bump = ctx.bumps.pool;

    Ok(())
}

#[derive(Accounts)]
#[instruction(region_id: u16)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + Pool::INIT_SPACE,
        seeds = [b"pool", admin.key().as_ref(), &region_id.to_le_bytes()],
        bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        init,
        payer = admin,
        space = 8 + Vault::INIT_SPACE,
        seeds = [b"vault", pool.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,

    pub system_program: Program<'info, System>,
}
