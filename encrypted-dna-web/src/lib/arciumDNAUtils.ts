/**
 * arciumDNAUtils.ts
 *
 * Client-side encryption and transaction-building for Encrypted DNA Matching.
 *
 * Privacy model:
 *   - Raw DNA values (Base 0-3) are encrypted on the client using a single
 *     X25519 ECDH keypair against the live MXE public key + RescueCipher
 *     symmetric encryption. All 4 markers share one ephemeral key + nonce.
 *   - The ephemeral private key is saved to localStorage so the encrypted
 *     score can be decrypted by user_a after the TEE callback completes.
 *   - The Arcium MXE (running inside a hardware TEE) is the only entity that
 *     ever decrypts the markers, computes similarity, and returns only the
 *     aggregate score. Neither the blockchain nor any observer sees raw DNA.
 */

import {
  x25519,
  RescueCipher,
  deserializeLE,
  getMXEPublicKey,
  getMXEAccAddress,
  getMempoolAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  getClusterAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getFeePoolAccAddress,
  getClockAccAddress,
  getArciumProgramId,
} from '@arcium-hq/client';
import * as anchor from '@coral-xyz/anchor';
import { PublicKey, Transaction, TransactionInstruction, AccountMeta, SystemProgram } from '@solana/web3.js';
import type { EncryptedDNA, Base } from '@/types/dna';
import { MAX_DNA_LENGTH } from '@/types/dna';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CLUSTER_OFFSET = 456;
const MATCH_CIRCUIT_NAME = 'dna_match_v2';

// Anchor instruction discriminators — sha256("global:<name>")[0..8] (from IDL)
const IX_REGISTER_USER = Buffer.from([2,  241, 150, 223, 99,  214, 116, 97 ]);
const IX_UPDATE_DNA    = Buffer.from([40, 130, 183, 221, 244, 164, 66,  186]);
const IX_REQUEST_MATCH = Buffer.from([238, 15, 134, 69,  73,  79,  210, 175]);

// sign_pda seed = "ArciumSignerAccount" bytes (from IDL)
const SIGN_PDA_SEED = Buffer.from([
  65,114,99,105,117,109,83,105,103,110,101,114,65,99,99,111,117,110,116,
]);

// ─────────────────────────────────────────────────────────────────────────────
// MXE Key — cached after first successful fetch
// ─────────────────────────────────────────────────────────────────────────────

let cachedMXEKey: Uint8Array | null = null;

async function getMXEKey(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
): Promise<Uint8Array> {
  if (cachedMXEKey) return cachedMXEKey;

  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const key = await getMXEPublicKey(provider, programId);
      if (key !== null) {
        cachedMXEKey = key;
        return key;
      }
    } catch (err) {
      console.warn(`getMXEPublicKey attempt ${attempt} failed:`, err);
    }
    if (attempt < 10) await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    'MXE X25519 key not available yet — the MXE may not be finalized. ' +
      'Run: arcium finalize-mxe-keys <program_id> --cluster-offset 456',
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// encryptDNA — single ephemeral key for all markers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derives a deterministic X25519 private key from a wallet signature.
 * The key is always recoverable from the same wallet + programId, regardless
 * of browser, domain, or localStorage state.
 */
export async function deriveEphemeralKey(
  signMessage: (msg: Uint8Array) => Promise<Uint8Array>,
  programId: PublicKey,
): Promise<Uint8Array> {
  const msg = new TextEncoder().encode(
    `arcium:dna:ephemeral:v1:${programId.toBase58()}`,
  );
  const sig = await signMessage(msg);
  // Ed25519 signature is 64 bytes — use first 32 bytes as x25519 private key
  return sig.slice(0, 32);
}

/**
 * Encrypts 4 DNA markers using one X25519 ephemeral keypair + RescueCipher.
 * If privKey is provided (derived from wallet signature), uses it instead of
 * a random key, making decryption recoverable across domains.
 */
