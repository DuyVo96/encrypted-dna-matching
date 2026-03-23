use anchor_lang::prelude::*;

#[event]
pub struct UserRegistered {
    pub user: Pubkey,
}

#[event]
pub struct DnaUpdated {
    pub user: Pubkey,
}

#[event]
pub struct MatchRequested {
    pub requester: Pubkey,
    pub user_a: Pubkey,
    pub user_b: Pubkey,
    pub computation_offset: u64,
}

/// Emitted when the Arcium TEE delivers the similarity result.
/// The score is returned as an encrypted ciphertext (Enc<Shared, u8>).
/// Decrypt with: X25519(requester_ephemeral_privkey, MXE_pubkey) → RescueCipher.decrypt(enc_score, score_nonce)
#[event]
pub struct MatchCompleted {
    pub user_a: Pubkey,
    pub user_b: Pubkey,
    /// Encrypted similarity score ciphertext (RescueCipher output).
    pub enc_score: [u8; 32],
    /// Nonce for decryption (16-byte LE representation of u128).
    pub score_nonce: [u8; 16],
}
