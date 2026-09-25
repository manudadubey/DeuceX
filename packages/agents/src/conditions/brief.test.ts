import { describe, expect, it } from 'vitest';
import { computeConditionsBriefRules } from './brief';
import { formatTension, convertTensionText, toDisplayTempC } from './unit';
import type { ConditionsBriefRuleInput, EquipmentProfileInput } from './types';

// The five prototype fixtures (docs/deucex-dashboard.html's own `T`
// array, DEUCEX-CONTEXT.md 5.4), which PRD-08's own acceptance criteria
// (CE-AC-1 to CE-AC-5) are worked examples of. mainsKg/crossesKg = 24/23
// throughout, matching every fixture's own baseline numbers.
const EQUIPMENT: EquipmentProfileInput = {
  mainsKg: 24,
  crossesKg: 23,
  framesCarried: 4,
  practiceBalls: ['Dunlop Fort'],
  version: 1,
};

function input(overrides: Partial<ConditionsBriefRuleInput>): ConditionsBriefRuleInput {
  return {
    tournament: {
      tournamentId: 't',
      name: 'Event',
      surface: 'clay',
      indoorOutdoor: 'outdoor',
      city: null,
      altitudeM: 0,
      ball: 'Dunlop Fort',
    },
    forecast: {
      tempMaxC: 20,
      tempMinC: 15,
      rhMinPct: 50,
      rhMaxPct: 60,
      windMinKmh: 5,
      windMaxKmh: 10,
      source: 'open-meteo',
      refreshed: true,
      fetchedAt: '2026-09-21T00:00:00Z',
    },
    equipment: EQUIPMENT,
    previousEvent: null,
    ...overrides,
  };
}

describe('computeConditionsBriefRules · CE-AC-1 Poznań', () => {
  it('renders a cool, unremarkable brief with no test proposed', () => {
    const rules = computeConditionsBriefRules(
      input({
        tournament: {
          tournamentId: 'poznan',
          name: 'Poznań',
          surface: 'clay',
          indoorOutdoor: 'outdoor',
          city: 'Poznań',
          altitudeM: 80,
          ball: 'Dunlop Fort',
        },
        forecast: {
          tempMaxC: 22,
          tempMinC: 17,
          rhMinPct: 55,
          rhMaxPct: 65,
          windMinKmh: 8,
          windMaxKmh: 14,
          source: 'open-meteo',
          refreshed: true,
          fetchedAt: '2026-09-21T00:00:00Z',
        },
      }),
    );

    expect(rules.tempRange).toBe('17–22°C');
    expect(rules.airAmber).toBe(false);
    expect(rules.io).toBe('Outdoor clay');
    expect(rules.ball).toBe('Dunlop Fort');
    expect(rules.ballDiff).toBe(false);
    expect(rules.frames).toBe(3);
    expect(rules.grip).toBe('Normal grip');
    expect(rules.tension).toBe(false);
    expect(rules.testMains).toBeNull();
    expect(rules.tensionNote).toBe('Keep 24/23. Cooler air holds tension; no test needed.');
  });
});

describe('computeConditionsBriefRules · CE-AC-2 Sibiu', () => {
  it('proposes a test from altitude plus a differing ball', () => {
    const rules = computeConditionsBriefRules(
      input({
        tournament: {
          tournamentId: 'sibiu',
          name: 'Sibiu',
          surface: 'clay',
          indoorOutdoor: 'outdoor',
          city: 'Sibiu',
          altitudeM: 415,
          ball: 'Head Tour',
        },
        forecast: {
          tempMaxC: 26,
          tempMinC: 20,
          rhMinPct: 45,
          rhMaxPct: 55,
          windMinKmh: 5,
          windMaxKmh: 10,
          source: 'open-meteo',
          refreshed: true,
          fetchedAt: '2026-09-21T00:00:00Z',
        },
      }),
    );

    expect(rules.ball).toBe('Head Tour');
    expect(rules.ballDiff).toBe(true);
    expect(rules.altitudeM).toBe(415);
    expect(rules.tension).toBe(true);
    expect(rules.testMains).toBe(25);
    expect(rules.testCrosses).toBe(24);
    expect(rules.tensionNote).toBe(
      'Test 25/24 against 24/23 in the first hit. Altitude plus a livelier ball pushes the same way as heat.',
    );
    expect(rules.frames).toBe(4);
  });
});

