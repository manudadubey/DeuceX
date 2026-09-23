import type { AcceptanceStatus } from './types';

// PRD-01 section 7: "Direct acceptance when the player's ranking is inside
// last year's cut minus 10 places; Alternate list when within 40 places
// outside the cut; Qualifying likely otherwise where qualifying exists;
// excluded otherwise."
export function computeAcceptanceStatus(
  rankingPosition: number | null,
  lastYearCut: number | null,
  hasQualifying: boolean,
): AcceptanceStatus {
  if (rankingPosition != null && lastYearCut != null) {
    if (rankingPosition <= lastYearCut - 10) return 'direct';
    if (rankingPosition <= lastYearCut + 40) return 'alternate';
  }
  return hasQualifying ? 'qualifying' : 'excluded';
}

// T-8: "Direct acceptance (with last year's cut), Alternate list (with the
// cut and the player's position), Qualifying likely (with the main-draw
// cut)."
export function acceptanceLabel(
  status: AcceptanceStatus,
  lastYearCut: number | null,
  rankingPosition: number | null,
): string {
  switch (status) {
    case 'direct':
      return lastYearCut != null
        ? `Direct acceptance · cut #${lastYearCut} last year`
        : 'Direct acceptance';
    case 'alternate':
      return lastYearCut != null && rankingPosition != null
        ? `Alternate list · cut #${lastYearCut}, you're #${rankingPosition}`
        : 'Alternate list';
    case 'qualifying':
      return lastYearCut != null
        ? `Qualifying likely · main-draw cut near #${lastYearCut}`
        : 'Qualifying likely';
    case 'excluded':
      return 'Outside the acceptance range';
  }
}
