import { describe, expect, it } from 'vitest';
import { buildShortlist } from './shortlist';
import type { CostModelPlayer, ShortlistFilters, TournamentCandidateInput } from './types';

// PRD-01 T-AC-1/T-AC-2's own fixture player: Stage 2, budget A$1,200/wk,
// blocked 26 Oct to 1 Nov. Seven candidate events across weeks 40-45, named
// after the prototype's own shortlist (docs/deucex-dashboard-neumayer.html
// #/agent/tournament) but with cost/prize numbers computed through this
// engine's own formulas (PRD-01 section 7) rather than copied from the
// prototype's hand-authored mock data — see docs/BUILD-LOG.md's step 3.2
// entry for why: the prototype's own rank order (Bratislava's displayed
// ratio 0.36 sits below Poznań's 0.42, yet the mock ranks Poznań first) does
// not actually satisfy T-3's stated sort rule, so this fixture is built to
// satisfy the formal PRD acceptance criteria (T-AC-1, T-AC-2) rather than
// replicate that inconsistency.
const ARYA_PLAYER: CostModelPlayer = {
  homeAirport: 'VIE',
  coachWeeklyFee: 0,
  coachTravels: false,
};

const ARYA_FILTERS: ShortlistFilters = {
  weeklyBudget: 1200,
  blockedDateRanges: [{ start: '2026-10-26', end: '2026-11-01' }],
  excludedSurfaces: [],
};

const POZNAN: TournamentCandidateInput = {
  tournamentId: 'poznan',
  name: 'Challenger Poznań',
  tier: 'CH 75',
  surface: 'Clay',
  city: 'Poznań',
  country: 'POL',
  startDate: '2026-09-28',
  endDate: '2026-10-04',
  entryDeadline: '2026-09-18',
  weekStart: '2026-09-28',
  entryFee: 0,
  hasQualifying: true,
  lastYearCut: 512,
  rankingPosition: 495,
  prizeTable: { R1: 1620, R2: 2380, QF: 3900, SF: 6400 },
  pointsTable: { R1: 0, R2: 6, QF: 11, SF: 22 },
  defendPoints: null,
  defendPlacesAtRisk: null,
};

const SIBIU: TournamentCandidateInput = {
  tournamentId: 'sibiu',
  name: 'Sibiu Open',
  tier: 'CH 75',
  surface: 'Clay',
  city: 'Sibiu',
  country: 'ROU',
  startDate: '2026-10-05',
  endDate: '2026-10-11',
  entryDeadline: '2026-09-25',
  weekStart: '2026-10-05',
  entryFee: 200, // pushed up deliberately so cost-to-go clears the A$1,200 budget (T-AC-1's "excluding the defence week")
  hasQualifying: true,
  lastYearCut: 512,
  rankingPosition: 495,
  prizeTable: { R1: 610, R2: 890, QF: 1180, SF: 1700 },
  pointsTable: { R1: 0, R2: 1, QF: 3, SF: 8 },
  defendPoints: 20,
  defendPlacesAtRisk: 12,
};

const BRATISLAVA: TournamentCandidateInput = {
  tournamentId: 'bratislava',
  name: 'Challenger Bratislava',
  tier: 'CH 125',
  surface: 'Hard',
  city: 'Bratislava',
  country: 'SVK',
  startDate: '2026-11-02',
  endDate: '2026-11-08',
  entryDeadline: '2026-10-23',
  weekStart: '2026-11-02',
  entryFee: 0,
  hasQualifying: true,
  lastYearCut: 240,
  rankingPosition: 495, // well outside cut+40=280: qualifying likely
  prizeTable: { Q1: 0, R1: 2100, R2: 3150, QF: 5200 },
  pointsTable: { Q1: 0, R1: 0, R2: 8, QF: 14 },
  defendPoints: null,
  defendPlacesAtRisk: null,
};

const LISBON: TournamentCandidateInput = {
  tournamentId: 'lisbon',
  name: 'Challenger Lisboa',
  tier: 'CH 75',
  surface: 'Hard',
  city: 'Lisbon',
  country: 'POR',
  startDate: '2026-10-19',
  endDate: '2026-10-25',
  entryDeadline: '2026-10-09',
  weekStart: '2026-10-19',
  entryFee: 0,
  hasQualifying: true,
  lastYearCut: 300,
  rankingPosition: 495, // outside cut+40=340: qualifying likely, weaker expected value
  prizeTable: { Q1: 0, R1: 1620, R2: 2380, QF: 3900 },
  pointsTable: { Q1: 0, R1: 0, R2: 6, QF: 11 },
  defendPoints: null,
  defendPlacesAtRisk: null,
};

