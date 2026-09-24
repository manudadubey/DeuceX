import { isAirAmber } from './amber';
import { computeBallDiff } from './ball';
import { computeFramesToBring } from './frames';
import { computeTension } from './tension';
import type { ConditionsBriefRuleInput, ConditionsBriefRules } from './types';

function round(n: number): number {
  return Math.round(n);
}

function formatRange(min: number, max: number, suffix: string): string {
  if (round(min) === round(max)) return `${round(min)}${suffix}`;
  return `${round(min)}–${round(max)}${suffix}`;
}

function formatWind(minKmh: number | null, maxKmh: number | null): string {
  if (minKmh === null || maxKmh === null) return 'None';
  return formatRange(minKmh, maxKmh, ' km/h');
}

// tournaments.surface is 'clay' | 'hard' | 'indoor_hard' | 'grass'
// (step 3.1 migration); indoor_hard already says "indoor" so the io tile
// just needs "hard" for that value, "Indoor hard" not "Indoor indoor_hard".
function surfaceLabel(surface: string | null): string {
  if (surface === 'indoor_hard') return 'hard';
  return surface ?? 'surface n/a';
}

function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}

// PRD-08 section 4.1: "Court tile states indoor or outdoor and the surface."
export function formatCourt(indoorOutdoor: 'indoor' | 'outdoor' | null, surface: string | null) {
  return `${capitalize(indoorOutdoor ?? 'Outdoor')} ${surfaceLabel(surface)}`;
}

// The orchestrator: every deterministic rule in one place (CE-1 to CE-5,
// CE-8, CE-9, CE-19), mirroring packages/agents/src/tournament/shortlist.ts's
// own computeCandidate — the prose (diff/practice, CE-6) is the caller's job
// via prose.ts's one batched model call per run, not this function's, since
// prose is the one part of the brief that isn't a pure function of these
// inputs alone (section 3: "generated once per run and never contradicting
// the tiles" — the tiles are computed first, then fed to the prompt).
export function computeConditionsBriefRules(input: ConditionsBriefRuleInput): ConditionsBriefRules {
  const { tournament, forecast, equipment } = input;
  const outdoor = tournament.indoorOutdoor !== 'indoor';

  const ballDiff = computeBallDiff(tournament.ball, equipment.practiceBalls);
  const airAmber = isAirAmber(forecast.tempMaxC, forecast.rhMaxPct);

  // CE-19: "the brief renders from the fact sheet and climate normals...
  // and no tension test is proposed" — a normals-sourced forecast never
  // proposes a test at all, regardless of what the normal numbers would
  // otherwise trigger, since it isn't a real enough number to hang
  // equipment advice on.
  const tensionResult = computeTension(
    outdoor,
    forecast,
    tournament.altitudeM,
    ballDiff,
    equipment,
    forecast.source === 'open-meteo',
  );
  const framesResult = computeFramesToBring(
    tensionResult.tension,
    forecast.tempMaxC,
    forecast.rhMaxPct,
    equipment.framesCarried,
  );

  return {
    // Indoor events show a single reading, not a range (the prototype's own
    // Bratislava tile: "19C indoor") — a controlled environment has no
    // meaningful daily spread the way an outdoor forecast does.
    tempRange: outdoor
      ? formatRange(forecast.tempMinC, forecast.tempMaxC, '°C')
      : `${round(forecast.tempMaxC)}°C indoor`,
    tempMax: forecast.tempMaxC,
    rhRange: formatRange(forecast.rhMinPct, forecast.rhMaxPct, '%'),
    rhMax: Math.round(forecast.rhMaxPct),
    wind: outdoor ? formatWind(forecast.windMinKmh, forecast.windMaxKmh) : 'None',
    altitudeM: tournament.altitudeM,
    ball: tournament.ball,
    ballDiff,
    io: formatCourt(tournament.indoorOutdoor, tournament.surface),
    airAmber,
    tension: tensionResult.tension,
    tensionNote: tensionResult.tensionNote,
    testMains: tensionResult.testMains,
    testCrosses: tensionResult.testCrosses,
    frames: framesResult.frames,
    framesSubLine: framesResult.subLine,
    grip: framesResult.subLine,
    refreshed: forecast.refreshed,
    forecastSource: forecast.source,
  };
}
