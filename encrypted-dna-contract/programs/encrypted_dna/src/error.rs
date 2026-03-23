use anchor_lang::prelude::*;

// The enum MUST be named `ErrorCode` — the arcium-macros crate generates
// `ErrorCode::ClusterNotSet` in its expanded code (see callback_accounts macro).
#[error_code]
pub enum ErrorCode {
    #[msg("User is not registered — call register_user first")]
    UserNotRegistered,

    #[msg("Cannot match a user with themselves")]
    SelfMatchNotAllowed,

    #[msg("The Arcium computation was aborted")]
    AbortedComputation,

    // Required by arcium-macros: callback_accounts generates ErrorCode::ClusterNotSet
    #[msg("Cluster not set on the MXE account")]
    ClusterNotSet,

    #[msg("Computation output is empty or malformed")]
    InvalidComputationOutput,
}
