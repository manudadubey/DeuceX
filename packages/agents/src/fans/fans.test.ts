import { describe, expect, it } from 'vitest';
import { AgentValidationError } from '@deucex/actions';
import {
  PRO_PATRON_CAP,
  activePatrons,
  attributedUpdate,
  checkPatronNote,
  computePatronFlag,
  createMockPatronNoteClient,
  estimatePayout,
  eventTitle,
  generatePatronNote,
  grossMrr,
  joinAttribution,
  leaveAttribution,
  leftWhenPhrase,
  mrrChange,
  mrrHistory,
  needsAttention,
  netChangeThisMonth,
  noteActionLabel,
  noteKindFor,
  openSummary,
  patronCapacity,
  patronDisplayName,
  patronNoteOpening,
  payoutBreakdownFromBalance,
  platformFeeRate,
  tenureMonths,
  tenureSummary,
  twelveMonthRetention,
  weeklyPatronIncome,
  weekdayName,
  type PatronNoteInput,
  type PatronNoteModelClient,
  type PatronRecord,
} from './index';

// PRD-04's own fixture: Arya's twelve active patrons plus Anna P. who left,
// with "now" as Saturday 12 September 2026 (the prototype's today).
const NOW = new Date('2026-09-12T08:00:00Z');
const COURTSIDE = 't-court';
const LOCKER = 't-locker';
const INSIDE = 't-inside';
const PRICE: Record<string, number> = { [COURTSIDE]: 29, [LOCKER]: 65, [INSIDE]: 185 };

function patron(
  name: string,
  tierId: string,
  since: string,
  opens: PatronRecord['opens'],
  extra: Partial<PatronRecord> = {},
): PatronRecord {
  return {
    id: name,
    name,
    tierId,
    status: 'active',
    since: `${since}T09:00:00Z`,
    leftAt: null,
    leftReason: null,
    price: PRICE[tierId]!,
    currency: 'AUD',
    opens,
    cardFailedAt: null,
    cardRetryAt: null,
    source: 'unknown',
    ...extra,
  };
}

const PATRONS: PatronRecord[] = [
  patron('Mira Kovac', COURTSIDE, '2026-09-05', [null, null, null, null, null, 1], {
    source: 'draw',
  }),
  patron('Daniel Reiter', COURTSIDE, '2026-09-04', [null, null, null, null, null, 1], {
    source: 'profile',
  }),
  patron('Chris Obi', LOCKER, '2026-05-10', [1, 1, 1, 1, 1, 1]),
  patron('Jonas Weber', COURTSIDE, '2026-03-10', [1, 1, 0, 1, 1, 1]),
  patron('Elena Sommer', COURTSIDE, '2026-01-10', [1, 0, 1, 1, 0, 1]),
  patron('Petra Huber', COURTSIDE, '2025-11-10', [1, 1, 1, 0, 1, 1]),
  patron('Hanna Lang', LOCKER, '2025-08-10', [1, 1, 1, 1, 0, 1]),
  patron('Luca Moretti', COURTSIDE, '2025-09-10', [0, 1, 1, 1, 1, 0]),
  patron('Sophie Taler', COURTSIDE, '2025-06-10', [1, 1, 1, 0, 0, 0]),
  patron('Tom Brandt', COURTSIDE, '2025-04-10', [1, 1, 1, 1, 1, 1], {
    status: 'past_due',
    cardFailedAt: '2026-09-10T06:00:00Z',
    cardRetryAt: '2026-09-18T06:00:00Z',
  }),
  patron('Markus Fuchs', LOCKER, '2025-02-10', [1, 1, 1, 1, 1, 1]),
  patron('Gerhard Berger', INSIDE, '2025-01-10', [1, 1, 1, 1, 1, 1]),
  patron('Anna Pichler', LOCKER, '2025-06-25', [1, 1, 0, 0, null, null], {
    status: 'left',
    leftAt: '2026-08-25T10:00:00Z',
  }),
];

