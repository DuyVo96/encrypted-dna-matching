'use client';

import { PublicKey } from '@solana/web3.js';
import dynamic from 'next/dynamic';

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((m) => m.WalletMultiButton),
  { ssr: false },
);
import { useWallet } from '@solana/wallet-adapter-react';
import { RefreshCw, Dna } from 'lucide-react';
import { useDnaStore } from '@/store/dnaStore';

interface HeaderProps {
  programId: PublicKey;
  onRefresh: () => void;
}

export function Header({ programId, onRefresh }: HeaderProps) {
  const { publicKey } = useWallet();
  const { myProfile, isLoadingProfile, setCurrentStep } = useDnaStore();

  return (
    <header className="border-b border-dao-border bg-dao-surface/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <Dna className="text-dao-primary" size={22} />
          <span className="font-semibold tracking-arcium text-sm text-dao-primary">
            ARCIUM
          </span>
          <span className="text-dao-text-muted text-sm hidden sm:block">/ DNA Matching</span>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {publicKey && (
            <div className="flex items-center gap-2">
              {/* Registration badge */}
              <span
                className={`hidden sm:flex items-center gap-1 px-2 py-1 rounded-full text-xs border ${
                  myProfile?.isRegistered
                    ? 'border-dao-yes/40 text-dao-yes bg-dao-yes/10'
                    : 'border-dao-text-muted/30 text-dao-text-muted'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    myProfile?.isRegistered ? 'bg-dao-yes' : 'bg-dao-text-muted'
                  }`}
                />
                {myProfile?.isRegistered ? 'DNA Registered' : 'Not Registered'}
              </span>

              {/* My DNA button */}
              {myProfile?.isRegistered && (
                <button
                  onClick={() => setCurrentStep('upload')}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dao-border hover:border-dao-primary/60 hover:text-dao-primary text-dao-text-muted text-xs transition-colors"
                  title="View / edit my DNA profile"
                >
                  <Dna size={13} />
                  My DNA
                </button>
              )}

              {/* Refresh button */}
              <button
                onClick={onRefresh}
                disabled={isLoadingProfile}
                className="p-2 rounded-lg border border-dao-border hover:border-dao-border-bright text-dao-text-muted hover:text-dao-text transition-colors"
                title="Refresh on-chain state"
              >
                <RefreshCw size={15} className={isLoadingProfile ? 'animate-spin' : ''} />
              </button>
            </div>
          )}

          <WalletMultiButton
            style={{
              backgroundColor: '#6B35E8',
              borderRadius: '8px',
              fontSize: '14px',
              height: '36px',
              padding: '0 16px',
            }}
          />
        </div>
      </div>
    </header>
  );
}
