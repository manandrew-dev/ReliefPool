use anchor_lang::prelude::*;

use crate::state::Pool;

pub fn handler(
    ctx: Context<InitializePool>,
    region_id: u16,
    threshold: u8,
    payout_cap_lamports: u64,
    oracle: Pubkey,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    pool.admin = ctx.accounts.admin.key();
    pool.oracle = oracle;
    pool.region_id = region_id;
    pool.threshold = threshold;
    pool.payout_cap_lamports = payout_cap_lamports;
    pool.total_contributed = 0;
    pool.total_paid_out = 0;
    pool.responder_count = 0;
    pool.bump = ctx.bumps.pool;

    Ok(())
}

#[derive(Accounts)]
#[instruction(region_id: u16, threshold: u8, payout_cap_lamports: u64, oracle: Pubkey)]
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

    /// CHECK: vault PDA is created and managed by the program after the pool is initialized.
    #[account(mut)]
    pub vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}
