use anchor_lang::prelude::*;

use crate::{errors::ReliefPoolError, state::Responder};

pub fn handler(ctx: Context<RegisterResponder>, wallet: Pubkey, share_bps: u16) -> Result<()> {
    let responder = &mut ctx.accounts.responder;

    if share_bps == 0 {
        return err!(ReliefPoolError::InvalidShares);
    }

    responder.pool = ctx.accounts.pool.key();
    responder.wallet = wallet;
    responder.share_bps = share_bps;
    responder.active = true;

    Ok(())
}

#[derive(Accounts)]
pub struct RegisterResponder<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(mut)]
    pub pool: Account<'info, crate::state::Pool>,

    #[account(
        init,
        payer = admin,
        space = 8 + Responder::INIT_SPACE,
        seeds = [b"responder", pool.key().as_ref(), wallet.key().as_ref()],
        bump
    )]
    pub responder: Account<'info, Responder>,

    /// CHECK: responder wallet is explicit and validated by the program logic.
    pub wallet: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}
