'use client';

import { useState, useCallback, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { motion } from 'framer-motion';
import { Lock, Shuffle, Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useDnaStore } from '@/store/dnaStore';
import { buildRegisterUserTx, buildUpdateDnaTx, saveDNAMarkers, loadDNAMarkers } from '@/lib/arciumDNAUtils';
import { fetchUserProfile } from '@/lib/solanaClient';
import { BASE_LABELS, BASE_COLORS, SNP_LABELS, MAX_DNA_LENGTH } from '@/types/dna';
import type { Base } from '@/types/dna';

const COMPLEMENT: Record<Base, Base> = { 0: 1, 1: 0, 2: 3, 3: 2 }; // A↔T, G↔C
const BASE_GLOW: Record<Base, string> = { 0: 'base-A', 1: 'base-T', 2: 'base-G', 3: 'base-C' };
const BASE_BORDER: Record<Base, string> = {
  0: 'border-dna-A/60', 1: 'border-dna-T/60', 2: 'border-dna-G/60', 3: 'border-dna-C/60',
};

interface DNAUploadPanelProps {
  programId: PublicKey;
}

const BASES: Base[] = [0, 1, 2, 3];

export function DNAUploadPanel({ programId }: DNAUploadPanelProps) {
  const { connection } = useConnection();
  const { publicKey, signTransaction, signAllTransactions } = useWallet();

  const {
    dnaInput,
    myProfile,
    registerStatus,
    setDnaInput,
    setRegisterStatus,
    setMyProfile,
    setCurrentStep,
    setError,
  } = useDnaStore();

  const [txSig, setTxSig] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Load saved markers from localStorage when returning to this panel
  useEffect(() => {
    if (!publicKey) return;
    const saved = loadDNAMarkers(publicKey.toBase58());
    if (saved && saved.length === MAX_DNA_LENGTH) {
      setDnaInput(saved as Base[]);
    }
  }, [publicKey, setDnaInput]);

  const randomize = useCallback(() => {
    const random = Array.from({ length: MAX_DNA_LENGTH }, () =>
      Math.floor(Math.random() * 4) as Base,
    );
    setDnaInput(random);
  }, [setDnaInput]);

  const handleMarkerChange = (idx: number, value: Base) => {
    const next = [...dnaInput] as Base[];
    next[idx] = value;
    setDnaInput(next);
  };

  const handleSubmit = async () => {
    if (!publicKey || !signTransaction || !signAllTransactions) return;

    setRegisterStatus('signing');
    setError(null);

    try {
      const provider = new anchor.AnchorProvider(
        connection,
        { publicKey, signTransaction, signAllTransactions } as anchor.Wallet,
        { commitment: 'confirmed' },
      );

      const isUpdate = myProfile?.isRegistered ?? false;
      const sig = isUpdate
        ? await buildUpdateDnaTx(provider, programId, publicKey, dnaInput)
        : await buildRegisterUserTx(provider, programId, publicKey, dnaInput);

      setTxSig(sig);
      setRegisterStatus('success');
      saveDNAMarkers(publicKey.toBase58(), dnaInput);
      setIsEditing(false);

      // Refresh profile
      const updated = await fetchUserProfile(connection, programId, publicKey);
      setMyProfile(updated);

      // Advance to match step after a short delay
      setTimeout(() => setCurrentStep('match'), 1500);
    } catch (err: any) {
      console.error('Register error:', err);
      setError(err.message ?? 'Transaction failed');
      setRegisterStatus('error');
    }
  };

  const isLoading = registerStatus === 'signing' || registerStatus === 'confirming';
  const isSuccess = registerStatus === 'success';
  const isRegistered = myProfile?.isRegistered ?? false;
  // Show read-only view when registered and not explicitly editing
  const isViewMode = isRegistered && !isEditing && !isSuccess;

  if (!publicKey) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-dao-text-muted">
        <Lock size={40} className="text-dao-primary opacity-60" />
        <p className="text-lg">Connect your wallet to get started</p>
        <p className="text-sm">
          Your DNA will be encrypted client-side before any blockchain interaction.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Panel header */}
      <div className="p-6 rounded-2xl border border-dao-border bg-dao-surface">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-dao-primary flex items-center justify-center text-sm font-bold">
              1
            </span>
            {isViewMode ? 'My DNA Profile' : isRegistered ? 'Update DNA Profile' : 'Register DNA Profile'}
          </h2>
          {isRegistered && (
            <span className="flex items-center gap-1 text-xs text-dao-yes border border-dao-yes/30 px-2 py-1 rounded-full">
              <CheckCircle size={12} />
              Registered
            </span>
          )}
        </div>
        <p className="text-sm text-dao-text-muted">
          {isViewMode
            ? 'Your registered SNP markers. Raw values are stored encrypted — only you can see this.'
            : 'Select your SNP markers below. Each value is encrypted with X25519 ECDH + RescueCipher in your browser before the transaction is submitted.'}
        </p>
      </div>

      {/* VIEW MODE — show registered DNA read-only */}
      {isViewMode ? (
        <div className="space-y-4">
          <div className="p-6 rounded-2xl border border-dao-yes/20 bg-dao-yes/5 space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-xs text-dao-yes font-mono tracking-wider">REGISTERED SEQUENCE</p>
              <span className="text-xs text-dao-text-muted font-mono">on-chain · encrypted</span>
            </div>
            <DNALadder bases={dnaInput} />
          </div>

          {/* On-chain ciphertext proof */}
          {myProfile && (
            <div className="p-4 rounded-xl border border-dao-border bg-dao-surface-2 text-xs font-mono space-y-1">
              <p className="text-dao-primary/80 mb-2 tracking-wider">ON-CHAIN PAYLOAD</p>
              <p className="text-dao-text-muted">
                <span className="text-dao-primary/70">enc_pubkey</span>:{' '}
                {Buffer.from(myProfile.encPubkey).toString('hex').slice(0, 24)}…
              </p>
              <p className="text-dao-text-muted">
                <span className="text-dao-primary/70">nonce</span>:{' '}
                {myProfile.nonce.toString(16).slice(0, 24)}…
              </p>
              {myProfile.dnaCts.map((ct, i) => (
                <p key={i} className="text-dao-text-muted">
                  <span className="text-dao-primary/70">dna_ct[{i}]</span>:{' '}
                  {Buffer.from(ct).toString('hex').slice(0, 24)}…
                </p>
              ))}
            </div>
          )}

          <button
            onClick={() => setIsEditing(true)}
            className="w-full py-3 rounded-xl font-semibold border border-dao-primary text-dao-primary hover:bg-dao-primary hover:text-white transition-colors flex items-center justify-center gap-2"
          >
            <Shuffle size={18} />
            Update My DNA Sequence
          </button>
        </div>
      ) : (
        <>
      {/* EDIT MODE — marker selector */}
      <div className="p-6 rounded-2xl border border-dao-border bg-dao-surface space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-dao-text">SNP Markers</h3>
          <div className="flex gap-2">
            {isEditing && (
              <button
                onClick={() => setIsEditing(false)}
                className="text-xs text-dao-text-muted hover:text-dao-text border border-dao-border px-3 py-1.5 rounded-lg transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              onClick={randomize}
              className="flex items-center gap-1.5 text-sm text-dao-text-muted hover:text-dao-text border border-dao-border hover:border-dao-border-bright px-3 py-1.5 rounded-lg transition-colors"
            >
              <Shuffle size={14} />
              Randomize
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: MAX_DNA_LENGTH }, (_, idx) => (
            <MarkerSelector
              key={idx}
              index={idx}
              label={SNP_LABELS[idx]}
              value={dnaInput[idx] ?? 0}
              onChange={(v) => handleMarkerChange(idx, v)}
            />
          ))}
        </div>

        {/* Double-strand DNA ladder */}
        <div className="pt-2 border-t border-dao-border">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-dao-text-muted font-mono tracking-wider">SEQUENCE PREVIEW</p>
            <span className="text-xs text-dao-primary/60 font-mono">4 SNP loci</span>
          </div>
          <DNALadder bases={dnaInput} />
        </div>
      </div>

      {/* Encryption preview */}
      <div className="p-4 rounded-xl border border-dao-primary/20 bg-dao-primary/5 seq-scan">
        <p className="text-xs text-dao-primary font-mono mb-2 tracking-wider">ENCRYPTION TRANSFORM</p>
        <div className="flex items-center gap-2 font-mono text-sm mb-3">
          <div className="flex gap-1">
            {dnaInput.map((base, i) => (
              <span key={i} className={`w-7 h-7 rounded flex items-center justify-center text-xs font-bold ${BASE_COLORS[base]}`}>
                {BASE_LABELS[base]}
              </span>
            ))}
          </div>
          <span className="text-dao-primary text-base">→</span>
          <div className="flex gap-1 enc-flicker">
            {dnaInput.map((_, i) => (
              <span key={i} className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold bg-dao-primary/20 text-dao-primary border border-dao-primary/30">
                {['0x', 'ff', '3a', 'e1'][i]}
              </span>
            ))}
          </div>
        </div>
        <p className="text-xs text-dao-text-muted font-mono leading-relaxed">
          <span className="text-dao-primary/80">enc_pubkey</span>: X25519 ephemeral [32B] ·{' '}
          <span className="text-dao-primary/80">nonce</span>: RescueCipher [128b] ·{' '}
          <span className="text-dao-primary/80">dna_ct[4]</span>: ciphertexts [4×32B]
        </p>
        <p className="text-xs text-dao-yes/70 font-mono mt-1">
          ✓ plaintext {dnaInput.map((b) => BASE_LABELS[b]).join('-')} never leaves browser
        </p>
      </div>

      {/* Submit */}
      {isSuccess ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center justify-center gap-3 p-4 rounded-xl bg-dao-yes/10 border border-dao-yes/30 text-dao-yes"
        >
          <CheckCircle size={20} />
          <span className="font-medium">
            {isRegistered ? 'DNA profile updated!' : 'DNA profile registered!'}
          </span>
          {txSig && (
            <a
              href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs underline opacity-70"
            >
              View tx
            </a>
          )}
        </motion.div>
      ) : (
        <button
          onClick={handleSubmit}
          disabled={isLoading || !publicKey}
          className="w-full py-3 rounded-xl font-semibold bg-dao-primary hover:bg-dao-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              {registerStatus === 'signing' ? 'Sign in wallet…' : 'Confirming…'}
            </>
          ) : (
            <>
              <Lock size={18} />
              Encrypt & {isRegistered ? 'Update' : 'Register'} DNA
            </>
          )}
        </button>
      )}
        </>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MarkerSelector
