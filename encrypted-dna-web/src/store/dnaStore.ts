import { create } from 'zustand';
import type { AppStep, Base, MatchResult, TxStatus, UserProfile } from '@/types/dna';

// ─────────────────────────────────────────────────────────────────────────────
// Store shape
// ─────────────────────────────────────────────────────────────────────────────

interface DnaStore {
  // ── User data ──────────────────────────────────────────────────────────────
  /** Current wallet's on-chain profile (null = not fetched or not registered). */
  myProfile: UserProfile | null;
  /** Manually selected DNA markers [0..MAX_DNA_LENGTH-1], each 0–3. */
  dnaInput: Base[];

  // ── Match data ─────────────────────────────────────────────────────────────
  /** All MatchResult PDAs fetched from the chain. */
  matchResults: MatchResult[];
  /** The result the user most recently submitted / is viewing. */
  activeResult: MatchResult | null;
  /** Signature of the request_match transaction (for proof display). */
  requestTxSig: string | null;

  // ── Navigation ─────────────────────────────────────────────────────────────
  currentStep: AppStep;

  // ── Loading / tx state ─────────────────────────────────────────────────────
  isLoadingProfile: boolean;
  isLoadingResults: boolean;
  registerStatus: TxStatus;
  matchStatus: TxStatus;
  errorMessage: string | null;

  // ── Actions ────────────────────────────────────────────────────────────────
  setDnaInput: (markers: Base[]) => void;
  setMyProfile: (profile: UserProfile | null) => void;
  setMatchResults: (results: MatchResult[]) => void;
  upsertMatchResult: (result: MatchResult) => void;
  setActiveResult: (result: MatchResult | null) => void;
  setRequestTxSig: (sig: string | null) => void;
  setCurrentStep: (step: AppStep) => void;
  setLoadingProfile: (v: boolean) => void;
  setLoadingResults: (v: boolean) => void;
  setRegisterStatus: (status: TxStatus) => void;
  setMatchStatus: (status: TxStatus) => void;
  setError: (msg: string | null) => void;
  reset: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default state
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_DNA: Base[] = [0, 1, 2, 3]; // A T G C — replaced by user input

const initialState = {
  myProfile: null,
  dnaInput: DEFAULT_DNA,
  matchResults: [],
  activeResult: null,
  requestTxSig: null,
  currentStep: 'upload' as AppStep,
  isLoadingProfile: false,
  isLoadingResults: false,
  registerStatus: 'idle' as TxStatus,
  matchStatus: 'idle' as TxStatus,
  errorMessage: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useDnaStore = create<DnaStore>((set) => ({
  ...initialState,

  setDnaInput: (markers) => set({ dnaInput: markers }),

  setMyProfile: (profile) => set({ myProfile: profile }),

  setMatchResults: (results) => set({ matchResults: results }),

  upsertMatchResult: (result) =>
    set((state) => {
      const idx = state.matchResults.findIndex(
        (r) => r.userA === result.userA && r.userB === result.userB,
      );
      return {
        matchResults:
          idx >= 0
            ? state.matchResults.map((r, i) => (i === idx ? result : r))
            : [...state.matchResults, result],
      };
    }),

  setActiveResult: (result) => set({ activeResult: result }),

  setRequestTxSig: (sig) => set({ requestTxSig: sig }),

  setCurrentStep: (step) => set({ currentStep: step }),

  setLoadingProfile: (v) => set({ isLoadingProfile: v }),

  setLoadingResults: (v) => set({ isLoadingResults: v }),

  setRegisterStatus: (status) => set({ registerStatus: status }),

  setMatchStatus: (status) => set({ matchStatus: status }),

  setError: (msg) => set({ errorMessage: msg }),

  reset: () => set(initialState),
}));
