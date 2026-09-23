import { AMBER_TEMP_C, AMBER_HUMIDITY_PCT } from './amber';
import { HEAT_FRAMES_TEMP_C } from './tension';

// PRD-08 section 7: "'Fresh overgrip every set' when rhMax >= 70 percent or
// tempMax >= 28C, otherwise 'Normal grip'."
export function computeGrip(tempMaxC: number, rhMaxPct: number): string {
  return tempMaxC >= AMBER_TEMP_C || rhMaxPct >= AMBER_HUMIDITY_PCT
    ? 'Fresh overgrip every set'
    : 'Normal grip';
}

// PRD-08 section 7: "frames = 3 by default; 4 when tension = 1; 5 when
// tension = 1 and tempMax >= 29C... never more than framesCarried, and when
// the rule wants more the sub-line reads 'you carry 4; bring them all'."
// The Frames tile's own sub-line (section 4.1) is otherwise the same Grip
// text computeGrip produces — one predicate, two places it's shown. Review
// register B10: the profile's own default (4, this migration's default too)
// can be lower than what a hot week wants (5); this is what actually
// enforces that cap, not the profile default.
export interface FramesResult {
  frames: number;
  subLine: string;
}

export function computeFramesToBring(
  tension: boolean,
  tempMaxC: number,
  rhMaxPct: number,
  framesCarried: number,
): FramesResult {
  const wanted = tension ? (tempMaxC >= HEAT_FRAMES_TEMP_C ? 5 : 4) : 3;
  const frames = Math.min(wanted, framesCarried);
  const grip = computeGrip(tempMaxC, rhMaxPct);
  // The prototype's own Antalya fixture concatenates both pieces
  // ("Fresh overgrip every set · you carry 4, bring them all") rather than
  // replacing the grip line with the cap note, so a capped hot week still
  // shows the grip advice too.
  const subLine =
    wanted > framesCarried ? `${grip} · you carry ${framesCarried}; bring them all` : grip;
  return { frames, subLine };
}