// ─────────────────────────────────────────────────────────────────────────────

function MarkerSelector({
  index,
  label,
  value,
  onChange,
}: {
  index: number;
  label: string;
  value: Base;
  onChange: (v: Base) => void;
}) {
  const comp = COMPLEMENT[value];
  return (
    <div className={`p-4 rounded-xl border bg-dao-bg transition-all duration-200 ${BASE_BORDER[value]}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-mono text-dao-primary/80 tracking-wider">{label}</p>
          <p className="text-xs text-dao-text-muted">Locus {index + 1}</p>
        </div>
        {/* Mini base pair */}
        <div className="flex flex-col items-center gap-0.5">
          <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${BASE_COLORS[value]} ${BASE_GLOW[value]}`}>
            {BASE_LABELS[value]}
          </span>
          <div className="w-px h-2 bg-dao-border" />
          <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold opacity-40 ${BASE_COLORS[comp]}`}>
            {BASE_LABELS[comp]}
          </span>
        </div>
      </div>

      {/* Base selector */}
      <div className="flex gap-1.5">
        {BASES.map((base) => (
          <button
            key={base}
            onClick={() => onChange(base)}
            className={`flex-1 py-2 rounded-lg text-sm font-bold font-mono transition-all duration-150 ${
              value === base
                ? BASE_COLORS[base] + ' ' + BASE_GLOW[base] + ' scale-105'
                : 'bg-dao-surface text-dao-text-muted hover:bg-dao-surface-2 hover:text-dao-text'
            }`}
          >
            {BASE_LABELS[base]}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DNALadder — double-strand visualization
// ─────────────────────────────────────────────────────────────────────────────

function DNALadder({ bases }: { bases: Base[] }) {
  return (
    <div className="rounded-xl bg-dao-bg border border-dao-border p-4 seq-scan font-mono">
      {/* Position ruler */}
      <div className="flex items-center mb-2 pl-8">
        {bases.map((_, i) => (
          <div key={i} className="flex-1 text-center text-xs text-dao-text-muted/40">{i + 1}</div>
        ))}
      </div>

      {/* 5' label + top strand */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs text-dao-primary/60 w-6 text-right">5'</span>
        <div className="flex-1 h-px bg-dao-border" />
        {bases.map((base, i) => (
          <div key={i} className="flex-1 flex justify-center">
            <span className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold ${BASE_COLORS[base]} ${BASE_GLOW[base]}`}>
              {BASE_LABELS[base]}
            </span>
          </div>
        ))}
        <div className="flex-1 h-px bg-dao-border" />
        <span className="text-xs text-dao-primary/60 w-6">3'</span>
      </div>

      {/* Hydrogen bond rungs */}
      <div className="flex items-center gap-2 py-1 pl-8">
        <div className="flex-1" />
        {bases.map((_, i) => (
          <div key={i} className="flex-1 flex justify-center">
            <div className="flex flex-col gap-0.5">
              {[0, 1, 2].map((j) => (
                <div key={j} className="w-px h-1.5 bg-dao-border mx-auto" />
              ))}
            </div>
          </div>
        ))}
        <div className="flex-1" />
      </div>

      {/* 3' label + bottom strand (complement) */}
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs text-dao-primary/60 w-6 text-right">3'</span>
        <div className="flex-1 h-px bg-dao-border" />
        {bases.map((base, i) => {
          const comp = COMPLEMENT[base];
          return (
            <div key={i} className="flex-1 flex justify-center">
              <span className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold opacity-50 ${BASE_COLORS[comp]}`}>
                {BASE_LABELS[comp]}
              </span>
            </div>
          );
        })}
        <div className="flex-1 h-px bg-dao-border" />
        <span className="text-xs text-dao-primary/60 w-6">5'</span>
      </div>

      {/* RSIDs */}
      <div className="flex items-center gap-2 mt-3 pl-8">
        <div className="flex-1" />
        {bases.map((_, i) => (
          <div key={i} className="flex-1 text-center text-xs text-dao-text-muted/50 font-mono truncate px-1">
            {SNP_LABELS[i]}
          </div>
        ))}
        <div className="flex-1" />
      </div>
    </div>
  );
}
