import { AMBER_TEMP_C, AMBER_HUMIDITY_PCT } from './amber';
import type { EquipmentProfileInput, VenueForecastInput } from './types';

// PRD-08 section 7's tension rule, and its own words that "the one-
// kilogram tension test step... is the prototype's value and a placeholder
// for review with stringers" (decisions worksheet's own flagged cluster).
// Built from this document's numbers regardless, the same "wire it with the
// stated placeholder, don't leave it unbuilt" approach every other step in
// this build plan takes with its own named placeholders (the A$60/point
// constant, the confidence floors, and so on).
export const TENSION_STEP_KG = 1;
export const ALTITUDE_THRESHOLD_M = 400;
export const WIND_THRESHOLD_KMH = 15;
export const HEAT_FRAMES_TEMP_C = 29;

export type TensionDriver = 'heat' | 'altitude_ball' | 'humidity_wind' | null;

// Priority when more than one of section 7's three OR'd conditions fires at
// once: heat first (the layer's own origin story, PRD-08 section 1, is a
// heat week), then altitude-plus-ball, then humidity-plus-wind — the order
// the three worked examples in section 4.1/CE-AC-2/CE-AC-3 themselves
// suggest by which single driver each one names.
export interface TensionDriverInput {
  outdoor: boolean;
  tempMaxC: number;
  altitudeM: number | null;
  ballDiff: boolean;
  rhMaxPct: number;
  windMaxKmh: number | null;
}

export function computeTensionDriver(input: TensionDriverInput): TensionDriver {
  if (!input.outdoor) return null; // "Indoor events never propose a test."
  if (input.tempMaxC >= AMBER_TEMP_C) return 'heat';
  if ((input.altitudeM ?? 0) >= ALTITUDE_THRESHOLD_M && input.ballDiff) return 'altitude_ball';
  if (input.rhMaxPct >= AMBER_HUMIDITY_PCT && (input.windMaxKmh ?? 0) > WIND_THRESHOLD_KMH) {
    return 'humidity_wind';
  }
  return null;
}

function fmt(kg: number): string {
  return String(Math.round(kg));
}

export interface TensionResult {
  tension: boolean;
  driver: TensionDriver;
  testMains: number | null;
  testCrosses: number | null;
  tensionNote: string;
}

// CE-9, CE-AC-1 to CE-AC-4, CE-AC-7: testMains/testCrosses are the baseline
// plus TENSION_STEP_KG each; the note text is one of four fixed templates by
// driver (indoor's "no test" copy is its own template, matching the
// prototype's own Bratislava line, since indoor never gets a test proposed
// at all). Numbers inside the template are always formatted in kg — the
// unit toggle (unit.ts's convertTensionText) rewrites them for display, the
// same "store in kg, convert at render time" discipline as tension_mains_kg
// itself.
export function computeTension(
  outdoor: boolean,
  forecast: Pick<VenueForecastInput, 'tempMaxC' | 'rhMaxPct' | 'windMaxKmh'>,
  altitudeM: number | null,
  ballDiff: boolean,
  equipment: Pick<EquipmentProfileInput, 'mainsKg' | 'crossesKg'>,
  // CE-19: a climate-normals forecast (source !== 'open-meteo') never
  // proposes a test, whatever the normal numbers would otherwise trigger —
  // false here short-circuits straight to the "no test" result below.
  allowTest = true,
): TensionResult {
  const driver = allowTest
    ? computeTensionDriver({
        outdoor,
        tempMaxC: forecast.tempMaxC,
        altitudeM,
        ballDiff,
        rhMaxPct: forecast.rhMaxPct,
        windMaxKmh: forecast.windMaxKmh,
      })
    : null;

  const { mainsKg, crossesKg } = equipment;
  const baseline = `${fmt(mainsKg)}/${fmt(crossesKg)}`;

  if (driver === null) {
    return {
      tension: false,
      driver: null,
      testMains: null,
      testCrosses: null,
      tensionNote: outdoor
        ? `Keep ${baseline}. Cooler air holds tension; no test needed.`
        : `Keep ${baseline}; consider a softer cross if the court plays fast.`,
    };
  }

  const testMains = mainsKg + TENSION_STEP_KG;
  const testCrosses = crossesKg + TENSION_STEP_KG;
  const test = `${fmt(testMains)}/${fmt(testCrosses)}`;

  const tensionNote =
    driver === 'heat'
      ? forecast.tempMaxC >= HEAT_FRAMES_TEMP_C
        ? 'Up a kilo, and restring after every match in this heat.'
        : 'Up a kilo in this heat.'
      : driver === 'altitude_ball'
        ? `Test ${test} against ${baseline} in the first hit. Altitude plus a livelier ball pushes the same way as heat.`
        : `Go up a kilo: ${test}. Test both frames in the wind on day one.`;

  return { tension: true, driver, testMains, testCrosses, tensionNote };
}
