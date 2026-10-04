use anchor_lang::{prelude::*, system_program};

use crate::{
    errors::ReliefPoolError,
    state::{Contribution, Pool, Vault},
};

pub fn handler(ctx: Context<Contribute>, amount_lamports: u64) -> Result<()> {
    require!(amount_lamports > 0, ReliefPoolError::ZeroAmount);

    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.contributor.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        amount_lamports,
    )?;

    let pool = &mut ctx.accounts.pool;
    pool.total_contributed = pool
        .total_contributed
        .checked_add(amount_lamports)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    let contribution = &mut ctx.accounts.contribution;
    contribution.pool = pool.key();
    contribution.contributor = ctx.accounts.contributor.key();
    contribution.amount = contribution
        .amount
        .checked_add(amount_lamports)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    Ok(())
}

#[derive(Accounts)]
pub struct Contribute<'info> {
    #[account(mut)]
    pub contributor: Signer<'info>,

    #[account(mut)]
    pub pool: Account<'info, Pool>,

    #[account(mut, seeds = [b"vault", pool.key().as_ref()], bump)]
    pub vault: Account<'info, Vault>,

    #[account(
        init_if_needed,
        payer = contributor,
        space = 8 + Contribution::INIT_SPACE,
        seeds = [b"contribution", pool.key().as_ref(), contributor.key().as_ref()],
        bump
    )]
    pub contribution: Account<'info, Contribution>,

    pub system_program: Program<'info, System>,
}
