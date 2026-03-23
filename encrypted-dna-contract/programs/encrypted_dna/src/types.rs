use anchor_lang::prelude::*;
use crate::constants::MAX_DNA_LENGTH;

// ─────────────────────────────────────────────────────────────────────────────
// UserProfile
// ─────────────────────────────────────────────────────────────────────────────

/// On-chain profile storing a user's *encrypted* DNA markers.
///
/// All four markers share a single X25519 ECDH key exchange:
///   1. Client generates one ephemeral X25519 keypair
///   2. ECDH with MXE public key → shared secret
///   3. RescueCipher(shared_secret).encrypt(marker[i], nonce) for each i
///
/// Raw DNA never touches the blockchain.
#[account]
pub struct UserProfile {
    pub owner: Pubkey,                          // 32
    pub is_registered: bool,                    // 1
    /// Ephemeral X25519 public key used for ECDH (shared by all markers).
    pub enc_pubkey: [u8; 32],                   // 32
    /// 128-bit RescueCipher nonce.
    pub nonce: u128,                            // 16
    /// Encrypted ciphertext for each marker.
    pub dna_cts: [[u8; 32]; MAX_DNA_LENGTH],    // 4 × 32 = 128
    pub bump: u8,                               // 1
}

impl UserProfile {
    pub const SIZE: usize = 8 + 32 + 1 + 32 + 16 + 32 * MAX_DNA_LENGTH + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// MatchResult
// ─────────────────────────────────────────────────────────────────────────────

/// Singleton PDA per (user_a, user_b) pair storing the latest similarity result.
///
/// The score is returned encrypted from the Arcium TEE (Enc<Shared, u8>).
/// Decrypt client-side: X25519(requester_ephemeral_privkey, MXE_pubkey)
///   → shared_secret → RescueCipher(shared_secret).decrypt(enc_score, score_nonce)
#[account]
pub struct MatchResult {
    pub user_a: Pubkey,                         // 32
    pub user_b: Pubkey,                         // 32
    /// Encrypted similarity score (RescueCipher output, 32 bytes).
    pub enc_score: [u8; 32],                    // 32
    /// Nonce for decryption (16-byte LE u128).
    pub score_nonce: [u8; 16],                  // 16
    pub is_computed: bool,                      // 1
    pub last_computation_offset: u64,           // 8
    pub bump: u8,                               // 1
}

impl MatchResult {
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 16 + 1 + 8 + 1;
}
