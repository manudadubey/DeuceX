import { AMBER_HUMIDITY_PCT, AMBER_TEMP_C, isStampChipAmber } from './amber';
import type { ConditionsStampInput, HumidityBand, TempBand } from './types';

// PRD-08 section 6's Stamp, the cond array notes.cond stores and
// apps/web/components/match-scribe renders as a chip row:
// ['Warm', 'Moderate humidity', 'outdoor clay', 'Dunlop Fort', 'Genoa'].
//
// The first two chips are DeuceX's own bands, not the provider's numbers
// (owner decision, 3 October 2026). Google's Weather API terms (Maps Service
// Specific Terms 21.2) allow a daily forecast to be kept for 24 hours, and a
// stamp is kept for the life of the note, so a stamp stores what the numbers
// mean for play rather than the numbers. Notes stamped before then carry
// '24°C' and '58% RH'; every reader here accepts both shapes.

const WARM_TEMP_C = 20;
const MILD_TEMP_C = 12;
const DRY_HUMIDITY_PCT = 40;

export const TEMP_BANDS: readonly TempBand[] = ['Hot', 'Warm', 'Mild', 'Cool'];
export const HUMIDITY_BANDS: readonly HumidityBand[] = ['Humid', 'Moderate humidity', 'Dry air'];

// Hot and Humid use the amber thresholds (CE-12: 28°C, 70 percent), so a
// band chip is amber exactly when the old numeric chip would have been.
export function tempBandFor(tempC: number): TempBand {
  if (tempC >= AMBER_TEMP_C) return 'Hot';
  if (tempC >= WARM_TEMP_C) return 'Warm';
  if (tempC >= MILD_TEMP_C) return 'Mild';
  return 'Cool';
}

export function humidityBandFor(rhPct: number): HumidityBand {
  if (rhPct >= AMBER_HUMIDITY_PCT) return 'Humid';
  if (rhPct >= DRY_HUMIDITY_PCT) return 'Moderate humidity';
  return 'Dry air';
}

export function buildStamp(input: ConditionsStampInput): string[] {
  const io =
    input.indoorOutdoor && input.surface
      ? `${input.indoorOutdoor} ${input.surface}`
      : (input.indoorOutdoor ?? input.surface ?? 'conditions unknown');
  const chips = [
    tempBandFor(input.tempC),
    humidityBandFor(input.rhPct),
    io,
    input.ball ?? 'Ball not published yet',
  ];
  if (input.place) chips.push(input.place);
  return chips;
}

/** Reads a stamp's weather as bands, from either the band shape or a pre-October numeric one. */
export function stampBands(
  chips: readonly string[],
): { tempBand: TempBand; humidityBand: HumidityBand } | null {
  const [temp = '', humidity = ''] = chips;
  const tempBand = (TEMP_BANDS as readonly string[]).includes(temp)
    ? (temp as TempBand)
    : Number.isNaN(Number.parseFloat(temp))
      ? null
      : tempBandFor(Number.parseFloat(temp));
  const humidityBand = (HUMIDITY_BANDS as readonly string[]).includes(humidity)
    ? (humidity as HumidityBand)
    : Number.isNaN(Number.parseFloat(humidity))
      ? null
      : humidityBandFor(Number.parseFloat(humidity));
  return tempBand && humidityBand ? { tempBand, humidityBand } : null;
}

/** True when a stamp's weather came from bands, which today means Google's data (attribution). */
export function isBandStamp(chips: readonly string[]): boolean {
  return (TEMP_BANDS as readonly string[]).includes(chips[0] ?? '');
}

// CE-12: "Stamp chips turn amber at 28C and at 70 percent humidity." Only
// the first two chips (temperature, humidity) are ever amber (CE-AC-10:
// "outdoor hard" and "Head Tour" are not); position, not content, decides
// which chip this applies to.
export function isStampChipAt(chips: readonly string[], index: number): boolean {
  if (index > 1) return false;
  // Same rule as the numeric shape below: both weather chips are amber when
  // either threshold is met.
  if (isBandStamp(chips)) return chips[0] === 'Hot' || chips[1] === 'Humid';
  const tempC = Number.parseFloat(chips[0] ?? '');
  const rhPct = Number.parseFloat(chips[1] ?? '');
  if (Number.isNaN(tempC) || Number.isNaN(rhPct)) return false;
  return isStampChipAmber(tempC, rhPct);
}