export async function encryptDNA(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  markers: Base[],
  privKey?: Uint8Array,
): Promise<{ enc: EncryptedDNA; ephemeralPrivKey: Uint8Array }> {
  const mxeKey = await getMXEKey(provider, programId);

  const ephemeralPrivKey = privKey ?? x25519.utils.randomPrivateKey();
  const ephemeralPubKey  = x25519.getPublicKey(ephemeralPrivKey);
  const sharedSecret     = x25519.getSharedSecret(ephemeralPrivKey, mxeKey);

  const cipher     = new RescueCipher(sharedSecret);
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));

  // Pad to MAX_DNA_LENGTH with zeros if needed
  const values = Array.from({ length: MAX_DNA_LENGTH }, (_, i) =>
    BigInt(i < markers.length ? markers[i] : 0),
  );

  const encrypted = cipher.encrypt(values, nonceBytes);

  const enc: EncryptedDNA = {
    encPubkey: Array.from(ephemeralPubKey),
    nonce: deserializeLE(nonceBytes),
    dnaCts: encrypted.map((ct) => Array.from(ct)),
  };

  return { enc, ephemeralPrivKey };
}

// ─────────────────────────────────────────────────────────────────────────────
// decryptScore — client-side score decryption
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decrypts the TEE-returned enc_score using user_a's stored ephemeral key.
 * The score is encrypted with markers_a.owner's shared key (same key used to
 * encrypt the markers), so only user_a can decrypt it.
 */
export async function decryptScore(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  encScore: number[],
  scoreNonce: number[],
  ephemeralPrivKey: Uint8Array,
): Promise<number> {
  const mxeKey       = await getMXEKey(provider, programId);
  const sharedSecret = x25519.getSharedSecret(ephemeralPrivKey, mxeKey);
  const cipher       = new RescueCipher(sharedSecret);
  const nonceBytes   = Uint8Array.from(scoreNonce);
  // encScore is number[] (same shape as encrypt output); cast bypasses strict typing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const decrypted    = (cipher as any).decrypt([encScore], nonceBytes) as bigint[];
  return Number(decrypted[0]);
}

// ─────────────────────────────────────────────────────────────────────────────
// localStorage key for ephemeral private key
// ─────────────────────────────────────────────────────────────────────────────

export function storageKeyForWallet(walletAddress: string): string {
  return `dna_ephemeral_${walletAddress}`;
}

export function saveEphemeralKey(walletAddress: string, privKey: Uint8Array): void {
  try {
    localStorage.setItem(storageKeyForWallet(walletAddress), JSON.stringify(Array.from(privKey)));
  } catch {
    // localStorage unavailable (SSR) — silently ignore
  }
}