describe('fans metrics (PRD-04 section 7)', () => {
  it('P-AC-1: twelve active patrons, 8 / 3 / 1 by tier, gross MRR A$612', () => {
    const live = activePatrons(PATRONS);
    expect(live).toHaveLength(12);
    const byTier = (id: string) => live.filter((p) => p.tierId === id).length;
    expect([byTier(COURTSIDE), byTier(LOCKER), byTier(INSIDE)]).toEqual([8, 3, 1]);
    expect(grossMrr(PATRONS)).toBe(612);
  });

  it('P-AC-1: month-on-month change is MRR / last month - 1 (612 / 514 reads +19%)', () => {
    expect(Math.round(mrrChange(612, 514)! * 100)).toBe(19);
    expect(mrrChange(612, 0)).toBeNull();
  });

  it('builds six months of gross MRR, oldest first, with the current month live', () => {
    const history = mrrHistory(PATRONS, NOW);
    expect(history.map((m) => m.month)).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
    expect(history[5]!.gross).toBe(612);
    // End of August: Mira and Daniel not yet joined, Anna already gone.
    expect(history[4]!.gross).toBe(612 - 29 - 29);
  });

  it('counts "+2 this month" as September joins minus September departures', () => {
    expect(netChangeThisMonth(PATRONS, NOW)).toBe(2);
  });

  it('weekly patron income is MRR x 12 / 52', () => {
    expect(weeklyPatronIncome(612)).toBeCloseTo(141.23, 2);
  });

  it('tenure: whole months, averaged over active patrons, with the longest named', () => {
    expect(tenureMonths(PATRONS[0]!, NOW)).toBe(0);
    expect(tenureMonths(PATRONS[12]!, NOW)).toBe(14); // Anna: Jun 2025 to 25 Aug 2026
    const summary = tenureSummary(PATRONS, NOW);
    expect(summary.longest).toEqual({ name: 'Gerhard Berger', months: 20 });
    expect(summary.averageMonths).toBeGreaterThan(0);
  });

  it('twelve-month retention counts the year-ago cohort; one left in the last 90 days', () => {
    const r = twelveMonthRetention(PATRONS, NOW);
    // Active on 12 Sep 2025: Hanna, Luca, Sophie, Tom, Markus, Gerhard and Anna; only Anna has left.
    expect(r.percent).toBe(Math.round((6 / 7) * 100));
    expect(r.leftInLast90Days).toBe(1);
    expect(twelveMonthRetention([PATRONS[0]!], NOW).percent).toBeNull();
  });
});

describe('the Pro cap (M-TIER-3, P-3, P-AC-9)', () => {
  it('accepts checkout at 49 active patrons and offers the waitlist at 50', () => {
    expect(patronCapacity('pro', 49).full).toBe(false);
    expect(patronCapacity('pro', PRO_PATRON_CAP).full).toBe(true);
  });

  it('has no cap on Elite', () => {
    expect(patronCapacity('elite', 500)).toEqual({ cap: null, activeCount: 500, full: false });
  });
});

describe('payout arithmetic (worksheet 5 and 6, P-AC-2)', () => {
  const charges = [...Array<number>(8).fill(29), ...Array<number>(3).fill(65), 185];

  it('fee rate is 8 percent on Pro and 5 percent on Elite', () => {
    expect(platformFeeRate('pro')).toBe(0.08);
    expect(platformFeeRate('elite')).toBe(0.05);
    expect(platformFeeRate('free')).toBeNull();
  });

  it('A$612 gross -> fee A$49, Stripe A$14, net A$549 (displayed to the dollar)', () => {
    const p = estimatePayout(charges, 0.08);
    expect(p.gross).toBe(612);
    expect(Math.round(p.platformFee)).toBe(49);
    expect(Math.round(p.stripeFee)).toBe(14);
    expect(Math.round(p.net)).toBe(549);
    expect(p.net).toBeCloseTo(p.gross - p.platformFee - p.stripeFee, 10);
  });

  it('reads the same figures straight off Stripe balance transactions', () => {
    const lines = charges.map((amount) => ({
      type: 'charge',
      amount,
      feeDetails: [
        { type: 'application_fee', amount: Math.round(amount * 0.08 * 100) / 100 },
        { type: 'stripe_fee', amount: Math.round((amount * 0.0175 + 0.3) * 100) / 100 },
      ],
    }));
    lines.push({ type: 'payout', amount: -548.7, feeDetails: [] });
    const p = payoutBreakdownFromBalance(lines);
    expect(p).toEqual({ gross: 612, platformFee: 48.96, stripeFee: 14.34, net: 548.7 });
  });
});

