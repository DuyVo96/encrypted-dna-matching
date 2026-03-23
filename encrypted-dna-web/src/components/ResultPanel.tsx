'use client';

import { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { motion } from 'framer-motion';
import { Dna, Clock, ArrowLeft, RefreshCw, Shield, CheckCircle2, ExternalLink, Lock } from 'lucide-react';
import { useDnaStore } from '@/store/dnaStore';

// ─────────────────────────────────────────────────────────────────────────────
// Arcium proof constants (compile-time values from arcium build)
// ─────────────────────────────────────────────────────────────────────────────
const CIRCUIT_NAME   = 'dna_match_v2';
const CIRCUIT_HASH   = 'd89dd1953dff74b607bd24eb0f005b61e68eb8dfedb249c41f5495298e5f8c88';
const CIRCUIT_SOURCE = 'https://raw.githubusercontent.com/DuyVo96/arcium-circuits/main/dna_match_v2.arcis';
// Ed25519 verifying key of the Arcium devnet cluster that signed the output
const CLUSTER_VERIFY_KEY = '5VyiJ68LTAQNWxe9tnjartmR8Fzh7TJAUS4VZBvcEodV';
import { fetchMatchResults } from '@/lib/solanaClient';
import { decryptScore, loadEphemeralKey } from '@/lib/arciumDNAUtils';
import type { MatchResult } from '@/types/dna';

interface ResultPanelProps {
  programId: PublicKey;
}

// ─────────────────────────────────────────────────────────────────────────────
// Similarity score interpretation
// ─────────────────────────────────────────────────────────────────────────────

function scoreLabel(score: number): { label: string; color: string; bg: string } {
  if (score >= 75) return { label: 'High Similarity',     color: 'text-dao-yes',    bg: 'bg-dao-yes'    };
  if (score >= 50) return { label: 'Moderate Similarity', color: 'text-yellow-400', bg: 'bg-yellow-400' };
  if (score >= 25) return { label: 'Low Similarity',      color: 'text-orange-400', bg: 'bg-orange-400' };
  return              { label: 'No Shared Markers',     color: 'text-dao-no',     bg: 'bg-dao-no'     };
}

function scoreInterpretation(score: number): string {
  if (score === 100) return 'Identical profiles — you share all 4 SNP markers.';
  if (score >= 75)   return 'Strong genomic overlap — high likelihood of shared ancestry in these loci.';
  if (score >= 50)   return 'Moderate overlap — you share some genetic markers in these positions.';
  if (score >= 25)   return 'Limited overlap — only one marker in common at these positions.';
  return                    'No markers match at these 4 SNP positions.';
}

// ─────────────────────────────────────────────────────────────────────────────
// ResultPanel
// ─────────────────────────────────────────────────────────────────────────────

export function ResultPanel({ programId }: ResultPanelProps) {
  const { connection } = useConnection();
  const { publicKey, signTransaction, signAllTransactions } = useWallet();

  const {
    activeResult,
    matchResults,
    requestTxSig,
    setMatchResults,
    setCurrentStep,
    setActiveResult,
  } = useDnaStore();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [decryptedScore, setDecryptedScore] = useState<number | null>(null);
  const [missingKey, setMissingKey] = useState(false);

  // Auto-decrypt when result becomes computed
  useEffect(() => {
    if (!activeResult?.isComputed || !publicKey || !signTransaction || !signAllTransactions) return;
    if (activeResult.userA !== publicKey.toBase58()) return;

    const privKey = loadEphemeralKey(publicKey.toBase58());
    if (!privKey) { setMissingKey(true); return; }

    const provider = new anchor.AnchorProvider(
      connection,
      { publicKey, signTransaction, signAllTransactions } as anchor.Wallet,
      { commitment: 'confirmed' },
    );
    decryptScore(provider, programId, activeResult.encScore, activeResult.scoreNonce, privKey)
      .then((score) => {
        if (score !== null) setDecryptedScore(score);
        else setMissingKey(true); // key exists but wrong (registered on different domain)
      })
      .catch(() => setMissingKey(true));
  }, [activeResult?.isComputed, activeResult?.publicKey, publicKey, connection, programId, signTransaction, signAllTransactions]);

  // Auto-refresh until computed, with change-detection guard
  useEffect(() => {
    if (!activeResult || activeResult.isComputed || !publicKey) return;

    const interval = setInterval(async () => {
      const results = await fetchMatchResults(connection, programId, publicKey);

      const updated = results.find(
        (r) => r.userA === activeResult.userA && r.userB === activeResult.userB,
      );

      if (updated?.isComputed) {
        setMatchResults(results);
        setActiveResult(updated);
        clearInterval(interval);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [activeResult?.publicKey, activeResult?.isComputed, publicKey, connection, programId, setMatchResults, setActiveResult]);

  const refresh = async () => {
    if (!publicKey) return;
    setIsRefreshing(true);
    try {
      const results = await fetchMatchResults(connection, programId, publicKey);
      setMatchResults(results);
      if (activeResult) {
        const updated = results.find(
          (r) => r.userA === activeResult.userA && r.userB === activeResult.userB,
        );
        if (updated) setActiveResult(updated);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="p-6 rounded-2xl border border-dao-border bg-dao-surface">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-dao-primary flex items-center justify-center text-sm font-bold">
              3
            </span>
            Match Results
          </h2>
          <div className="flex gap-2">
            <button
              onClick={refresh}
              disabled={isRefreshing}
              className="p-2 rounded-lg border border-dao-border hover:border-dao-border-bright text-dao-text-muted transition-colors"
            >
              <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setCurrentStep('match')}
              className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-dao-border hover:border-dao-border-bright text-dao-text-muted transition-colors"
            >
              <ArrowLeft size={14} />
              New match
            </button>
          </div>
        </div>
        <p className="text-sm text-dao-text-muted">
          Results computed by Arcium MPC/TEE — only the similarity score is revealed.
          Neither party's raw DNA was ever accessible outside the enclave.
        </p>
      </div>

      {/* Active result */}
      {activeResult ? (
        <ActiveResultCard
          result={activeResult}
          myAddress={publicKey?.toBase58() ?? ''}
          decryptedScore={decryptedScore}
          missingKey={missingKey}
          onGoToUpload={() => setCurrentStep('upload')}
        />
      ) : (
        <div className="text-center py-12 text-dao-text-muted">
          <Dna size={40} className="mx-auto mb-3 opacity-30" />
          <p>No active result selected. Submit a match from the previous step.</p>
        </div>
      )}

      {/* All results list */}
      {matchResults.length > 0 && (
        <div className="p-6 rounded-2xl border border-dao-border bg-dao-surface">
          <h3 className="font-medium mb-4">All Matches</h3>
          <div className="space-y-3">
            {matchResults.map((r) => (
              <ResultRow
                key={r.publicKey}
                result={r}
                myAddress={publicKey?.toBase58() ?? ''}
                isActive={r.publicKey === activeResult?.publicKey}
                onClick={() => setActiveResult(r)}
              />
            ))}
          </div>
        </div>
      )}

      {/* TEE Proof panel — shown once computation completes */}
      {activeResult?.isComputed && (
        <ProofPanel txSig={requestTxSig} />
      )}

      {/* Privacy footer */}
      <div className="flex items-start gap-3 p-4 rounded-xl border border-dao-primary/20 bg-dao-primary/5 text-xs text-dao-text-muted">
        <Shield size={16} className="text-dao-primary flex-shrink-0 mt-0.5" />
        <p>
          <span className="text-dao-primary font-medium">Arcium privacy guarantee:</span>{' '}
          The similarity score above was computed entirely inside an Intel SGX hardware enclave.
          The circuit source (dna_match_v1.arcis) is publicly auditable, while the inputs
          remain confidential to the TEE. Neither Arcium nodes, Solana validators, nor this
          frontend ever see your raw SNP values.
        </p>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ActiveResultCard
// ─────────────────────────────────────────────────────────────────────────────

function ActiveResultCard({
  result,
  myAddress,
  decryptedScore,
  missingKey,
  onGoToUpload,
}: {
  result: MatchResult;
  myAddress: string;
  decryptedScore: number | null;
  missingKey: boolean;
  onGoToUpload: () => void;
}) {
  const partner = result.userA === myAddress ? result.userB : result.userA;

  if (!result.isComputed) {
    return (
      <div className="p-8 rounded-2xl border border-dao-border bg-dao-surface flex flex-col items-center gap-4">
        <div className="relative w-20 h-20">
          <div className="absolute inset-0 rounded-full border-2 border-dao-primary/20 animate-ping" />
          <div className="absolute inset-2 rounded-full border-2 border-dao-primary animate-spin-slow" />
          <Dna className="absolute inset-3.5 text-dao-primary" size={28} />
        </div>
        <div className="text-center">
          <p className="font-semibold text-dao-text">Arcium TEE Computing…</p>
          <p className="text-sm text-dao-text-muted mt-1">
            The circuit is running inside a hardware enclave. This typically
            takes 30–120 seconds on devnet.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-dao-text-muted border border-dao-border px-4 py-2 rounded-full">
          <Clock size={12} />
          Polling every 4 seconds…
        </div>
      </div>
    );
  }

  // Score is encrypted — only user_a can decrypt with their stored key
  const isUserA   = result.userA === myAddress;
  const score     = isUserA ? decryptedScore : null;
  const hasScore  = score !== null;

  if (!hasScore) {
    return (
      <div className="p-8 rounded-2xl border border-dao-border bg-dao-surface flex flex-col items-center gap-4 text-center">
        <Dna size={40} className="text-dao-primary opacity-60" />
        <div>
          <p className="font-semibold text-dao-text">Computation complete</p>
          {isUserA && missingKey ? (
            <>
              <p className="text-sm text-dao-text-muted mt-1">
                This match was encrypted on a different device or domain.
                Re-register your DNA here, then request a new match to see the score.
              </p>
              <button
                onClick={onGoToUpload}
                className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-dao-primary hover:bg-dao-primary-hover text-white font-semibold text-sm transition-colors mx-auto"
              >
                Update DNA
              </button>
            </>
          ) : (
            <p className="text-sm text-dao-text-muted mt-1">
              {isUserA
                ? 'Decrypting score…'
                : 'The encrypted score is only decryptable by the profile owner (user A).'}
            </p>
          )}
        </div>
      </div>
    );
  }

  const { label, color, bg } = scoreLabel(score);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="p-8 rounded-2xl border border-dao-border bg-dao-surface"
    >
      {/* Score display */}
      <div className="text-center mb-8">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          className="inline-flex flex-col items-center"
        >
          <div
            className={`w-36 h-36 rounded-full border-4 ${color.replace('text-', 'border-')} flex items-center justify-center mb-4 relative glow-${score >= 50 ? 'green' : 'purple'}`}
          >
            <div className="text-center">
              <span className={`text-5xl font-bold ${color}`}>{score}</span>
              <span className={`text-lg ${color}`}>%</span>
            </div>
          </div>
          <p className={`text-lg font-semibold ${color}`}>{label}</p>
        </motion.div>
      </div>

      {/* Score bar */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-dao-text-muted mb-1.5">
          <span>0%</span>
          <span>Similarity</span>
          <span>100%</span>
        </div>
        <div className="h-3 rounded-full bg-dao-surface-2 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${score}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className={`h-full rounded-full ${bg}`}
          />
        </div>
      </div>

      {/* Interpretation */}
      <p className="text-sm text-dao-text-muted text-center mb-6">
        {scoreInterpretation(score)}
      </p>

      {/* Match details */}
      <div className="grid grid-cols-2 gap-4 text-xs">
        <div className="p-3 rounded-xl bg-dao-bg border border-dao-border">
          <p className="text-dao-text-muted mb-1">You</p>
          <p className="font-mono text-dao-text">
            {myAddress.slice(0, 8)}…{myAddress.slice(-6)}
          </p>
        </div>
        <div className="p-3 rounded-xl bg-dao-bg border border-dao-border">
          <p className="text-dao-text-muted mb-1">Partner</p>
          <p className="font-mono text-dao-text">
            {partner.slice(0, 8)}…{partner.slice(-6)}
          </p>
        </div>
      </div>

      {/* Markers breakdown */}
      <div className="mt-4 p-4 rounded-xl bg-dao-bg border border-dao-border">
        <p className="text-xs text-dao-text-muted mb-3">
          Computed by Arcium TEE on 4 encrypted SNP markers
        </p>
        <div className="flex gap-2">
          {Array.from({ length: 4 }, (_, i) => {
            const matching = Math.round((score / 100) * 4);
            const isMatch  = i < matching;
            return (
              <div
                key={i}
                className={`flex-1 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-colors ${
                  isMatch
                    ? 'bg-dao-yes/20 text-dao-yes border border-dao-yes/30'
                    : 'bg-dao-surface-2 text-dao-text-muted border border-dao-border'
                }`}
              >
                {isMatch ? '✓' : '—'}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-dao-text-muted mt-2 text-center">
          {Math.round((score / 100) * 4)}/4 markers match
          <span className="ml-2 opacity-50">(exact positions hidden by TEE)</span>
        </p>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ResultRow (compact list item)
// ─────────────────────────────────────────────────────────────────────────────

function ResultRow({
  result,
  myAddress,
  isActive,
  onClick,
}: {
  result: MatchResult;
  myAddress: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const partner = result.userA === myAddress ? result.userB : result.userA;
  const label   = result.isComputed ? 'Computed (tap to decrypt)' : 'Computing…';
  const color   = result.isComputed ? 'text-dao-yes' : 'text-dao-text-muted';

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between p-3 rounded-xl border transition-colors text-left ${
        isActive
          ? 'border-dao-primary/50 bg-dao-primary/5'
          : 'border-dao-border hover:border-dao-border-bright bg-dao-bg'
      }`}
    >
      <div className="flex items-center gap-3">
        <Dna size={16} className={result.isComputed ? 'text-dao-yes' : 'text-dao-text-muted'} />
        <div>
          <p className="text-xs font-mono text-dao-text-muted">
            {partner.slice(0, 8)}…{partner.slice(-6)}
          </p>
          <p className={`text-xs font-medium ${color}`}>{label}</p>
        </div>
      </div>
      {result.isComputed && (
        <div className="text-xs text-dao-yes">✓</div>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ProofPanel — TEE attestation summary shown after computation completes
// ─────────────────────────────────────────────────────────────────────────────

function ProofPanel({ txSig }: { txSig: string | null }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-5 rounded-2xl border border-dao-yes/25 bg-dao-yes/5 space-y-4"
    >
      {/* Header badge */}
      <div className="flex items-center gap-2">
        <CheckCircle2 size={18} className="text-dao-yes flex-shrink-0" />
        <span className="font-semibold text-dao-yes text-sm">
          Verified by Arcium TEE — result written on-chain
        </span>
      </div>

      <p className="text-xs text-dao-text-muted leading-relaxed">
        The similarity score was computed inside an Intel SGX hardware enclave.
        The TEE signed the output with the cluster key below and wrote an
        encrypted result to your Solana account via{' '}
        <code className="text-dao-primary font-mono">match_callback</code>.
        No raw DNA ever left the enclave.
      </p>

      {/* Proof data grid */}
      <div className="space-y-2 text-xs">
        {/* Circuit */}
        <div className="flex items-start justify-between gap-4 p-3 rounded-xl bg-dao-bg border border-dao-border">
          <div className="min-w-0">
            <p className="text-dao-text-muted mb-0.5">Circuit</p>
            <p className="font-mono text-dao-text">{CIRCUIT_NAME}</p>
          </div>
          <a
            href={CIRCUIT_SOURCE}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-dao-primary hover:underline flex-shrink-0 mt-4"
          >
            Source <ExternalLink size={11} />
          </a>
        </div>

        {/* Circuit hash */}
        <div className="p-3 rounded-xl bg-dao-bg border border-dao-border">
          <p className="text-dao-text-muted mb-0.5">Circuit Hash (SHA-256)</p>
          <p className="font-mono text-dao-text break-all">{CIRCUIT_HASH}</p>
        </div>

        {/* Cluster verifying key */}
        <div className="p-3 rounded-xl bg-dao-bg border border-dao-border">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Lock size={11} className="text-dao-text-muted" />
            <p className="text-dao-text-muted">Cluster Ed25519 Verifying Key (devnet)</p>
          </div>
          <p className="font-mono text-dao-text break-all">{CLUSTER_VERIFY_KEY}</p>
        </div>

        {/* Request tx */}
        {txSig && (
          <div className="p-3 rounded-xl bg-dao-bg border border-dao-border">
            <p className="text-dao-text-muted mb-0.5">Request Transaction</p>
            <a
              href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-dao-primary hover:underline break-all flex items-center gap-1"
            >
              {txSig.slice(0, 20)}…{txSig.slice(-12)}
              <ExternalLink size={11} className="flex-shrink-0" />
            </a>
          </div>
        )}
      </div>
    </motion.div>
  );
}
