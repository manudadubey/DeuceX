import type { Unit } from './types';

// PRD-08 section 7's unit engine, matching the prototype's own `toU`/`convT`
// (DEUCEX-CONTEXT.md 5.4) exactly: `toU(kg) = round(kg * 2.2046)`. The
// stored baseline always stays in kg (CE-17) — this only ever runs at
// display time.
const KG_TO_LB = 2.2046;

export function toDisplayKg(kg: number, unit: Unit): number {
  return unit === 'kg' ? kg : Math.round(kg * KG_TO_LB);
}

export function formatTension(mainsKg: number, crossesKg: number, unit: Unit): string {
  return `${toDisplayKg(mainsKg, unit)}/${toDisplayKg(crossesKg, unit)}`;
}

// CE-16: rewrites every "dd/dd" pair in prose text plus the two fixed
// phrases ("a kilo" -> "two pounds", "one-kilo" -> "two-pound"); a no-op in
// kg, matching the prototype's own `convT`.
export function convertTensionText(text: string, unit: Unit): string {
  if (unit === 'kg') return text;
  return text
    .replace(/(\d{2})\/(\d{2})/g, (_match, a: string, b: string) => {
      return `${toDisplayKg(Number(a), unit)}/${toDisplayKg(Number(b), unit)}`;
    })
    .replace(/one-kilo/g, 'two-pound')
    .replace(/a kilo/g, 'two pounds');
}

// CE-18: temperature displays follow the units preference; the amber
// thresholds themselves are always evaluated on the stored Celsius value
// (amber.ts never takes a unit), never the display conversion.
export function toDisplayTempC(tempC: number, unit: Unit): number {
  return unit === 'kg' ? tempC : Math.round((tempC * 9) / 5 + 32);
}

export function formatTemp(tempC: number, unit: Unit): string {
  return unit === 'kg' ? `${Math.round(tempC)}°C` : `${toDisplayTempC(tempC, 'lb')}°F`;
}
