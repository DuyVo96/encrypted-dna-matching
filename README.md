# 🧬 Encrypted DNA Matching

> **Privacy-preserving genomic similarity analysis on Solana, powered by Arcium MPC/TEE.**

Your DNA never leaves your device in plaintext. Similarity is computed inside an Intel SGX hardware enclave — only the aggregate score is returned.

---

## The Problem

Genomic data is among the most sensitive personal information that exists. Traditional DNA matching platforms require users to upload raw sequences to a central server, creating massive privacy and security risks:

- **Data breaches** expose irreversible genetic information
- **Platform misuse** enables discriminatory profiling
- **Third-party exposure** — even "anonymized" DNA can be re-identified

## The Solution: Arcium + Solana

Encrypted DNA Matching uses **Arcium's Multi-party eXecution Environment (MXE)** — a network of nodes running inside **Intel SGX hardware enclaves** — to compute genomic similarity without ever decrypting the raw data.

```
User A device:           Blockchain:            Arcium TEE (SGX):
  Raw DNA                                          Decrypts A
  ─encrypt─▶  enc_DNA_A ─────────────────────────▶ Decrypts B
  Raw DNA                                          Compares markers
  ─encrypt─▶  enc_DNA_B                            ─────────────▶ Score: 75%
                          ◀──── match_callback ────
```

**Neither the blockchain, Arcium nodes, the platform, nor the partner ever sees your raw genetic data.**

---

## Technical Architecture

### Smart Contract (`encrypted-dna-contract/`)

Built with **Anchor 0.32.1** + **arcium-anchor 0.9.2** on Solana devnet.

| Instruction | Description |
|---|---|
| `register_user` | Stores encrypted DNA profile on-chain (4 SNP markers) |
| `update_dna` | Re-encrypts and updates an existing profile |
| `init_dna_comp_def` | One-time setup: registers the DNA circuit with Arcium MXE |
| `request_match` | Queues an Arcium MPC computation for two users' encrypted DNA |
| `match_callback` | Called by Arcium TEE with the similarity score (0–100) |

**Account types:**

| Account | Purpose |
|---|---|
| `UserProfile` | Owner + encrypted DNA markers (enc_pubkey, nonce, ciphertext × 4) |
| `MatchRequest` | Tracks an in-flight computation (computation_offset, status) |
| `MatchResult` | Stores the final similarity score per (user_a, user_b) pair |

### Encryption (Client-Side)

Each SNP marker is independently encrypted using:

1. **X25519 ECDH** — ephemeral keypair + MXE's live X25519 public key
2. **RescueCipher** — ZK-friendly symmetric cipher, operated by `@arcium-hq/client`

```typescript
// Per marker:
const ephemeralKey  = x25519.utils.randomPrivateKey();
const sharedSecret  = x25519.getSharedSecret(ephemeralKey, mxePublicKey);
const ciphertext    = new RescueCipher(sharedSecret).encrypt([BigInt(marker)], nonce);
```

The plaintext (0=A, 1=T, 2=G, 3=C) never leaves the browser.

### Arcium Circuit (`encrypted-ixs/dna_match.json`)

The circuit `dna_match_v2.arcis` implements:

```
inputs: 4 × Enc<Shared, u8> (user A) + 4 × Enc<Shared, u8> (user B)
output: u8 (similarity_score = matching_count × 25)

for i in 0..4:
  if decrypt(a[i]) == decrypt(b[i]): matches++
return matches * 25
```

**Privacy guarantee:** The circuit runs inside Intel SGX. Neither the Arcium node operator, Arcium the company, nor the Solana network can observe the decrypted marker values. Only the final score is emitted.

### Frontend (`encrypted-dna-web/`)

Built with **Next.js 15.1.9** + **React 19** + Tailwind CSS.

- **Wallet adapter** — Phantom + Solflare (devnet)
- **Zustand** — single source of truth for all chain state
- **Raw byte parsing** — no IDL deserialization; `getProgramAccounts` + `memcmp` filters
- **Polling** — `pollMatchResult()` checks every 3s until Arcium callback arrives (30–120s)

---

## Getting Started

### Prerequisites

```bash
# Rust 1.89.0
rustup toolchain install 1.89.0

# Solana CLI 1.18+
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Anchor CLI 0.32.1
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install 0.32.1 && avm use 0.32.1

# Arcium CLI 0.9.2
cargo install arcium-cli

# Node.js 18+
```

### 1. Deploy the Contract

```bash
cd encrypted-dna-contract

# Build
anchor build

# Get your program ID
solana address -k target/deploy/encrypted_dna-keypair.json
# → Copy this into Anchor.toml [programs.devnet] and programs/encrypted_dna/src/lib.rs declare_id!()

# Fund your wallet
solana airdrop 2 --url devnet

# Deploy via write-buffer (handles large programs)
solana program write-buffer \
  target/deploy/encrypted_dna.so \
  --url devnet \
  --keypair ~/.config/solana/id.json

solana program deploy \
  --program-id target/deploy/encrypted_dna-keypair.json \
  --buffer <BUFFER_ADDRESS> \
  --url devnet \
  --keypair ~/.config/solana/id.json
```

### 2. Initialize Arcium MXE (one-time)

```bash
# Initialize your MXE
arcium init-mxe --cluster-offset 456

# Finalize MXE keys (makes the X25519 key available for encryption)
arcium finalize-mxe-keys <YOUR_PROGRAM_ID> --cluster-offset 456
```

