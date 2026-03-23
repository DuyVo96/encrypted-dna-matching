/**
 * setup_devnet.mjs
 *
 * One-time devnet setup script for Encrypted DNA Matching.
 * Calls init_dna_comp_def using the Anchor IDL + @arcium-hq/client.
 *
 * Usage: node setup_devnet.mjs
 */

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import web3pkg from '@solana/web3.js';
const { Connection, Keypair, PublicKey } = web3pkg;
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import {
  getMXEAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getArciumProgramId,
  getLookupTableAddress,
  getArciumProgram,
} from '@arcium-hq/client';

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: '.env.local' });

// ─────────────────────────────────────────────────────────────────────────────
const PROGRAM_ID   = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID);
const RPC_URL      = process.env.NEXT_PUBLIC_RPC_URL;
const KEYPAIR_PATH = join(homedir(), '.config', 'solana', 'id.json');
const CIRCUIT_NAME = 'dna_match_v2';

// Address Lookup Table program
const LUT_PROGRAM_ID = new PublicKey('AddressLookupTab1e1111111111111111111111111');
// ─────────────────────────────────────────────────────────────────────────────

function loadKeypair(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return Keypair.fromSecretKey(new Uint8Array(raw));
}

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Encrypted DNA Matching — Devnet Setup');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Program ID  : ${PROGRAM_ID.toBase58()}`);
  console.log(`  RPC         : ${RPC_URL}`);
  console.log(`  Circuit     : ${CIRCUIT_NAME}`);
  console.log('');

  const connection = new Connection(RPC_URL, 'confirmed');
  const payer      = loadKeypair(KEYPAIR_PATH);

  console.log(`  Payer       : ${payer.publicKey.toBase58()}`);
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`  Balance     : ${(balance / 1e9).toFixed(4)} SOL`);
  if (balance < 0.2e9) {
    console.error('\n  ❌ Insufficient balance. Run: solana airdrop 2 --url devnet');
    process.exit(1);
  }

  // ── Derive core accounts ──────────────────────────────────────────────────
  const mxeAccount    = getMXEAccAddress(PROGRAM_ID);
  const compDefOffset = Buffer.from(getCompDefAccOffset(CIRCUIT_NAME)).readUInt32LE(0);
  const compDefAcct   = getCompDefAccAddress(PROGRAM_ID, compDefOffset);
  const arciumProgram = getArciumProgramId();

  // ── Derive address_lookup_table ───────────────────────────────────────────
  // Read lut_offset_slot from the MXE account (at byte offset 8 + 32 = 40, 8 bytes LE u64)
  const mxeAccountInfo = await connection.getAccountInfo(mxeAccount);
  if (!mxeAccountInfo) {
    console.error('\n  ❌ MXE account not found. Run: arcium init-mxe first.');
    process.exit(1);
  }
  // MXEAccount layout (after 8-byte discriminator):
  //   authority: Pubkey (32)       @ 8
  //   callback_program: Pubkey(32) @ 40
  //   cluster: Option<u32> (5)     @ 72
  //   lut_offset_slot: u64         @ 77
  const lutOffsetSlot = mxeAccountInfo.data.readBigUInt64LE(255);
  const { default: BN } = await import('bn.js');
  const lutPda = getLookupTableAddress(PROGRAM_ID, new BN(lutOffsetSlot.toString()));

  console.log('');
  console.log('  Derived accounts:');
  console.log(`    mxe_account           : ${mxeAccount.toBase58()}`);
  console.log(`    comp_def_account      : ${compDefAcct.toBase58()}`);
  console.log(`    address_lookup_table  : ${lutPda.toBase58()}`);
  console.log(`    arcium_program        : ${arciumProgram.toBase58()}`);
  console.log('');

  // ── Check if comp_def already exists ─────────────────────────────────────
  const existing = await connection.getAccountInfo(compDefAcct);
  if (existing) {
    console.log('  ✅ Computation definition already initialized — nothing to do.');
    return;
  }

  // ── Load program IDL and build instruction ────────────────────────────────
  console.log('  Initializing DNA computation definition…');

  const idlPath = join(__dirname, '..', 'encrypted-dna-contract', 'target', 'idl', 'encrypted_dna.json');
  const idl = JSON.parse(readFileSync(idlPath, 'utf8'));

  const wallet   = new Wallet(payer);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const program  = new Program(idl, provider);

  // Simulate first
  let simResult;
  try {
    simResult = await program.methods
      .initDnaCompDef()
      .accounts({
        payer:               payer.publicKey,
        mxeAccount,
        compDefAccount:      compDefAcct,
        addressLookupTable:  lutPda,
        lutProgram:          LUT_PROGRAM_ID,
        arciumProgram,
        systemProgram:       web3pkg.SystemProgram.programId,
      })
      .simulate();
  } catch (err) {
    console.error('\n  ❌ Simulation failed:', err.message ?? err);
    if (err.logs) console.error('  Logs:\n', err.logs.join('\n'));
    process.exit(1);
  }

  const sig = await program.methods
    .initDnaCompDef()
    .accounts({
      payer:               payer.publicKey,
      mxeAccount,
      compDefAccount:      compDefAcct,
      addressLookupTable:  lutPda,
      lutProgram:          LUT_PROGRAM_ID,
      arciumProgram,
      systemProgram:       web3pkg.SystemProgram.programId,
    })
    .rpc({ commitment: 'confirmed' });

  console.log(`  ✅ Computation definition initialized!`);
  console.log(`     Signature: ${sig}`);
  console.log(`     Explorer : https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  console.log('');
  console.log('  Setup complete. You can now run the frontend:');
  console.log('    npm run dev');
  console.log('');
}

main().catch((err) => {
  console.error('\n  ❌ Setup failed:', err.message ?? err);
  process.exit(1);
});
