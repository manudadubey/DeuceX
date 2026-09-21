import type { RankingLookupAdapter, RankingLookupInput, RankingLookupResult } from './adapter';

// A configurable fake for tests (the routes/finishOnboarding fixture tests)
// and for exercising the ambiguous-match chooser and verified-stage-
// detection UI paths in apps/web before step 3.1 gives them a real feed to
// talk to — same role as transcription's createMockTranscriptionAdapter.
export function createFixtureRankingAdapter(
  result: RankingLookupResult,
  onLookup?: (input: RankingLookupInput) => void,
): RankingLookupAdapter {
  return {
    async lookup(input): Promise<RankingLookupResult> {
      onLookup?.(input);
      return result;
    },
  };
}
