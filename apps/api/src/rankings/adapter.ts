// Ranking verification behind an adapter, the same idiom as
// apps/api/src/transcription/adapter.ts and apps/api/src/storage/adapter.ts:
// a real feed in the production implementation, a deterministic fixture in
// tests. Unlike those two, there is no real implementation yet — step 3.1
// (Rankings and calendars) is what wires up the ATP/WTA and ITF feeds this
// interface is shaped for. Until then the only implementation registered in
// index.ts is createUnverifiedRankingAdapter (build plan step 1.4: "the
// ranking lookup behind an adapter that returns 'unverified' until step 3.1
// exists"), so every real onboarding today ends up on M-ID-2's unverified
// path. The three-way result shape and the ambiguous candidate list still
// need to exist now, proven against a fixture adapter, so the UI (the
// ambiguous-match chooser, the unverified badge) and finishOnboarding's
// stage detection are correct the day step 3.1 swaps a real adapter in.
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
