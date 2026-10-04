use anchor_lang::prelude::*;

#[error_code]
pub enum ReliefPoolError {
    #[msg("Only the configured admin can perform this action.")]
    Unauthorized,
    #[msg("The event payout has already been recorded.")]
    DuplicatePayout,
    #[msg("The provided risk score is below the pool threshold.")]
    BelowThreshold,
    #[msg("Responder allocations must sum to 10,000 basis points.")]
    InvalidShares,
    #[msg("Too many responders have been registered.")]
    TooManyResponders,
    #[msg("The vault does not have enough lamports to complete the payout.")]
    InsufficientFunds,
    #[msg("Contribution amount must be greater than zero.")]
    ZeroAmount,
}