const BIELLA: TournamentCandidateInput = {
  tournamentId: 'biella',
  name: 'CH 75 Biella',
  tier: 'CH 75',
  surface: 'Clay',
  city: 'Biella',
  country: 'ITA',
  startDate: '2026-10-12',
  endDate: '2026-10-18',
  entryDeadline: '2026-10-02',
  weekStart: '2026-10-12',
  entryFee: 60,
  hasQualifying: true,
  lastYearCut: 900, // deep field, well within direct acceptance but low expected value below
  rankingPosition: 495,
  prizeTable: { R1: 610, R2: 890, QF: 1180, SF: 1700 },
  pointsTable: { R1: 0, R2: 1, QF: 3, SF: 8 },
  defendPoints: null,
  defendPlacesAtRisk: null,
};

// A sixth, strictly-better-ratio candidate: without T-4's force-include this
// pushes Sibiu (the defence week, a weak ratio given its inflated cost) out
// of the natural top five entirely, so the test can prove force-include
// actually bumps something out rather than Sibiu having landed in the top
// five on ratio alone.
const GENOA: TournamentCandidateInput = {
  tournamentId: 'genoa',
  name: 'Challenger Genoa',
  tier: 'CH 100',
  surface: 'Clay',
  city: 'Genoa',
  country: 'ITA',
  startDate: '2026-10-19',
  endDate: '2026-10-25',
  entryDeadline: '2026-10-09',
  weekStart: '2026-10-19-b', // distinct week key from Lisbon's same calendar week, for this fixture's purposes
  entryFee: 0,
  hasQualifying: false,
  lastYearCut: 520,
  rankingPosition: 495, // inside cut-10=510: direct acceptance
  prizeTable: { R1: 1500, R2: 2200, QF: 3600, SF: 5900 },
  pointsTable: { R1: 0, R2: 5, QF: 10, SF: 20 },
  defendPoints: null,
  defendPlacesAtRisk: null,
};

// Falls inside the blocked week (26 Oct - 1 Nov): must never appear, shortlisted or excluded-for-a-substantive-reason other than blocked_dates.
const BLOCKED_WEEK_EVENT: TournamentCandidateInput = {
  ...BRATISLAVA,
  tournamentId: 'blocked-week-event',
  name: 'ITF M25 During Blocked Week',
  startDate: '2026-10-27',
  endDate: '2026-11-02',
  weekStart: '2026-10-26',
};

const ARYA_CANDIDATES = [POZNAN, SIBIU, BRATISLAVA, LISBON, BIELLA, GENOA, BLOCKED_WEEK_EVENT];

describe('buildShortlist (PRD-01 T-AC-1 to T-AC-2, the Arya fixture)', () => {
  it('shortlists exactly five events, none in the blocked week, none over budget except the defence week, Poznań ranked first', () => {
    const result = buildShortlist(ARYA_CANDIDATES, ARYA_PLAYER, ARYA_FILTERS);

    expect(result.scannedCount).toBe(7);
    expect(result.candidates).toHaveLength(5);
    expect(result.candidates.map((c) => c.tournamentId)).not.toContain('blocked-week-event');
    expect(result.excluded.find((e) => e.tournamentId === 'blocked-week-event')?.reason).toBe(
      'blocked_dates',
    );

    for (const c of result.candidates) {
      if (c.tournamentId === 'sibiu') continue; // the defence week, deliberately over budget
      expect(c.cost.total).toBeLessThanOrEqual(1200);
    }

    expect(result.candidates[0]?.tournamentId).toBe('poznan');
    expect(result.candidates[0]?.rank).toBe(1);
  });

  it('force-includes the defence week even though its cost-inflated ratio would otherwise rank it outside the top five, and its why paragraph states the points and the places at risk', () => {
    const result = buildShortlist(ARYA_CANDIDATES, ARYA_PLAYER, ARYA_FILTERS);

    const sibiu = result.candidates.find((c) => c.tournamentId === 'sibiu');
    expect(sibiu).toBeDefined();
    expect(sibiu?.why).toContain('20 points');
    expect(sibiu?.why).toContain('12 places');

    // Force-include only works if Sibiu's own ratio genuinely would not have
    // earned it a top-five place unassisted: rebuild without the defence
    // week to confirm the other six candidates alone fill the top five
    // without needing it.
    const withoutSibiu = buildShortlist(
      ARYA_CANDIDATES.filter((c) => c.tournamentId !== 'sibiu'),
      ARYA_PLAYER,
      ARYA_FILTERS,
    );
    expect(withoutSibiu.candidates).toHaveLength(5);
    expect(withoutSibiu.candidates.map((c) => c.tournamentId)).not.toContain('sibiu');
  });

  it('gives every shortlisted candidate an outcome table starting from the first realistic round and driving worst/best/expected net', () => {
    const result = buildShortlist(ARYA_CANDIDATES, ARYA_PLAYER, ARYA_FILTERS);
    for (const c of result.candidates) {
      expect(c.rounds.length).toBeGreaterThan(0);
      expect(c.lo).toBe(c.rounds[0]?.net);
      expect(c.hi).toBe(c.rounds[c.rounds.length - 1]?.net);
    }
  });
});
