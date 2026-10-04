use anchor_lang::prelude::*;

// Names from docs/api.md §5.4. The oracle shows them to users as failureReason,
// so keep them exactly as listed there.
#[error_code]
pub enum ReliefPoolError {
    #[msg("Signer is not the admin (registration) or not the oracle (payout).")]
    Unauthorized,
    #[msg("A pool has at most 5 responders.")]
    TooManyResponders,
    #[msg("Responder shares are invalid or do not total 10,000 basis points.")]
    InvalidShares,
    #[msg("The risk score is below the pool threshold.")]
    BelowThreshold,
    #[msg("The vault cannot pay anything and stay rent-exempt.")]
    InsufficientFunds,
    #[msg("Contribution amount must be greater than zero.")]
    ZeroAmount,
    #[msg("Threshold must be from 0 to 100.")]
    InvalidThreshold,
    #[msg("This wallet is already a responder in the pool.")]
    DuplicateResponder,
}
