import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Encrypted DNA Matching | Arcium',
  description:
    'Privacy-preserving genomic similarity analysis powered by Arcium MPC/TEE. ' +
    'Your DNA never leaves your device in plaintext.',
  openGraph: {
    title: 'Encrypted DNA Matching',
    description: 'Genomic matching with zero-knowledge privacy — built on Arcium + Solana',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-dao-bg text-dao-text min-h-screen`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
