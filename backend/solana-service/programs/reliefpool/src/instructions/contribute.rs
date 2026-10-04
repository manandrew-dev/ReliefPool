use anchor_lang::prelude::*;

use crate::{errors::ReliefPoolError, state::Contribution};

pub fn handler(ctx: Context<Contribute>, amount: u64) -> Result<()> {
    if amount == 0 {
        return err!(ReliefPoolError::ZeroAmount);
    }

    let pool = &mut ctx.accounts.pool;
    pool.total_contributed = pool
        .total_contributed
        .checked_add(amount)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    let contribution = &mut ctx.accounts.contribution;
    contribution.pool = pool.key();
    contribution.contributor = ctx.accounts.contributor.key();
    contribution.amount = amount;
    contribution.timestamp = Clock::get()?.unix_timestamp;

    Ok(())
}

#[derive(Accounts)]
pub struct Contribute<'info> {
    #[account(mut)]
    pub contributor: Signer<'info>,

    #[account(mut)]
    pub pool: Account<'info, crate::state::Pool>,

    #[account(
        init,
        payer = contributor,
        space = 8 + Contribution::INIT_SPACE,
        seeds = [b"contribution", pool.key().as_ref(), contributor.key().as_ref()],
        bump
    )]
    pub contribution: Account<'info, Contribution>,

    pub system_program: Program<'info, System>,
}
