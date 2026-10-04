use anchor_lang::prelude::*;

use crate::{errors::ReliefPoolError, state::PayoutRecord};

pub fn handler(ctx: Context<TriggerPayout>, event_id: String, risk_score: u8) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    if risk_score < pool.threshold {
        return err!(ReliefPoolError::BelowThreshold);
    }

    let payout_record = &mut ctx.accounts.payout_record;
    payout_record.pool = pool.key();
    payout_record.event_id = event_id;
    payout_record.risk_score = risk_score;
    payout_record.amount = 0;
    payout_record.timestamp = Clock::get()?.unix_timestamp;

    msg!("Payout trigger received. Actual transfer logic and responder share distribution should be implemented here.");

    Ok(())
}

#[derive(Accounts)]
#[instruction(event_id: String)]
pub struct TriggerPayout<'info> {
    #[account(mut)]
    pub oracle: Signer<'info>,

    #[account(mut)]
    pub pool: Account<'info, crate::state::Pool>,

    #[account(mut)]
    /// CHECK: vault PDA used as the source of outbound transfers.
    pub vault: UncheckedAccount<'info>,

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