describe('attention flags (PRD-04 section 7, P-9)', () => {
  const flagged = PATRONS.filter((p) => needsAttention(p, computePatronFlag(p, NOW), NOW)).map(
    (p) => p.name,
  );

  it('P-AC-4: Needs attention is exactly Sophie (quiet), Tom (card) and Anna (left)', () => {
    expect(flagged.sort()).toEqual(['Anna Pichler', 'Sophie Taler', 'Tom Brandt']);
  });

  it('flags quiet, card and new, one at most, card first', () => {
    const sophie = PATRONS.find((p) => p.name === 'Sophie Taler')!;
    expect(computePatronFlag(sophie, NOW)).toBe('quiet');
    expect(openSummary(sophie.opens)).toEqual({ opened: 3, delivered: 6 });
    expect(
      computePatronFlag(
        PATRONS.find((p) => p.name === 'Tom Brandt')!,
        NOW,
      ),
    ).toBe('card');
    expect(computePatronFlag(PATRONS[0]!, NOW)).toBe('new');
    expect(computePatronFlag(PATRONS[12]!, NOW)).toBe('none');
    expect(
      computePatronFlag({ ...sophie, status: 'past_due', cardFailedAt: NOW.toISOString() }, NOW),
    ).toBe('card');
  });

  it('does not call a patron quiet before 30 days, or with fewer than three delivered updates', () => {
    expect(
      computePatronFlag(
        { status: 'active', since: '2026-09-01T00:00:00Z', opens: [0, 0, 0], cardFailedAt: null },
        NOW,
      ),
    ).not.toBe('quiet');
    expect(
      computePatronFlag(
        {
          status: 'active',
          since: '2025-01-01T00:00:00Z',
          opens: [null, 0, 0],
          cardFailedAt: null,
        },
        NOW,
      ),
    ).toBe('none');
  });

  it('drops a departed patron from attention after 90 days', () => {
    const later = new Date('2026-12-01T00:00:00Z');
    expect(needsAttention(PATRONS[12]!, 'none', later)).toBe(false);
  });

  it('picks one note kind and action per row', () => {
    expect(noteKindFor({ status: 'left' }, 'none')).toBe('thanks');
    expect(noteActionLabel('thanks')).toBe('Send a thank-you');
    expect(noteKindFor({ status: 'past_due' }, 'card')).toBe('nudge');
    expect(noteActionLabel('nudge')).toBe('Nudge gently');
    expect(noteKindFor({ status: 'active' }, 'quiet')).toBe('checkin');
    expect(noteKindFor({ status: 'active' }, 'new')).toBe('welcome');
    expect(noteActionLabel('welcome')).toBe('Send a note');
  });
});

