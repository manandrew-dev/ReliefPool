use anchor_lang::prelude::*;

use crate::{
    errors::ReliefPoolError,
    state::{Pool, ResponderShare, MAX_RESPONDERS, TOTAL_SHARE_BPS},
};

pub fn handler(ctx: Context<RegisterResponder>, wallet: Pubkey, share_bps: u16) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    require!(pool.responders.len() < MAX_RESPONDERS, ReliefPoolError::TooManyResponders);
    require!(
        pool.responders.iter().all(|r| r.wallet != wallet),
        ReliefPoolError::DuplicateResponder
    );
    let total: u32 = pool.responders.iter().map(|r| r.share_bps as u32).sum::<u32>() + share_bps as u32;
    require!(
        share_bps > 0 && total <= TOTAL_SHARE_BPS as u32,
        ReliefPoolError::InvalidShares
    );

    pool.responders.push(ResponderShare { wallet, share_bps });
    Ok(())
}

#[derive(Accounts)]
pub struct RegisterResponder<'info> {
    pub admin: Signer<'info>,

    #[account(mut, has_one = admin @ ReliefPoolError::Unauthorized)]
    pub pool: Account<'info, Pool>,
}
