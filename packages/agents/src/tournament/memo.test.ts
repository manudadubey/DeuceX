import { describe, expect, it } from 'vitest';
import { checkMemo, generateMemo, type MemoInput, type MemoModelClient } from './memo';
import type { ShortlistResult } from './types';

const result: ShortlistResult = {
  scannedCount: 17,
  excluded: [],
  candidates: [
    {
      tournamentId: 't1',
      rank: 1,
      name: 'Challenger Poznań',
      tier: 'CH 75',
      surface: 'clay',
      city: 'Poznań',
      country: 'POL',
      startDate: '2026-10-12',
      endDate: '2026-10-18',
      entryDeadline: '2026-09-18',
      weekStart: '2026-10-12',
      ratio: 0.42,
      cost: {
        flights: 700,
        accommodation: 560,
        coach: 100,
        entryFee: 0,
        total: 1360,
        nights: 7,
        route: 'VIE–POZ',
      } as never,
      rounds: [
        { label: 'Lose R1', prize: 1620, points: 0, net: 260 },
        { label: 'Reach QF', prize: 3900, points: 15, net: 2540 },
      ],
      exp: 900,
      lo: 260,
      hi: 2540,
      acceptanceStatus: 'direct' as never,
      acceptanceLabel: 'Direct acceptance',
      defendPoints: 20,
      why: '',
    },
  ],
};
const input: MemoInput = {
  result,
  money: (n) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'AUD',
      maximumFractionDigits: 0,
    }).format(n),
  day: (iso) =>
    new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${iso}T00:00:00Z`)),
};
const filler = 'The week ahead is simple and the plan is clear for you here. '.repeat(18);

describe('checkMemo (T-AC-14)', () => {
  it('accepts a memo that only uses the shortlist figures', () => {
    const memo = {
      paragraphs: [
        'Challenger Poznań is the first pick: cost to go A$1,360, and losing in R1 still pays A$1,620. Accept before Fri 18 Sep.',
        `It is a defence week with 20 points expiring. ${filler}`,
      ],
    };
    expect(checkMemo(memo, input)).toBeNull();
  });

  it('rejects an amount, points or date that is not in the shortlist', () => {
    const base = `Cost to go A$1,360. ${filler}`;
    expect(checkMemo({ paragraphs: [base, 'It pays A$1,700 in R1.'] }, input)).toMatch(/A\$1,700/);
    expect(checkMemo({ paragraphs: [base, 'You hold 35 points here.'] }, input)).toMatch(
      /35 points/,
    );
    expect(checkMemo({ paragraphs: [base, 'Accept before Sat 19 Sep.'] }, input)).toMatch(
      /Sat 19 Sep/,
    );
  });

  it('rejects a memo that claims to have acted for the player', () => {
    expect(checkMemo({ paragraphs: [filler, 'I have entered you into Poznań.'] }, input)).toMatch(
      /acted/,
    );
  });
});

describe('checkMemo: events and attribution (the live memo of 28 September)', () => {
  const second = {
    ...result.candidates[0]!,
    tournamentId: 't2',
    rank: 2,
    name: 'Challenger Genoa',
    city: 'Genoa',
    country: 'ITA',
    startDate: '2026-10-26',
    entryDeadline: '2026-10-17',
    cost: { ...result.candidates[0]!.cost, total: 1010 },
    rounds: [{ label: 'Lose R1', prize: 3983, points: 0, net: 2973 }],
    lo: 2973,
    exp: 6717,
    hi: 11000,
    ratio: 0.12,
    defendPoints: null,
  };
  const two: MemoInput = {
    ...input,
    result: { ...result, candidates: [result.candidates[0]!, second] },
  };

  it('rejects an event that is not on the shortlist', () => {
    const memo = {
      paragraphs: [`Next, consider the Challenger Braga. ${filler}`, 'Accept before Fri 18 Sep.'],
    };
    expect(checkMemo(memo, two)).toMatch(/Challenger Braga" is not an event/);
  });

  it("rejects one event's figure given to another", () => {
    // A$1,360 is Poznań's cost to go, not Genoa's.
    const memo = {
      paragraphs: [
        `Genoa starts Mon 26 Oct. This one has a cost to go of A$1,360. ${filler}`,
        'Accept Poznań before Fri 18 Sep.',
      ],
    };
    expect(checkMemo(memo, two)).toMatch(/A\$1,360 is not in the shortlist for genoa/);
  });

  it('accepts each figure against its own event', () => {
    const memo = {
      paragraphs: [
        `Poznań costs A$1,360 to go and closes Fri 18 Sep. Genoa costs A$1,010, with a ratio of 0.12. ${filler}`,
        'Both are worth entering if the budget allows.',
      ],
    };
    expect(checkMemo(memo, two)).toBeNull();
  });
});

describe('checkMemo: urgency and spelled-out dates', () => {
  // Poznań closes Fri 18 Sep; on Mon 14 Sep that is this week.
  const soon: MemoInput = { ...input, today: '2026-09-14' };

  it('requires the event closing this week to be named', () => {
    expect(checkMemo({ paragraphs: [filler, 'A quiet week.'] }, soon)).toMatch(/closes this week/);
  });

  it('rejects saying a deadline has passed when it has not', () => {
    const memo = { paragraphs: [`Poznań has passed its deadline. ${filler}`, 'Next week.'] };
    expect(checkMemo(memo, soon)).toMatch(/has passed/);
  });

  it('checks a spelled-out date like any other', () => {
    const memo = {
      paragraphs: [`Poznań closes on Saturday, 19 September. ${filler}`, 'Accept soon.'],
    };
    expect(checkMemo(memo, soon)).toMatch(/Sat 19 Sep is not in the shortlist/);
  });
});

describe('generateMemo', () => {
  it('retries once with the problem named, then succeeds', async () => {
    const prompts: string[] = [];
    const answers = [
      { paragraphs: [`It pays A$9,999. ${filler}`, 'Accept before Fri 18 Sep.'] },
      { paragraphs: [`Cost to go A$1,360. ${filler}`, 'Accept before Fri 18 Sep.'] },
    ];
    const client: MemoModelClient = {
      async complete(p) {
        prompts.push(p.user);
        return { raw: answers.shift(), usage: { inputTokens: 1, outputTokens: 1 } };
      },
    };
    const { output } = await generateMemo(client, input);
    expect(output.paragraphs[0]).toContain('A$1,360');
    expect(prompts[1]).toContain('A$9,999 is not in the shortlist');
  });
});
