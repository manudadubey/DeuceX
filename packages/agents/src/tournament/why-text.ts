// Deterministic template text, not a model call — see docs/BUILD-LOG.md's
// step 3.2 entry for why this step deliberately scopes out an LLM-authored
// why paragraph and the recommendation memo (PRD-01 section 4.1's memo
// card): neither is named in the build-plan bullet and neither is exercised
// by this step's Done-when checks, and T-4's one hard content requirement
// (a defence week's why paragraph names the points and the places at risk)
// is easiest to guarantee exactly by template rather than by re-checking an
// LLM's prose against it after the fact.

export interface WhyTextInput {
  rank: number;
  ratio: number;
  defendPoints: number | null;
  defendPlacesAtRisk: number | null;
  acceptanceLabel: string;
}

export function buildWhyText(input: WhyTextInput): string {
  if (input.defendPoints && input.defendPoints > 0) {
    const places =
      input.defendPlacesAtRisk != null
        ? ` Skipping costs roughly ${input.defendPlacesAtRisk} places.`
        : '';
    return `A points-defence week: you hold ${input.defendPoints} points from last year that expire this week.${places}`;
  }
  return `Ranked ${input.rank} of the shortlist by cost-to-prize (${input.ratio.toFixed(2)}). ${input.acceptanceLabel}.`;
}
