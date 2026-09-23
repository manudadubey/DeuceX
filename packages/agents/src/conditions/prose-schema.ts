import { z } from 'zod';

// CE-6: "The brief's prose is a comparison sentence against the player's
// most recent stamped event plus a practice sentence, generated once per
// run and never contradicting the tiles." Batched up to
// MAX_BRIEFS_PER_PROSE_CALL per call (section 3's cost line: "five briefs
// per run are batched into one model call").
export const MAX_BRIEFS_PER_PROSE_CALL = 5;

export const proseOutputSchema = z.object({
  briefs: z
    .array(
      z.object({
        tournamentId: z.string().min(1),
        diff: z.string().min(1).max(280),
        practice: z.string().min(1).max(280),
      }),
    )
    .min(1)
    .max(MAX_BRIEFS_PER_PROSE_CALL),
});

export type ProseModelOutput = z.infer<typeof proseOutputSchema>;

// Validates the model actually answered for every brief it was asked about,
// and only those — a schema-valid response that silently drops or invents a
// tournamentId is still wrong, the same spirit as match-scribe/schema.ts's
// own tag-vocabulary refinement.
export function validateProseCoverage(
  output: ProseModelOutput,
  expectedTournamentIds: readonly string[],
): boolean {
  const got = new Set(output.briefs.map((b) => b.tournamentId));
  return (
    got.size === expectedTournamentIds.length && expectedTournamentIds.every((id) => got.has(id))
  );
}
