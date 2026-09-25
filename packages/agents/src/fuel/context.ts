import type { DietaryProfile, FuelAllergen, FuelExclusion } from './types';

// PRD-07 section 7: "the day's food allowance less Food lines logged today".
// Fuel displays it and never edits it. Null when the player hasn't set an
// allowance (owner decision, step 4.3: player-set on the Financial Agent).
export function foodMoneyLeft(
  dailyAllowance: number | null,
  todaysFoodHome: readonly number[],
): number | null {
  if (dailyAllowance === null) return null;
  return dailyAllowance - todaysFoodHome.reduce((sum, n) => sum + n, 0);
}

const EXCLUSION_CHIP: Record<FuelExclusion, string> = {
  pork: 'No pork',
  beef: 'No beef',
  lamb: 'No lamb',
  meat: 'No meat',
  fish: 'No fish',
  shellfish: 'No shellfish',
  alcohol: 'No alcohol',
};

export const ALLERGEN_NAME: Record<FuelAllergen, string> = {
  gluten: 'gluten',
  crustaceans: 'crustaceans',
  eggs: 'eggs',
  fish: 'fish',
  peanuts: 'peanuts',
  soybeans: 'soy',
  milk: 'milk',
  tree_nuts: 'tree nuts',
  celery: 'celery',
  mustard: 'mustard',
  sesame: 'sesame',
  sulphites: 'sulphites',
  lupin: 'lupin',
  molluscs: 'molluscs',
};

// FU-AC-1's chip: "No pork · no allergies".
export function dietaryChip(profile: DietaryProfile): string {
  const parts = profile.exclusions.map((e) => EXCLUSION_CHIP[e]);
  parts.push(
    profile.allergies.length === 0
      ? 'no allergies'
      : `allergic to ${profile.allergies.map((a) => ALLERGEN_NAME[a]).join(', ')}`,
  );
  const text = parts.join(' · ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// The Preferences summary (PRD-07 section 2's toast, rewritten for the
// Fuel-owned editor): "no pork, prefers fish and chicken · no allergies on file".
export function preferencesSummary(profile: DietaryProfile): string {
  const rules = profile.exclusions.map((e) => EXCLUSION_CHIP[e].toLowerCase());
  if (profile.preferences.length > 0) {
    const prefs = profile.preferences;
    const joined =
      prefs.length === 1 ? prefs[0] : `${prefs.slice(0, -1).join(', ')} and ${prefs.at(-1)}`;
    rules.push(`prefers ${joined}`);
  }
  const allergies =
    profile.allergies.length === 0
      ? 'no allergies on file'
      : `allergies: ${profile.allergies.map((a) => ALLERGEN_NAME[a]).join(', ')}`;
  return [rules.join(', ') || 'no exclusions', allergies].join(' · ');
}