export function loadEphemeralKey(walletAddress: string): Uint8Array | null {
  try {
    const raw = localStorage.getItem(storageKeyForWallet(walletAddress));
    if (!raw) return null;
    return Uint8Array.from(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveDNAMarkers(walletAddress: string, markers: number[]): void {
  try {
    localStorage.setItem(`dna_markers_${walletAddress}`, JSON.stringify(markers));
  } catch {}
}

export function loadDNAMarkers(walletAddress: string): number[] | null {
  try {
    const raw = localStorage.getItem(`dna_markers_${walletAddress}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PDA derivation helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getUserProfilePDA(programId: PublicKey, owner: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('user_profile'), owner.toBuffer()],
    programId,
  );
  return pda;
}

export function getMatchResultPDA(
  programId: PublicKey,
  userA: PublicKey,
  userB: PublicKey,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('match_result'), userA.toBuffer(), userB.toBuffer()],
    programId,
  );
  return pda;
}

function getSignPdaAddress(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([SIGN_PDA_SEED], programId);
  return pda;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildRegisterUserTx
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encrypts DNA client-side and submits register_user on-chain.
 * Uses wallet signMessage to derive a deterministic ephemeral key so the
 * score can be decrypted from any domain/browser.
 *
 * Instruction layout: [8-disc][32 enc_pubkey][16 nonce LE][4×32 dna_cts]
 */
export async function buildRegisterUserTx(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  owner: PublicKey,
  markers: Base[],
  signMessage: (msg: Uint8Array) => Promise<Uint8Array>,
): Promise<string> {
  // If the account already exists (e.g. from an older contract layout),
  // fall back to update_dna so the user isn't stuck.
  const userProfilePDA = getUserProfilePDA(programId, owner);
  const existing = await provider.connection.getAccountInfo(userProfilePDA);
  if (existing) {
    console.warn('UserProfile PDA already exists — using update_dna instead of register_user.');
    return buildUpdateDnaTx(provider, programId, owner, markers, signMessage);
  }

  const ephemeralPrivKey = await deriveEphemeralKey(signMessage, programId);
  const { enc } = await encryptDNA(provider, programId, markers, ephemeralPrivKey);

  const nonceBN  = new anchor.BN(enc.nonce.toString());
  const pkBuf    = Buffer.from(enc.encPubkey);
  const nonceBuf = nonceBN.toArrayLike(Buffer, 'le', 16);
  const ctBuf    = Buffer.concat(enc.dnaCts.map((ct) => Buffer.from(ct)));
  const data = Buffer.concat([IX_REGISTER_USER, pkBuf, nonceBuf, ctBuf]);

  const keys: AccountMeta[] = [
    { pubkey: owner,          isSigner: true,  isWritable: true  },
    { pubkey: userProfilePDA, isSigner: false, isWritable: true  },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  const ix = new TransactionInstruction({ programId, keys, data });
  const { blockhash } = await provider.connection.getLatestBlockhash();
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner }).add(ix);

  const sim = await provider.connection.simulateTransaction(tx);
  if (sim.value.err) {
    const logs = sim.value.logs ?? [];
    const msg  = logs.find((l) => l.includes('Error Message:'))
              ?? logs.find((l) => l.includes('AnchorError'))
              ?? logs.find((l) => l.includes('Program log:'))
              ?? JSON.stringify(sim.value.err);
    console.error('register_user simulation logs:\n', logs.join('\n'));
    throw new Error(msg);
  }

  return provider.sendAndConfirm(tx, [], { commitment: 'confirmed' });
}

// ─────────────────────────────────────────────────────────────────────────────
// buildUpdateDnaTx
// ─────────────────────────────────────────────────────────────────────────────

export async function buildUpdateDnaTx(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  owner: PublicKey,
  markers: Base[],
  signMessage: (msg: Uint8Array) => Promise<Uint8Array>,
): Promise<string> {
  const ephemeralPrivKey = await deriveEphemeralKey(signMessage, programId);
  const { enc } = await encryptDNA(provider, programId, markers, ephemeralPrivKey);

  const userProfilePDA = getUserProfilePDA(programId, owner);

  const nonceBN  = new anchor.BN(enc.nonce.toString());
  const pkBuf    = Buffer.from(enc.encPubkey);
  const nonceBuf = nonceBN.toArrayLike(Buffer, 'le', 16);
  const ctBuf    = Buffer.concat(enc.dnaCts.map((ct) => Buffer.from(ct)));
  const data = Buffer.concat([IX_UPDATE_DNA, pkBuf, nonceBuf, ctBuf]);

  const keys: AccountMeta[] = [
    { pubkey: owner,          isSigner: true,  isWritable: true  },
    { pubkey: userProfilePDA, isSigner: false, isWritable: true  },
  ];

  const ix = new TransactionInstruction({ programId, keys, data });
  const { blockhash } = await provider.connection.getLatestBlockhash();
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner }).add(ix);

  const sim = await provider.connection.simulateTransaction(tx);
  if (sim.value.err) {
    const logs = sim.value.logs ?? [];
    const msg  = logs.find((l) => l.includes('Error Message:'))
              ?? logs.find((l) => l.includes('AnchorError'))
              ?? logs.find((l) => l.includes('Program log:'))
              ?? JSON.stringify(sim.value.err);
    console.error('update_dna simulation logs:\n', logs.join('\n'));
    throw new Error(msg);
  }

  return provider.sendAndConfirm(tx, [], { commitment: 'confirmed' });
}

// ─────────────────────────────────────────────────────────────────────────────
// buildRequestMatchTx
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Queues a DNA similarity computation in Arcium.
 *
 * Account order matches the IDL exactly:
 *   requester, user_profile_a, user_profile_b, match_result, sign_pda_account,
 *   mxe_account, mempool_account, executing_pool, computation_account,
 *   comp_def_account, cluster_account, pool_account, clock_account,
 *   system_program, arcium_program
 */
export async function buildRequestMatchTx(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  requester: PublicKey,
  userAKey: PublicKey,
  userBKey: PublicKey,
  computationOffset: bigint,
): Promise<string> {
  const arciumProgram  = getArciumProgramId();
  const userProfileA   = getUserProfilePDA(programId, userAKey);
  const userProfileB   = getUserProfilePDA(programId, userBKey);
  const matchResultPDA = getMatchResultPDA(programId, userAKey, userBKey);
  const signPda        = getSignPdaAddress(programId);

  const mxeAccount    = getMXEAccAddress(programId);
  const mempoolAcct   = getMempoolAccAddress(CLUSTER_OFFSET);
  const executingPool = getExecutingPoolAccAddress(CLUSTER_OFFSET);
  const clusterAcct   = getClusterAccAddress(CLUSTER_OFFSET);
  const compDefOffset = Buffer.from(getCompDefAccOffset(MATCH_CIRCUIT_NAME)).readUInt32LE(0);
  const compDefAcct   = getCompDefAccAddress(programId, compDefOffset);
  const compAcct      = getComputationAccAddress(CLUSTER_OFFSET, new anchor.BN(computationOffset.toString()));
  const feePool       = getFeePoolAccAddress();
  const clockAcct     = getClockAccAddress();

  const offsetBuf = Buffer.alloc(8);
  offsetBuf.writeBigUInt64LE(computationOffset);
  const data = Buffer.concat([IX_REQUEST_MATCH, offsetBuf]);

  const keys: AccountMeta[] = [
    { pubkey: requester,     isSigner: true,  isWritable: true  },
    { pubkey: userProfileA,  isSigner: false, isWritable: false },
    { pubkey: userProfileB,  isSigner: false, isWritable: false },
    { pubkey: matchResultPDA, isSigner: false, isWritable: true },
    { pubkey: signPda,       isSigner: false, isWritable: true  },
    { pubkey: mxeAccount,    isSigner: false, isWritable: false },
    { pubkey: mempoolAcct,   isSigner: false, isWritable: true  },
    { pubkey: executingPool, isSigner: false, isWritable: true  },
    { pubkey: compAcct,      isSigner: false, isWritable: true  },
    { pubkey: compDefAcct,   isSigner: false, isWritable: false },
    { pubkey: clusterAcct,   isSigner: false, isWritable: true  },
    { pubkey: feePool,       isSigner: false, isWritable: true  },
    { pubkey: clockAcct,     isSigner: false, isWritable: true  },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: arciumProgram, isSigner: false, isWritable: false },
  ];

  const ix = new TransactionInstruction({ programId, keys, data });
  const { blockhash } = await provider.connection.getLatestBlockhash();
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: requester }).add(ix);

  const sim = await provider.connection.simulateTransaction(tx);
  if (sim.value.err) {
    const msg = sim.value.logs?.find((l) => l.includes('Error Message:'));
    throw new Error(msg ?? JSON.stringify(sim.value.err));
  }

  return provider.sendAndConfirm(tx, [], { commitment: 'confirmed' });
}

/** Returns a unique computation offset based on the current timestamp + random bits. */
export function generateComputationOffset(): bigint {
  const ts  = BigInt(Date.now());
  const rnd = BigInt(Math.floor(Math.random() * 0xffff));
  return (ts << 16n) | rnd;
}
