/**
 * solanaClient.ts
 *
 * All Solana account reads for Encrypted DNA Matching.
 *
 * Pattern: raw byte parsing via getProgramAccounts + memcmp discriminator
 * filter.  No IDL-based deserialization is used to avoid needing a pre-built
 * IDL on the frontend.
 *
 * Discriminator formula: sha256("account:AccountName")[0..8]
 */

import { Connection, PublicKey } from '@solana/web3.js';
import type { MatchResult, UserProfile } from '@/types/dna';
import { getUserProfilePDA, getMatchResultPDA } from './arciumDNAUtils';
import { MAX_DNA_LENGTH } from '@/types/dna';

const bs58 = require('bs58') as { encode: (buf: Uint8Array) => string };

// ─────────────────────────────────────────────────────────────────────────────
// Anchor discriminators — sha256("account:<Name>")[0..8]
// ─────────────────────────────────────────────────────────────────────────────

const DISC_USER_PROFILE = Buffer.from([32,  37,  119, 205, 179, 180, 13,  194]);
const DISC_MATCH_RESULT = Buffer.from([234, 166, 33,  250, 153, 92,  223, 196]);

// ─────────────────────────────────────────────────────────────────────────────
// UserProfile parser
//
// Layout (after 8-byte discriminator):
//   owner:          32 bytes  (PublicKey)
//   is_registered:   1 byte   (bool)
//   enc_pubkey:     32 bytes  ([u8;32])
//   nonce:          16 bytes  (u128 LE)
//   dna_cts:       128 bytes  (4 × [u8;32])
//   bump:            1 byte
//   Total data:    210 bytes  (+8 disc = 218)
// ─────────────────────────────────────────────────────────────────────────────

function parseUserProfile(pubkey: PublicKey, data: Buffer): UserProfile {
  let off = 8;

  const owner        = new PublicKey(data.slice(off, off + 32)).toBase58(); off += 32;
  const isRegistered = data[off] === 1;                                     off += 1;

  const encPubkey = Array.from(data.slice(off, off + 32)); off += 32;

  const lo    = data.readBigUInt64LE(off);
  const hi    = data.readBigUInt64LE(off + 8);
  const nonce = lo | (hi << 64n);
  off += 16;

  const dnaCts: number[][] = [];
  for (let i = 0; i < MAX_DNA_LENGTH; i++) {
    dnaCts.push(Array.from(data.slice(off, off + 32)));
    off += 32;
  }

  return { publicKey: pubkey.toBase58(), owner, isRegistered, encPubkey, nonce, dnaCts };
}

// ─────────────────────────────────────────────────────────────────────────────
// MatchResult parser
//
// Layout (after 8-byte discriminator):
//   user_a:                    32 bytes
//   user_b:                    32 bytes
//   enc_score:                 32 bytes  ([u8;32])
//   score_nonce:               16 bytes  ([u8;16])
//   is_computed:                1 byte
//   last_computation_offset:    8 bytes  (u64 LE)
//   bump:                       1 byte
//   Total data:               122 bytes  (+8 disc = 130)
// ─────────────────────────────────────────────────────────────────────────────

function parseMatchResult(pubkey: PublicKey, data: Buffer): MatchResult {
  let off = 8;

  const userA                 = new PublicKey(data.slice(off, off + 32)).toBase58(); off += 32;
  const userB                 = new PublicKey(data.slice(off, off + 32)).toBase58(); off += 32;
  const encScore              = Array.from(data.slice(off, off + 32));               off += 32;
  const scoreNonce            = Array.from(data.slice(off, off + 16));               off += 16;
  const isComputed            = data[off] === 1;                                     off += 1;
  const lastComputationOffset = data.readBigUInt64LE(off);

  return { publicKey: pubkey.toBase58(), userA, userB, encScore, scoreNonce, isComputed, lastComputationOffset };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public fetch functions
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch a single user's profile by wallet address. Returns null if not registered. */
export async function fetchUserProfile(
  connection: Connection,
  programId: PublicKey,
  owner: PublicKey,
): Promise<UserProfile | null> {
  const pda  = getUserProfilePDA(programId, owner);
  const info = await connection.getAccountInfo(pda);
  if (!info || info.data.length < 8) return null;

  const disc = Buffer.from(info.data.slice(0, 8));
  if (!disc.equals(DISC_USER_PROFILE)) return null;

  return parseUserProfile(pda, Buffer.from(info.data));
}

/** Fetch all UserProfile accounts for the program. */
export async function fetchAllProfiles(
  connection: Connection,
  programId: PublicKey,
): Promise<UserProfile[]> {
  const accounts = await connection.getProgramAccounts(programId, {
    filters: [{ memcmp: { offset: 0, bytes: bs58.encode(DISC_USER_PROFILE) } }],
  });

  return accounts
    .filter((a) => a.account.data.length >= 8)
    .map((a) => parseUserProfile(a.pubkey, Buffer.from(a.account.data)));
}

/** Fetch all MatchResult accounts. Optionally filter by one party's address. */
export async function fetchMatchResults(
  connection: Connection,
  programId: PublicKey,
  filterByUser?: PublicKey,
): Promise<MatchResult[]> {
  const baseFilter = { memcmp: { offset: 0, bytes: bs58.encode(DISC_MATCH_RESULT) } };

  const [asAAccounts, asBAccounts] = await Promise.all([
    connection.getProgramAccounts(programId, {
      filters: filterByUser
        ? [baseFilter, { memcmp: { offset: 8, bytes: filterByUser.toBase58() } }]
        : [baseFilter],
    }),
    filterByUser
      ? connection.getProgramAccounts(programId, {
          filters: [baseFilter, { memcmp: { offset: 40, bytes: filterByUser.toBase58() } }],
        })
      : Promise.resolve([]),
  ]);

  const seen = new Set<string>();
  const results: MatchResult[] = [];
  for (const a of [...asAAccounts, ...asBAccounts]) {
    if (seen.has(a.pubkey.toBase58()) || a.account.data.length < 8) continue;
    seen.add(a.pubkey.toBase58());
    results.push(parseMatchResult(a.pubkey, Buffer.from(a.account.data)));
  }
  return results;
}

/** Fetch a specific MatchResult for a (userA, userB) pair. */
export async function fetchMatchResult(
  connection: Connection,
  programId: PublicKey,
  userA: PublicKey,
  userB: PublicKey,
): Promise<MatchResult | null> {
  const pda  = getMatchResultPDA(programId, userA, userB);
  const info = await connection.getAccountInfo(pda);
  if (!info || info.data.length < 8) return null;

  const disc = Buffer.from(info.data.slice(0, 8));
  if (!disc.equals(DISC_MATCH_RESULT)) return null;

  return parseMatchResult(pda, Buffer.from(info.data));
}

/** Poll a MatchResult until is_computed = true, then resolve. */
export async function pollMatchResult(
  connection: Connection,
  programId: PublicKey,
  userA: PublicKey,
  userB: PublicKey,
  intervalMs = 3000,
  timeoutMs = 300_000,
): Promise<MatchResult> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await fetchMatchResult(connection, programId, userA, userB);
    if (result?.isComputed) return result;
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(
    'Timed out waiting for Arcium computation. The TEE may be busy — check back later.',
  );
}
