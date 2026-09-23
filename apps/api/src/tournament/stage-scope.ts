// PRD-01 section 2's scan scope, translated from prose into a predicate over
// tournaments' own free-text tier and tour columns (there is no dedicated
// "challenger tour" value — a Challenger event is tour='atp', tier='CH 75';
// a WTA 125 event is tour='wta', tier='WTA 125' — TECH-ARCHITECTURE.md 2.2's
// tour enum is only ('atp','wta','itf_men','itf_women')).
//
// "Men: Stage 1 scans ITF M15 and M25; Stage 2 scans ITF M25 and Challenger
// 50 to 75 plus Challenger 100 qualifying; Stage 3 scans Challenger 50 to
// 125 and ATP 250 qualifying. Women: Stage 1 scans ITF W15 and W35; Stage 2
// scans ITF W35 to W100 and WTA 125 qualifying; Stage 3 scans WTA 125, ITF
// W100 and WTA 250 qualifying."
//
// "...qualifying" in that prose describes an acceptance outcome the
// candidate itself already carries (computeAcceptanceStatus), not a
// separate draw this scope predicate needs to special-case — a CH 100 or
// ATP 250/WTA 250 event stays in scope regardless, and the shortlist
// engine's own acceptance/filter logic (T-2, T-8) is what correctly marks
// it qualifying-likely or excludes it for a given player's ranking.

export type PlayerTour = 'atp' | 'wta';
export type PlayerStage = '1' | '2' | '3';
export type TournamentTour = 'atp' | 'wta' | 'itf_men' | 'itf_women';

function tierLevel(tier: string | null): number | null {
  const match = tier?.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function isChallenger(tier: string | null): boolean {
  return !!tier && /^CH\b/i.test(tier.trim());
}

function isAtpTourLevel(tier: string | null): boolean {
  return !!tier && /^ATP\b/i.test(tier.trim());
}

function isWta125(tier: string | null): boolean {
  return !!tier && /WTA\s*125\b/i.test(tier);
}

function isWtaTourLevel(tier: string | null): boolean {
  return !!tier && /^WTA\s*\d/i.test(tier.trim()) && !isWta125(tier);
}

function isItf(tier: string | null): boolean {
  return !!tier && /^ITF\b/i.test(tier.trim());
}

function menScope(stage: PlayerStage, tour: TournamentTour, tier: string | null): boolean {
  const level = tierLevel(tier);
  if (stage === '1') {
    return tour === 'itf_men' && isItf(tier) && (level === 15 || level === 25);
  }
  if (stage === '2') {
    if (tour === 'itf_men' && isItf(tier) && level === 25) return true;
    if (tour === 'atp' && isChallenger(tier) && level != null && level >= 50 && level <= 100)
      return true;
    return false;
  }
  // stage 3
  if (tour === 'atp' && isChallenger(tier) && level != null && level >= 50 && level <= 125)
    return true;
  if (tour === 'atp' && isAtpTourLevel(tier) && level === 250) return true;
  return false;
}

function womenScope(stage: PlayerStage, tour: TournamentTour, tier: string | null): boolean {
  const level = tierLevel(tier);
  if (stage === '1') {
    return tour === 'itf_women' && isItf(tier) && (level === 15 || level === 35);
  }
  if (stage === '2') {
    if (tour === 'itf_women' && isItf(tier) && level != null && level >= 35 && level <= 100)
      return true;
    if (tour === 'wta' && isWta125(tier)) return true;
    return false;
  }
  // stage 3
  if (tour === 'wta' && isWta125(tier)) return true;
  if (tour === 'itf_women' && isItf(tier) && level === 100) return true;
  if (tour === 'wta' && isWtaTourLevel(tier) && level === 250) return true;
  return false;
}

export function isInStageScope(
  playerTour: PlayerTour,
  stage: PlayerStage,
  tournament: { tour: TournamentTour; tier: string | null },
): boolean {
  return playerTour === 'atp'
    ? menScope(stage, tournament.tour, tournament.tier)
    : womenScope(stage, tournament.tour, tournament.tier);
}
