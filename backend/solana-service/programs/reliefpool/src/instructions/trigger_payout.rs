use anchor_lang::{
    prelude::*,
    solana_program::{program::invoke_signed, system_instruction},
};

use crate::{
    errors::ReliefPoolError,
    state::{PayoutRecord, Pool},
};

pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, TriggerPayout<'info>>,
    event_id: String,
    risk_score: u8,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    if risk_score < pool.threshold {
        return err!(ReliefPoolError::BelowThreshold);
    }

    if ctx.remaining_accounts.is_empty() {
        return err!(ReliefPoolError::InvalidShares);
    }

    if ctx.accounts.oracle.key() != pool.oracle {
        return err!(ReliefPoolError::Unauthorized);
    }

    let vault_info = ctx.accounts.vault.to_account_info();
    let vault_balance = vault_info.lamports();
    let payout_cap = pool.payout_cap_lamports;
    let total_payout = vault_balance.min(payout_cap);

    if total_payout == 0 {
        return err!(ReliefPoolError::InsufficientFunds);
    }

    if vault_balance < total_payout {
        return err!(ReliefPoolError::InsufficientFunds);
    }

    let recipient_count = ctx.remaining_accounts.len() as u64;
    if recipient_count == 0 {
        return err!(ReliefPoolError::InvalidShares);
    }

    let mut distributed = 0_u64;
    let mut payout_amounts = Vec::with_capacity(recipient_count as usize);

    for (index, recipient) in ctx.remaining_accounts.iter().enumerate() {
        let share = if index == recipient_count as usize - 1 {
            total_payout - distributed
        } else {
            total_payout / recipient_count
        };

        payout_amounts.push((recipient.key(), share));
        distributed += share;
    }

    let vault_bump = ctx.bumps.vault;
    let pool_key = pool.key();
    let signer_seeds: [&[u8]; 3] = [b"vault", pool_key.as_ref(), &[vault_bump]];

    for (recipient, amount) in payout_amounts {
        let recipient_account = ctx
            .remaining_accounts
            .iter()
            .find(|account| account.key() == recipient)
            .ok_or(ProgramError::InvalidAccountData)?;

        let transfer_ix = system_instruction::transfer(&vault_info.key(), &recipient, amount);
        let transfer_accounts = [
            vault_info.clone(),
            recipient_account.clone(),
            ctx.accounts.system_program.to_account_info(),
        ];

        invoke_signed(&transfer_ix, &transfer_accounts, &[&signer_seeds[..]])?;
    }

    let payout_record = &mut ctx.accounts.payout_record;
    payout_record.pool = pool.key();
    payout_record.event_id = event_id;
    payout_record.risk_score = risk_score;
    payout_record.amount = total_payout;
    payout_record.timestamp = Clock::get()?.unix_timestamp;

    pool.total_paid_out = pool
        .total_paid_out
        .checked_add(total_payout)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    msg!(
        "Distributed {} lamports from the vault to {} recipient wallet(s) for event {}.",
        total_payout,
        recipient_count,
        payout_record.event_id
    );

    Ok(())
}

#[derive(Accounts)]
#[instruction(event_id: String)]
pub struct TriggerPayout<'info> {
    #[account(mut)]
    pub oracle: Signer<'info>,

    #[account(mut)]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump
    )]
    pub vault: AccountInfo<'info>,

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