describe('computeConditionsBriefRules · CE-AC-3 Antalya', () => {
  it('proposes a heat-driven test, five frames and the restring line', () => {
    const rules = computeConditionsBriefRules(
      input({
        tournament: {
          tournamentId: 'antalya',
          name: 'Antalya',
          surface: 'clay',
          indoorOutdoor: 'outdoor',
          city: 'Antalya',
          altitudeM: 30,
          ball: 'Head Tour',
        },
        forecast: {
          tempMaxC: 33,
          tempMinC: 29,
          rhMinPct: 55,
          rhMaxPct: 70,
          windMinKmh: 10,
          windMaxKmh: 18,
          source: 'open-meteo',
          refreshed: true,
          fetchedAt: '2026-09-21T00:00:00Z',
        },
        equipment: { ...EQUIPMENT, framesCarried: 5 },
      }),
    );

    expect(rules.airAmber).toBe(true);
    expect(rules.frames).toBe(5);
    expect(rules.grip).toBe('Fresh overgrip every set');
    expect(rules.tension).toBe(true);
    expect(rules.testMains).toBe(25);
    expect(rules.testCrosses).toBe(24);
    expect(rules.tensionNote).toBe('Up a kilo, and restring after every match in this heat.');
  });
});

describe('computeConditionsBriefRules · CE-AC-4 Bratislava', () => {
  it('never proposes a test indoors', () => {
    const rules = computeConditionsBriefRules(
      input({
        tournament: {
          tournamentId: 'bratislava',
          name: 'Bratislava',
          surface: 'indoor_hard',
          indoorOutdoor: 'indoor',
          city: 'Bratislava',
          altitudeM: 150,
          ball: 'Dunlop Fort',
        },
        forecast: {
          tempMaxC: 19,
          tempMinC: 19,
          rhMinPct: 40,
          rhMaxPct: 40,
          windMinKmh: null,
          windMaxKmh: null,
          source: 'open-meteo',
          refreshed: true,
          fetchedAt: '2026-09-21T00:00:00Z',
        },
      }),
    );

    expect(rules.io).toBe('Indoor hard');
    expect(rules.wind).toBe('None');
    expect(rules.tension).toBe(false);
    expect(rules.testMains).toBeNull();
  });
});

describe('computeConditionsBriefRules · CE-AC-5/7 Lisboa (humidity + wind driver)', () => {
  const rules = computeConditionsBriefRules(
    input({
      tournament: {
        tournamentId: 'lisboa',
        name: 'Lisboa',
        surface: 'hard',
        indoorOutdoor: 'outdoor',
        city: 'Lisboa',
        altitudeM: 10,
        ball: 'Wilson US Open',
      },
      forecast: {
        tempMaxC: 27,
        tempMinC: 24,
        rhMinPct: 60,
        rhMaxPct: 75,
        windMinKmh: 15,
        windMaxKmh: 25,
        source: 'open-meteo',
        refreshed: true,
        fetchedAt: '2026-09-21T00:00:00Z',
      },
    }),
  );

  it('proposes a test driven by humidity and wind, not heat', () => {
    // Air is still amber here (rhMax 75 >= 70), just not for the reason the
    // tension driver picks — the two predicates share thresholds but are
    // independent (a tile can be amber while the test's driver is wind).
    expect(rules.airAmber).toBe(true);
    expect(rules.tension).toBe(true);
    expect(rules.testMains).toBe(25);
    expect(rules.testCrosses).toBe(24);
    expect(rules.tensionNote).toBe('Go up a kilo: 25/24. Test both frames in the wind on day one.');
  });

  it('CE-AC-6/7: converts to lb at display time, kg stays the stored baseline', () => {
    expect(formatTension(24, 23, 'kg')).toBe('24/23');
    expect(formatTension(24, 23, 'lb')).toBe('53/51');
    expect(convertTensionText(rules.tensionNote, 'lb')).toBe(
      'Go up two pounds: 55/53. Test both frames in the wind on day one.',
    );
  });
});

describe('CE-18: temperature unit conversion never changes the amber evaluation', () => {
  it('converts °C to °F for display only', () => {
    expect(toDisplayTempC(33, 'kg')).toBe(33);
    expect(toDisplayTempC(33, 'lb')).toBe(91);
  });
});

describe('computeConditionsBriefRules · CE-19/CE-AC-13 (climate normals fallback)', () => {
  it('never proposes a test on a normals-sourced forecast, even when the numbers would otherwise trigger one', () => {
    const rules = computeConditionsBriefRules(
      input({
        tournament: {
          tournamentId: 'sibiu',
          name: 'Sibiu',
          surface: 'clay',
          indoorOutdoor: 'outdoor',
          city: 'Sibiu',
          altitudeM: 415,
          ball: 'Head Tour',
        },
        forecast: {
          tempMaxC: 26,
          tempMinC: 20,
          rhMinPct: 45,
          rhMaxPct: 55,
          windMinKmh: 5,
          windMaxKmh: 10,
          source: 'climate-normals',
          refreshed: false,
          fetchedAt: '2026-09-21T00:00:00Z',
        },
      }),
    );

    expect(rules.refreshed).toBe(false);
    expect(rules.forecastSource).toBe('climate-normals');
    expect(rules.tension).toBe(false);
    expect(rules.testMains).toBeNull();
    // The rest of the brief still renders (CE-AC-13): tiles are unaffected.
    expect(rules.ballDiff).toBe(true);
    expect(rules.io).toBe('Outdoor clay');
  });
});
