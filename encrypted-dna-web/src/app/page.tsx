'use client';

import { useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { Header } from '@/components/Header';
import { StepIndicator } from '@/components/StepIndicator';
import { DNAUploadPanel } from '@/components/DNAUploadPanel';
import { MatchPanel } from '@/components/MatchPanel';
import { ResultPanel } from '@/components/ResultPanel';
import { useDnaStore } from '@/store/dnaStore';
import { fetchUserProfile, fetchMatchResults } from '@/lib/solanaClient';

const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ?? '11111111111111111111111111111111',
);

export default function Home() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  const {
    currentStep,
    setMyProfile,
    setMatchResults,
    setLoadingProfile,
    setLoadingResults,
    setCurrentStep,
    myProfile,
  } = useDnaStore();

  // ── Load on-chain state whenever wallet connects ───────────────────────────
  const loadChainState = useCallback(async () => {
    if (!publicKey) return;

    setLoadingProfile(true);
    try {
      const profile = await fetchUserProfile(connection, PROGRAM_ID, publicKey);
      setMyProfile(profile);
    } catch (err) {
      console.error('Failed to fetch profile:', err);
    } finally {
      setLoadingProfile(false);
    }

    setLoadingResults(true);
    try {
      const results = await fetchMatchResults(connection, PROGRAM_ID, publicKey);
      setMatchResults(results);
    } catch (err) {
      console.error('Failed to fetch match results:', err);
    } finally {
      setLoadingResults(false);
    }
  }, [publicKey, connection, setMyProfile, setMatchResults,
      setLoadingProfile, setLoadingResults]);

  useEffect(() => {
    loadChainState();
  }, [loadChainState]);

  // Auto-advance to match step on first wallet connect (only from 'upload')
  useEffect(() => {
    if (myProfile?.isRegistered && currentStep === 'upload') {
      // Only auto-advance if the user hasn't explicitly navigated to upload
      // We use a flag stored in session to distinguish "first load" from "user clicked My DNA"
      const key = `dna_visited_${publicKey?.toBase58()}`;
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        setCurrentStep('match');
      }
    }
  }, [myProfile?.isRegistered, publicKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset to upload step when wallet disconnects
  useEffect(() => {
    if (!publicKey) {
      setCurrentStep('upload');
      setMyProfile(null);
    }
  }, [publicKey, setCurrentStep, setMyProfile]);

  return (
    <div className="min-h-screen bg-dao-bg">
      <Header programId={PROGRAM_ID} onRefresh={loadChainState} />

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Hero — compact */}
        <div className="flex items-center justify-center gap-3 mb-6 animate-fade-in">
          <DNAHelixIcon />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Encrypted <span className="text-dao-primary tracking-arcium">DNA</span> Matching
            </h1>
            <p className="text-xs text-dao-text-muted mt-0.5">
              Privacy-preserving genomic similarity ·{' '}
              <span className="text-dao-primary">Arcium TEE</span> · 4 SNP markers
            </p>
          </div>
        </div>

        <StepIndicator />

        {/* Step panels */}
        <div className="mt-8 animate-slide-up">
          {currentStep === 'upload'  && <DNAUploadPanel programId={PROGRAM_ID} />}
          {currentStep === 'match'   && <MatchPanel     programId={PROGRAM_ID} />}
          {currentStep === 'result'  && <ResultPanel    programId={PROGRAM_ID} />}
        </div>

        {/* Privacy explanation */}
        <section className="mt-16 p-6 rounded-2xl border border-dao-border bg-dao-surface animate-fade-in">
          <h2 className="text-xl font-semibold mb-4 text-dao-primary tracking-arcium">
            HOW YOUR PRIVACY IS PROTECTED
          </h2>
          <div className="grid md:grid-cols-3 gap-6 text-sm text-dao-text-muted">
            <PrivacyCard
              step="1"
              title="Client-Side Encryption"
              body="Your raw SNP values (A/T/G/C) are encrypted in-browser using X25519 ECDH + RescueCipher before any data is sent to the blockchain. The plaintext never leaves your device."
            />
            <PrivacyCard
              step="2"
              title="Arcium MPC / TEE"
              body="The Arcium MXE (Multi-party eXecution Environment) runs the similarity circuit inside an Intel SGX hardware enclave. Neither the node operators nor Arcium can see your DNA."
            />
            <PrivacyCard
              step="3"
              title="Only the Score"
              body="The circuit returns a single number: the percentage of matching markers. Individual genotype data is never revealed — not to the other user, not to the platform, not to anyone."
            />
          </div>
        </section>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components (small, page-specific — don't need their own files)
// ─────────────────────────────────────────────────────────────────────────────

function DNAHelixIcon() {
  // Double helix: two sinusoidal backbones + rungs
  const W = 56; const H = 56; const cx = W / 2;
  const steps = 8;
  const rungs: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const pts1: string[] = [];
  const pts2: string[] = [];

  for (let i = 0; i <= steps * 4; i++) {
    const t  = i / (steps * 4);
    const y  = 4 + t * (H - 8);
    const dx = Math.sin(t * Math.PI * 2 * 2) * 18;
    pts1.push(`${cx + dx},${y}`);
    pts2.push(`${cx - dx},${y}`);
    if (i % 4 === 0 && i > 0 && i < steps * 4) {
      rungs.push({ x1: cx + dx, y1: y, x2: cx - dx, y2: y });
    }
  }

  const BASE_COLS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none" className="dna-strand">
      {/* Backbones */}
      <polyline points={pts1.join(' ')} stroke="#6B35E8" strokeWidth="2" strokeLinecap="round" fill="none" />
      <polyline points={pts2.join(' ')} stroke="#9B65F8" strokeWidth="2" strokeLinecap="round" fill="none" />
      {/* Rungs */}
      {rungs.map((r, i) => (
        <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2}
          stroke={BASE_COLS[i % 4]} strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
      ))}
      {/* Backbone nodes */}
      {rungs.map((r, i) => (
        <g key={i}>
          <circle cx={r.x1} cy={r.y1} r="2.5" fill={BASE_COLS[i % 4]} />
          <circle cx={r.x2} cy={r.y2} r="2.5" fill={BASE_COLS[(i + 2) % 4]} />
        </g>
      ))}
    </svg>
  );
}

function PrivacyCard({
  step,
  title,
  body,
}: {
  step: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-dao-primary text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
          {step}
        </span>
        <span className="font-medium text-dao-text">{title}</span>
      </div>
      <p>{body}</p>
    </div>
  );
}
