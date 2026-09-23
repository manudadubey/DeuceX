// Ranking verification behind an adapter, the same idiom as
// apps/api/src/transcription/adapter.ts and apps/api/src/storage/adapter.ts:
// a real feed in the production implementation, a deterministic fixture in
// tests. Step 3.1 (Rankings and calendars) wired up the real implementation
// registered in index.ts (rankings/directory-adapter.ts), which matches
// against the ranking_snapshots directory a CSV/feed import builds up —
// there is still no *licensed* ATP/WTA/ITF feed (TECH-ARCHITECTURE.md
// section 4's own honest risk statement), only the CSV path, which is the
// whole point of "the manual path first." createUnverifiedRankingAdapter
// (build plan step 1.4: "the ranking lookup behind an adapter that returns
// 'unverified' until step 3.1 exists") stays in the codebase as the
// pre-step-3.1 fallback and in tests. The three-way result shape and the
// ambiguous candidate list, proven against a fixture adapter, are what the
// UI (the ambiguous-match chooser, the unverified badge) and
// finishOnboarding's stage detection were already built against.
export interface RankingLookupInput {
  tour: 'atp' | 'wta';
  tourPlayerId: string | null;
  itfId: string | null;
  name: string;
  country: string;
}

export interface RankingCandidate {
  id: string;
  name: string;
  country: string;
  tourRank: number | null;
  itfRank: number | null;
}

export interface VerifiedRanking {
  status: 'verified';
  source: string;
  tourRank: number;
  tourPoints: number;
  itfRank: number | null;
  wtn: number | null;
}

export interface AmbiguousRanking {
  status: 'ambiguous';
  candidates: RankingCandidate[];
}

export interface UnverifiedRanking {
  status: 'unverified';
}

export type RankingLookupResult = VerifiedRanking | AmbiguousRanking | UnverifiedRanking;

export interface RankingLookupAdapter {
  lookup(input: RankingLookupInput): Promise<RankingLookupResult>;
}
