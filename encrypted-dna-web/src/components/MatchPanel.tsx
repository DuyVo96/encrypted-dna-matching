'use client';

import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { motion } from 'framer-motion';
import {
  Search, Loader2, CheckCircle, AlertCircle, Dna, Clock, ArrowRight,
} from 'lucide-react';
import { useDnaStore } from '@/store/dnaStore';
import {
  buildRequestMatchTx,
  generateComputationOffset,
  getUserProfilePDA,
  getMatchResultPDA,
} from '@/lib/arciumDNAUtils';
import {
  fetchUserProfile,
  fetchMatchResult,
  fetchMatchResults,
  pollMatchResult,
} from '@/lib/solanaClient';
import type { MatchResult } from '@/types/dna';

interface MatchPanelProps {
  programId: PublicKey;
}

export function MatchPanel({ programId }: MatchPanelProps) {
  const { connection } = useConnection();
  const { publicKey, signTransaction, signAllTransactions } = useWallet();

  const {
    matchStatus,
    matchResults,
    setMatchStatus,
    setCurrentStep,
    upsertMatchResult,
    setActiveResult,
    setError,
    setMatchResults,
    setLoadingResults,
    setRequestTxSig,
  } = useDnaStore();

  const [partnerAddress, setPartnerAddress] = useState('');
  const [partnerProfile, setPartnerProfile] = useState<{ found: boolean; address: string } | null>(
    null,
  );
  const [txSig, setTxSig] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);

  // ── Look up partner profile ───────────────────────────────────────────────

  const lookupPartner = async () => {
    if (!partnerAddress) return;

    setIsLookingUp(true);
    setPartnerProfile(null);
    setError(null);

    try {
      const partnerKey = new PublicKey(partnerAddress);
      const profile = await fetchUserProfile(connection, programId, partnerKey);
      setPartnerProfile({
        found: profile?.isRegistered ?? false,
        address: partnerAddress,
      });
    } catch (err: any) {
      if (err.message?.includes('Invalid public key')) {
        setError('Invalid Solana address');
      } else {
        setError('Could not look up partner: ' + err.message);
      }
    } finally {
      setIsLookingUp(false);
    }
  };

  // ── Submit match request ──────────────────────────────────────────────────

  const handleRequestMatch = async () => {
    if (!publicKey || !signTransaction || !signAllTransactions || !partnerProfile?.found) return;

    setMatchStatus('signing');
    setError(null);

    try {
      const partnerKey = new PublicKey(partnerAddress);
      const computationOffset = generateComputationOffset();

      const provider = new anchor.AnchorProvider(
        connection,
        { publicKey, signTransaction, signAllTransactions } as anchor.Wallet,
        { commitment: 'confirmed' },
      );

      const sig = await buildRequestMatchTx(
        provider,
        programId,
        publicKey,
        publicKey,     // user_a = self
        partnerKey,    // user_b = partner
        computationOffset,
      );

      setTxSig(sig);
      setRequestTxSig(sig);
      setMatchStatus('confirming');

      // ── Poll for Arcium callback ────────────────────────────────────────────
      setIsPolling(true);
      try {
        const result = await pollMatchResult(
          connection,
          programId,
          publicKey,
          partnerKey,
          3000,    // poll every 3s
          300_000, // 5-minute timeout
        );
        upsertMatchResult(result);
        setActiveResult(result);
        setMatchStatus('success');
        setCurrentStep('result');
      } catch (pollErr: any) {
        // Timeout — the computation is still running
        // Show the result panel anyway; it will show "computing" state
        setMatchStatus('success');
        setCurrentStep('result');
      } finally {
        setIsPolling(false);
      }
    } catch (err: any) {
      console.error('Match request error:', err);
      setError(err.message ?? 'Transaction failed');
      setMatchStatus('error');
    }
  };

  // ── Refresh past results ──────────────────────────────────────────────────

  const refreshResults = async () => {
    if (!publicKey) return;
    setLoadingResults(true);
    try {
      const results = await fetchMatchResults(connection, programId, publicKey);
      setMatchResults(results);
    } finally {
      setLoadingResults(false);
    }
  };

  const isLoading = matchStatus === 'signing' || matchStatus === 'confirming';
  const isAddressValid = (() => {
    try { new PublicKey(partnerAddress); return true; } catch { return false; }
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Panel header */}
      <div className="p-6 rounded-2xl border border-dao-border bg-dao-surface">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-2">
          <span className="w-7 h-7 rounded-full bg-dao-primary flex items-center justify-center text-sm font-bold">
            2
          </span>
          Request DNA Match
        </h2>
        <p className="text-sm text-dao-text-muted">
          Enter your partner's wallet address. The Arcium MXE will compare both
          encrypted profiles inside a hardware TEE — no raw DNA leaves either device.
        </p>
      </div>

      {/* Partner lookup */}
      <div className="p-6 rounded-2xl border border-dao-border bg-dao-surface space-y-4">
        <h3 className="font-medium">Partner Wallet</h3>

        <div className="flex gap-2">
          <input
            type="text"
            value={partnerAddress}
            onChange={(e) => {
              setPartnerAddress(e.target.value);
              setPartnerProfile(null);
            }}
            placeholder="Solana wallet address (base58)"
            className="flex-1 px-4 py-2.5 rounded-xl bg-dao-bg border border-dao-border focus:border-dao-primary focus:outline-none text-sm font-mono placeholder:text-dao-text-muted/50 transition-colors"
          />
          <button
            onClick={lookupPartner}
            disabled={!isAddressValid || isLookingUp}
            className="px-4 py-2.5 rounded-xl bg-dao-surface-2 border border-dao-border hover:border-dao-border-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2 text-sm"
          >
            {isLookingUp ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Search size={16} />
            )}
            Look up
          </button>
        </div>

        {/* Partner status */}
        {partnerProfile && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex items-center gap-3 p-3 rounded-xl border text-sm ${
              partnerProfile.found
                ? 'border-dao-yes/30 bg-dao-yes/10 text-dao-yes'
                : 'border-dao-no/30 bg-dao-no/10 text-dao-no'
            }`}
          >
            {partnerProfile.found ? (
              <>
                <Dna size={16} />
                <span>DNA profile found — ready to match</span>
              </>
            ) : (
              <>
                <AlertCircle size={16} />
                <span>
                  This address has not registered a DNA profile yet. Ask them to
                  register on this app first.
                </span>
              </>
            )}
          </motion.div>
        )}

        {/* Self-match warning */}
        {publicKey && partnerAddress === publicKey.toBase58() && (
          <p className="text-xs text-dao-no">Cannot match with your own address.</p>
        )}
      </div>

      {/* Arcium computation explanation */}
      {partnerProfile?.found && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-5 rounded-xl border border-dao-primary/20 bg-dao-primary/5 space-y-3"
        >
          <h4 className="text-sm font-semibold text-dao-primary">
            What happens when you submit:
          </h4>
          <ol className="text-xs text-dao-text-muted space-y-1.5 list-decimal list-inside">
            <li>
              Both encrypted DNA profiles are read from the Solana chain by your
              browser and submitted to Arcium's mempool.
            </li>
            <li>
              An Arcium worker node picks up the job and runs{' '}
              <code className="text-dao-primary font-mono">dna_match_v1.arcis</code>{' '}
              inside an Intel SGX enclave.
            </li>
            <li>
              The circuit decrypts both profiles <em>only inside the TEE</em>,
              compares {4} markers, counts matches, and emits a score (0–100%).
            </li>
            <li>
              The TEE calls your program's{' '}
              <code className="text-dao-primary font-mono">match_callback</code>{' '}
              with the encrypted result. It is written on-chain.
            </li>
            <li>
              This UI polls the result PDA every 3 seconds until the callback
              arrives (typically 30–120 s on devnet).
            </li>
          </ol>
        </motion.div>
      )}

      {/* Submit */}
      {isPolling ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-dao-primary/20 animate-ping" />
            <div className="absolute inset-2 rounded-full border-2 border-dao-primary animate-spin-slow" />
            <Dna className="absolute inset-3 text-dao-primary" size={24} />
          </div>
          <p className="text-sm text-dao-text-muted font-medium">
            Arcium TEE computing similarity…
          </p>
          <p className="text-xs text-dao-text-muted">
            This takes 30–120 seconds on devnet. Polling every 3 seconds.
          </p>
          {txSig && (
            <a
              href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-dao-primary underline"
            >
              View transaction
            </a>
          )}
        </div>
      ) : (
        <button
          onClick={handleRequestMatch}
          disabled={!partnerProfile?.found || isLoading || partnerAddress === publicKey?.toBase58()}
          className="w-full py-3 rounded-xl font-semibold bg-dao-primary hover:bg-dao-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              {matchStatus === 'signing' ? 'Sign in wallet…' : 'Submitting to Arcium…'}
            </>
          ) : (
            <>
              <Dna size={18} />
              Request Encrypted Match
              <ArrowRight size={16} />
            </>
          )}
        </button>
      )}

      {/* Past results */}
      {matchResults.length > 0 && (
        <PastResults
          results={matchResults}
          myAddress={publicKey?.toBase58() ?? ''}
          onView={(r) => {
            setActiveResult(r);
            setCurrentStep('result');
          }}
          onRefresh={refreshResults}
        />
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PastResults
// ─────────────────────────────────────────────────────────────────────────────

function PastResults({
  results,
  myAddress,
  onView,
  onRefresh,
}: {
  results: MatchResult[];
  myAddress: string;
  onView: (r: MatchResult) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="p-6 rounded-2xl border border-dao-border bg-dao-surface">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium">Past Matches</h3>
        <button
          onClick={onRefresh}
          className="text-xs text-dao-text-muted hover:text-dao-text underline"
        >
          Refresh
        </button>
      </div>
      <div className="space-y-2">
        {results.map((r) => {
          const partner = r.userA === myAddress ? r.userB : r.userA;
          return (
            <button
              key={r.publicKey}
              onClick={() => onView(r)}
              className="w-full flex items-center justify-between p-3 rounded-xl border border-dao-border hover:border-dao-border-bright bg-dao-bg transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                {r.isComputed ? (
                  <CheckCircle size={16} className="text-dao-yes flex-shrink-0" />
                ) : (
                  <Clock size={16} className="text-dao-text-muted flex-shrink-0" />
                )}
                <div>
                  <p className="text-xs font-mono text-dao-text-muted">
                    {partner.slice(0, 8)}…{partner.slice(-6)}
                  </p>
                  <p className="text-xs text-dao-text-muted">
                    {r.isComputed ? 'Computed (view to decrypt)' : 'Computing…'}
                  </p>
                </div>
              </div>
              <ArrowRight size={14} className="text-dao-text-muted" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
