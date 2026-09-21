import type { RankingLookupAdapter, RankingLookupResult } from './adapter';

// The only production adapter until step 3.1 (build plan step 1.4's own
// words). No network call, no vendor: every real onboarding lookup today
// resolves unverified, which is exactly M-ID-2's "unmatched players can
// proceed unverified" path — decisions worksheet 2 requires that path work
// regardless of whether a real feed exists yet.
export function createUnverifiedRankingAdapter(): RankingLookupAdapter {
  return {
    async lookup(): Promise<RankingLookupResult> {
      return { status: 'unverified' };
    },
  };
}
