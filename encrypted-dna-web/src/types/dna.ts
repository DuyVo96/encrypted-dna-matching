// ─────────────────────────────────────────────────────────────────────────────
// DNA Types
// ─────────────────────────────────────────────────────────────────────────────

/** Nucleotide base values matching the on-chain encoding. */
export type Base = 0 | 1 | 2 | 3; // 0=A, 1=T, 2=G, 3=C
export const BASE_LABELS: Record<Base, string> = { 0: 'A', 1: 'T', 2: 'G', 3: 'C' };
export const BASE_COLORS: Record<Base, string> = {
  0: 'bg-dna-A text-black',
  1: 'bg-dna-T text-white',
  2: 'bg-dna-G text-black',
  3: 'bg-dna-C text-white',
};

/** Representative SNP loci shown in the UI (purely illustrative). */
export const SNP_LABELS = ['rs1801133', 'rs429358', 'rs7412', 'rs9939609'] as const;

export const MAX_DNA_LENGTH = 4;

// ─────────────────────────────────────────────────────────────────────────────
// Encrypted payload — produced by arciumDNAUtils.encryptDNA()
//
// All 4 markers share a single X25519 ephemeral keypair + RescueCipher nonce.
// The TEE decrypts all markers together using the shared key.
// ─────────────────────────────────────────────────────────────────────────────

export interface EncryptedDNA {
  encPubkey: number[]; // 32-byte X25519 ephemeral public key (shared by all markers)
  nonce: bigint;       // 128-bit RescueCipher nonce (shared by all markers)
  dnaCts: number[][];  // [MAX_DNA_LENGTH][32] — one ciphertext per marker
}

// ─────────────────────────────────────────────────────────────────────────────
// On-chain account types — parsed from raw bytes by solanaClient.ts
// ─────────────────────────────────────────────────────────────────────────────

export interface UserProfile {
  publicKey: string;        // PDA address (base58)
  owner: string;            // wallet address (base58)
  isRegistered: boolean;
  encPubkey: number[];      // [32] — shared X25519 ephemeral pubkey
  nonce: bigint;            // u128 — shared RescueCipher nonce
  dnaCts: number[][];       // [MAX_DNA_LENGTH][32]
}

export interface MatchResult {
  publicKey: string;
  userA: string;
  userB: string;
  encScore: number[];              // [32] — encrypted similarity score from TEE
  scoreNonce: number[];            // [16] — nonce for client-side decryption
  decryptedScore?: number;         // 0–100, set after client-side decryption
  isComputed: boolean;
  lastComputationOffset: bigint;
}

// ─────────────────────────────────────────────────────────────────────────────
// UI state
// ─────────────────────────────────────────────────────────────────────────────

export type AppStep = 'upload' | 'match' | 'result';

export type TxStatus = 'idle' | 'signing' | 'confirming' | 'success' | 'error';
