import type { RankingLookupAdapter, RankingLookupResult } from './adapter';

// The production adapter until step 3.1 (build plan step 1.4's own words);
// replaced there by rankings/directory-adapter.ts, which is now what
// index.ts registers. Kept here as a pre-step-3.1 fallback and for tests:
// no network call, no vendor, every lookup resolves unverified, which is
// exactly M-ID-2's "unmatched players can proceed unverified" path —
// decisions worksheet 2 requires that path work regardless of whether a
// real feed exists.
export function createUnverifiedRankingAdapter(): RankingLookupAdapter {
  return {
    async lookup(): Promise<RankingLookupResult> {
      return { status: 'unverified' };
    },
  };
}