### 3. Run the Setup Script

```bash
cd encrypted-dna-web
cp .env.local.example .env.local
# Edit .env.local with your PROGRAM_ID and HELIUS_API_KEY

node setup_devnet.mjs
# Initializes the comp_def account (registers the DNA circuit with Arcium)
```

### 4. Upload the Circuit

Upload `dna_match_v2.arcis` to a public GitHub repo and update `MATCH_CIRCUIT_URL` in `constants.rs`:

```rust
// constants.rs
pub const MATCH_CIRCUIT_URL: &str =
    "https://raw.githubusercontent.com/YOUR_USERNAME/arcium-circuits/main/dna_match_v2.arcis";
//   ^^^^ Must use raw.githubusercontent.com — NOT github.com/.../raw/...
//   TEE nodes don't follow HTTP 302 redirects.
```

Then rename and redeploy the circuit definition if you change the URL (increment v2 → v3, etc.):

```bash
# In constants.rs: change "dna_match_v2" → "dna_match_v3"
# Re-run: node setup_devnet.mjs
```

### 5. Run the Frontend

```bash
cd encrypted-dna-web
npm install
npm run dev
# → http://localhost:3000
```

---

## Deploy to Vercel

```bash
# Push to GitHub, then connect the repo on vercel.com
# vercel.json at repo root handles the monorepo build automatically

git push origin main
```

Set the following environment variables in Vercel:
- `NEXT_PUBLIC_PROGRAM_ID`
- `NEXT_PUBLIC_RPC_URL`

---

## Project Structure

```
encrypted-DNA-matching/
├── vercel.json                           # Vercel monorepo config
├── encrypted-dna-contract/              # Solana/Anchor smart contract
│   ├── rust-toolchain.toml              # Rust 1.89.0 pin
│   ├── Anchor.toml
│   ├── programs/encrypted_dna/src/
│   │   ├── lib.rs                       # Instruction handlers
│   │   ├── types.rs                     # Account structs (UserProfile, MatchResult)
│   │   ├── contexts.rs                  # Anchor account validation
│   │   ├── constants.rs                 # MAX_DNA_LENGTH, CLUSTER_OFFSET, circuit URL
│   │   ├── error.rs                     # Custom error codes
│   │   └── events.rs                    # On-chain events
│   └── encrypted-ixs/
│       └── dna_match.json               # Arcium circuit interface definition (dna_match_v2)
└── encrypted-dna-web/                   # Next.js 15 frontend
    ├── next.config.js                   # Webpack browser compat fallbacks
    ├── tailwind.config.js               # Arcium dark theme
    └── src/
        ├── app/                         # Next.js App Router
        ├── components/
        │   ├── DNAUploadPanel.tsx       # Step 1: encrypt + register
        │   ├── MatchPanel.tsx           # Step 2: request match
        │   └── ResultPanel.tsx          # Step 3: view similarity score
        ├── lib/
        │   ├── arciumDNAUtils.ts        # X25519 encryption + tx builders
        │   └── solanaClient.ts          # Raw byte account parsing
        ├── store/dnaStore.ts            # Zustand store
        └── types/dna.ts                 # Shared TypeScript types
```

---

## Key Technical Decisions

### Why Box<Account<'info, T>> for Arcium accounts?

In Anchor 0.32.1, `Account<'info, T>` allocates `T` on the BPF stack (4096-byte frame limit). `MXEAccount`, `Cluster`, and `ComputationDefinitionAccount` are large enough to overflow it. All three are declared as `Box<Account<...>>` in `contexts.rs`.

### Why raw.githubusercontent.com for the circuit URL?

The `github.com/.../raw/...` form returns an HTTP 302 redirect. Arcium TEE nodes do not follow redirects — they interpret the non-binary response as a malformed circuit, causing `ExecutionFailure` discriminant 2. Always use `raw.githubusercontent.com` directly.

### Why manual byte parsing instead of IDL deserialization?

Using `program.account.X.fetch()` requires the IDL to be deployed on-chain. Manual parsing with `getProgramAccounts` + `memcmp` discriminator filters works without IDL, is more predictable, and avoids subtle version mismatch bugs.

### Why dummy ciphertexts for unused slots?

The Arcium circuit eagerly decrypts all `Enc<Shared, u8>` slots regardless of actual count. Zero-padded slots are invalid ciphertexts → `ExecutionFailure::Inputs`. Each unused slot receives a real encrypted `0` value.

---

## Stack Versions

| Component | Version |
|---|---|
| Anchor | 0.32.1 |
| arcium-anchor | 0.9.2 |
| @arcium-hq/client | 0.9.2 |
| Rust | 1.89.0 |
| Next.js | 15.1.9 |
| React | 19.0.0 |
| @solana/web3.js | 1.98.4 |
| @coral-xyz/anchor | 0.32.1 |

---

## Real-World Impact

**Healthcare:** Genetic compatibility screening for organ transplants without exposing patient DNA to hospital databases.

**Research:** Population genetics studies where participants share only encrypted markers — researchers learn aggregate statistics, never individual genotypes.

**Ancestry:** Genealogy matching where users discover relatives without surrendering raw sequencing data to commercial platforms.

**Security:** Biometric authentication using SNP profiles as cryptographic credentials — proved correct without revealing the underlying sequence.

---

## License

MIT
