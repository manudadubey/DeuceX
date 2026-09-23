import { isStampChipAmber } from './amber';
import type { ConditionsStampInput } from './types';

// PRD-08 section 6: "Stamp... rendered as the cond array ['33°C','82% RH',
// 'outdoor hard','Head Tour']" — CE-AC-9 adds a fifth entry, the place, when
// known: ['24°C','58% RH','outdoor clay','Dunlop Fort','Genoa']. This array
// is exactly what notes.cond stores (see the step 3.3 migration's design
// note) and what apps/web/components/match-scribe/recorder-card.tsx's
// review step (already shipped, step 1.1) already renders as a chip row —
// so this function's output is the real, load-bearing contract, not a
// display-only convenience.
export function buildStamp(input: ConditionsStampInput): string[] {
  const io =
    input.indoorOutdoor && input.surface
      ? `${input.indoorOutdoor} ${input.surface}`
      : (input.indoorOutdoor ?? input.surface ?? 'conditions unknown');
  const chips = [
    `${Math.round(input.tempC)}°C`,
    `${Math.round(input.rhPct)}% RH`,
    io,
    input.ball ?? 'Ball not published yet',
  ];
  if (input.place) chips.push(input.place);
  return chips;
}

// CE-12: "Stamp chips turn amber at 28C and at 70 percent humidity." Only
// the first two chips (temp, humidity) are ever amber (CE-AC-10: "outdoor
// hard" and "Head Tour" are not) — position, not content match, decides
// which chip this applies to, since io/ball/place can themselves contain
// digits or percent signs in principle.
export function isStampChipAt(chips: readonly string[], index: number): boolean {
  if (index > 1) return false;
  const tempC = Number.parseFloat(chips[0] ?? '');
  const rhPct = Number.parseFloat(chips[1] ?? '');
  if (Number.isNaN(tempC) || Number.isNaN(rhPct)) return false;
  return isStampChipAmber(tempC, rhPct);
}