describe('attribution sentences (P-6, P-7, P-21)', () => {
  const clayBlock = { id: 'u1', title: 'Clay block, week two', sentAt: '2026-09-03T05:41:00Z' };

  it('P-AC-6: "48 hours after" the update, with the draw page source', () => {
    expect(
      joinAttribution({ atIso: '2026-09-05T05:41:00Z', source: 'draw', updates: [clayBlock] }),
    ).toBe('48 hours after "Clay block, week two" · found you via a draw page link');
    expect(eventTitle({ kind: 'join', patronName: 'Mira Kovac', tierName: 'Courtside' })).toBe(
      'Mira K. joined Courtside',
    );
  });

  it('reads "Same day as the update" and falls back to the source alone', () => {
    expect(
      joinAttribution({ atIso: '2026-09-03T20:00:00Z', source: 'profile', updates: [clayBlock] }),
    ).toBe('Same day as the update · came from your public profile');
    expect(joinAttribution({ atIso: '2026-09-03T20:00:00Z', source: 'unknown', updates: [] })).toBe(
      '',
    );
  });

  it('only attributes within seven days after the send time', () => {
    expect(attributedUpdate([clayBlock], '2026-09-10T05:40:00Z')).toBe(clayBlock);
    expect(attributedUpdate([clayBlock], '2026-09-10T05:42:00Z')).toBeNull();
    expect(attributedUpdate([clayBlock], '2026-09-02T00:00:00Z')).toBeNull();
  });

  it('P-AC-7: "14 months. ... No reason given." when the patron gives no reason', () => {
    expect(
      leaveAttribution({
        tenureMonths: 14,
        opens: [1, 1, 0, 0, null, null],
        lastOpenedAt: '2026-07-20T00:00:00Z',
        reason: null,
      }),
    ).toBe('14 months. Opened every update until July. No reason given.');
    expect(
      leaveAttribution({ tenureMonths: 1, opens: [], lastOpenedAt: null, reason: 'Moving house' }),
    ).toBe('1 month. "Moving house"');
  });

  it('shortens names to first name and last initial', () => {
    expect(patronDisplayName('Anna Pichler')).toBe('Anna P.');
    expect(patronDisplayName('Cher')).toBe('Cher');
    expect(
      eventTitle({ kind: 'card_failed', patronName: 'Tom Brandt', tierName: 'Courtside' }),
    ).toBe("Tom B.'s card payment failed");
  });
});

describe('drafted notes (P-10, P-AC-5, P-AC-8)', () => {
  const anna: PatronNoteInput = {
    kind: 'thanks',
    playerFirstName: 'Arya',
    patronFirstName: 'Anna',
    tierName: 'Locker Room',
    tenureMonths: 14,
    leftWhen: leftWhenPhrase('2026-08-25T10:00:00Z', NOW),
    otherPatronFirstNames: ['Mira', 'Tom', 'Anna'],
  };

  it('P-AC-5: a thank-you begins "Anna, I noticed you moved on last month"', async () => {
    const result = await generatePatronNote(createMockPatronNoteClient(), anna);
    expect(result.text.startsWith('Anna, I noticed you moved on last month')).toBe(true);
  });

  it('P-AC-8: a nudge says Stripe retries on Friday', () => {
    const opening = patronNoteOpening({
      ...anna,
      kind: 'nudge',
      patronFirstName: 'Tom',
      retryDay: weekdayName('2026-09-18T06:00:00Z'),
    });
    expect(opening).toContain("it'll retry on Friday");
  });

  it('rejects a draft that mentions money, runway, an em dash or another patron', () => {
    const opening = patronNoteOpening(anna);
    expect(checkPatronNote(`${opening} Your A$65 helped.`, anna)).toMatch(/money/);
    expect(checkPatronNote(`${opening} The runway is short.`, anna)).toMatch(/runway/);
    expect(checkPatronNote(`${opening} Thank you — truly.`, anna)).toMatch(/em dash/);
    expect(checkPatronNote(`${opening} Mira says hello.`, anna)).toMatch(/Mira/);
    expect(checkPatronNote(`Hi Anna. ${opening}`, anna)).toMatch(/opening/);
    expect(checkPatronNote(`${opening} It meant a lot.`, anna)).toBeNull();
  });

  it('retries once with a corrective prompt, then gives up with AgentValidationError', async () => {
    const prompts: string[] = [];
    const bad: PatronNoteModelClient = {
      async complete(prompt) {
        prompts.push(prompt.user);
        return {
          raw: { text: 'Hello there, this is not the opening at all.' },
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      },
    };
    await expect(generatePatronNote(bad, anna)).rejects.toBeInstanceOf(AgentValidationError);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('previous answer was not usable');
  });
});
