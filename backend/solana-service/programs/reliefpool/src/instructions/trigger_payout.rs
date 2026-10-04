use anchor_lang::prelude::*;

use crate::{
    errors::ReliefPoolError,
    state::{PayoutRecord, Pool, Vault, TOTAL_SHARE_BPS},
};

// Pays min(cap, vault balance − rent-exempt minimum), split by share (docs/api.md §5.4–5.5).
// Responder wallets come in as writable remaining accounts, in Pool.responders order.
pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, TriggerPayout<'info>>,
    event_id: String,
    risk_score: u8,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    require!(risk_score >= pool.threshold, ReliefPoolError::BelowThreshold);

    let total_bps: u32 = pool.responders.iter().map(|r| r.share_bps as u32).sum();
    require!(total_bps == TOTAL_SHARE_BPS as u32, ReliefPoolError::InvalidShares);
    let wallets = ctx.remaining_accounts;
    require!(wallets.len() == pool.responders.len(), ReliefPoolError::InvalidShares);
    for (account, responder) in wallets.iter().zip(&pool.responders) {
        require!(
            account.key() == responder.wallet && account.is_writable,
            ReliefPoolError::InvalidShares
        );
    }

    let vault = ctx.accounts.vault.to_account_info();
    let rent_exempt = Rent::get()?.minimum_balance(vault.data_len());
    let available = vault.lamports().saturating_sub(rent_exempt);
    let amount = available.min(pool.payout_cap_lamports);
    require!(amount > 0, ReliefPoolError::InsufficientFunds);

    // Each responder gets amount × share / 10,000; rounding leftovers stay in the vault.
    let mut sent = 0_u64;
    for (account, responder) in wallets.iter().zip(&pool.responders) {
        let share = (amount as u128 * responder.share_bps as u128 / TOTAL_SHARE_BPS as u128) as u64;
        **vault.try_borrow_mut_lamports()? -= share;
        **account.try_borrow_mut_lamports()? += share;
        sent += share;
    }

    pool.total_paid_out = pool
        .total_paid_out
        .checked_add(sent)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    let record = &mut ctx.accounts.payout_record;
    record.pool = pool.key();
    record.event_id = event_id;
    record.risk_score = risk_score;
    record.amount = sent;
    record.timestamp = Clock::get()?.unix_timestamp;

    msg!("Paid {} lamports for event {}", sent, record.event_id);
    Ok(())
}

#[derive(Accounts)]
#[instruction(event_id: String)]
pub struct TriggerPayout<'info> {
    #[account(mut, address = pool.oracle @ ReliefPoolError::Unauthorized)]
    pub oracle: Signer<'info>,

    #[account(mut)]
    pub pool: Account<'info, Pool>,

    #[account(mut, seeds = [b"vault", pool.key().as_ref()], bump)]
    pub vault: Account<'info, Vault>,

    // init fails if the record exists, so an event ID can only be paid once. An event ID over
    // 32 bytes is rejected here too: Solana cannot derive an address from a seed that long.
    #[account(
        init,
        payer = oracle,
        space = 8 + PayoutRecord::INIT_SPACE,
        seeds = [b"payout", pool.key().as_ref(), event_id.as_bytes()],
        bump
    )]
    pub payout_record: Account<'info, PayoutRecord>,

    pub system_program: Program<'info, System>,
}
