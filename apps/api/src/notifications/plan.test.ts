import { prefsAgentFor, showsInApp } from '@deucex/db';
import { describe, expect, it } from 'vitest';
import {
  deadlineBreaksThrough,
  inQuietHours,
  planDeliveries,
  quietHoursEnd,
  weekStart,
  type PlanPlayer,
} from './plan';

const SYDNEY = 'Australia/Sydney'; // UTC+10 until 4 October 2026
const QUIET = { start: '22:00', end: '07:00' };

function player(overrides: Partial<PlanPlayer> = {}): PlanPlayer {
  return {
    email: 'arya@example.test',
    timezone: SYDNEY,
    quietHours: QUIET,
    prefs: {},
    hasPushSubscription: true,
    fyiEmailsLastWeek: 0,
    ...overrides,
  };
}

// 13:00 UTC on 22 September is 23:00 in Sydney.
const AT_2300_SYDNEY = new Date('2026-09-22T13:00:00Z');
// 03:00 UTC is 13:00 in Sydney.
const AT_1300_SYDNEY = new Date('2026-09-22T03:00:00Z');

describe('quiet hours (M-NOTIF-2, ST-10)', () => {
  it('holds a delivery inside 22:00 to 07:00 local until 07:00', () => {
    expect(inQuietHours(AT_2300_SYDNEY, SYDNEY, QUIET)).toBe(true);
    expect(inQuietHours(AT_1300_SYDNEY, SYDNEY, QUIET)).toBe(false);
    // 07:00 Sydney on 23 September is 21:00 UTC on the 22nd.
    expect(quietHoursEnd(AT_2300_SYDNEY, SYDNEY, QUIET).toISOString()).toBe(
      '2026-09-22T21:00:00.000Z',
    );
    const [email, push] = planDeliveries(
      { agent: 'tournament', category: 'fyi', deadlineAt: null },
      player(),
      AT_2300_SYDNEY,
    );
    expect(email).toMatchObject({ channel: 'email', heldForQuietHours: true });
    expect(push?.dueAt.toISOString()).toBe('2026-09-22T21:00:00.000Z');
  });

  it('handles a window that does not wrap midnight, and an empty one', () => {
    expect(inQuietHours(AT_1300_SYDNEY, SYDNEY, { start: '12:00', end: '14:00' })).toBe(true);
    expect(inQuietHours(AT_1300_SYDNEY, SYDNEY, { start: '07:00', end: '07:00' })).toBe(false);
  });

  it('ST-AC-7: an entry deadline 12 hours away at 23:00 is delivered at once', () => {
    const deadlineAt = new Date(AT_2300_SYDNEY.getTime() + 12 * 3_600_000).toISOString();
    const planned = planDeliveries(
      { agent: 'tournament', category: 'for_you', deadlineAt },
      player(),
      AT_2300_SYDNEY,
    );
    expect(planned.map((p) => [p.channel, p.heldForQuietHours, p.dueAt])).toEqual([
      ['email', false, AT_2300_SYDNEY],
      ['push', false, AT_2300_SYDNEY],
    ]);
  });

  it('still holds a deadline further than 24 hours out, or already past', () => {
    const now = AT_2300_SYDNEY.getTime();
    expect(
      deadlineBreaksThrough(new Date(now + 30 * 3_600_000).toISOString(), AT_2300_SYDNEY),
    ).toBe(false);
    expect(deadlineBreaksThrough(new Date(now - 3_600_000).toISOString(), AT_2300_SYDNEY)).toBe(
      false,
    );
  });
});

describe('channels (ST-9)', () => {
  it('follows the per agent, category and channel matrix, with missing keys on', () => {
    const planned = planDeliveries(
      { agent: 'mindset-coach', category: 'for_you', deadlineAt: null },
      player({ prefs: { mindset: { for_you: { email: false } } } }),
      AT_1300_SYDNEY,
    );
    expect(planned.map((p) => p.channel)).toEqual(['push']);
  });

  it('sends no push without a subscription, and no email without an address', () => {
    expect(
      planDeliveries(
        { agent: 'financial', category: 'fyi', deadlineAt: null },
        player({ hasPushSubscription: false, email: null }),
        AT_1300_SYDNEY,
      ),
    ).toEqual([]);
  });

  it('keeps every channel on for platform notifications with no Settings row', () => {
    expect(prefsAgentFor('deucex')).toBeNull();
    const planned = planDeliveries(
      { agent: 'deucex', category: 'for_you', deadlineAt: null },
      player({ prefs: { tournament: { for_you: { email: false, push: false } } } }),
      AT_1300_SYDNEY,
    );
    expect(planned.map((p) => p.channel)).toEqual(['email', 'push']);
  });

  it('maps every agent that writes notifications to its Settings row', () => {
    expect(prefsAgentFor('mindset-coach')).toBe('mindset');
    expect(prefsAgentFor('conditions')).toBe('tournament');
    expect(prefsAgentFor('stripe')).toBe('fans');
  });

  it('hides a notification from the rail when its in-app switch is off', () => {
    const prefs = { content: { fyi: { in_app: false } } };
    expect(showsInApp({ agent: 'content', category: 'fyi' }, prefs)).toBe(false);
    expect(showsInApp({ agent: 'content', category: 'for_you' }, prefs)).toBe(true);
  });
});

describe('weekly digest (M-NOTIF-3)', () => {
  it('sends the first five FYI emails of a week, then digests the rest', () => {
    const fifth = planDeliveries(
      { agent: 'fans', category: 'fyi', deadlineAt: null },
      player({ fyiEmailsLastWeek: 4 }),
      AT_1300_SYDNEY,
    );
    expect(fifth[0]).toMatchObject({ channel: 'email', status: 'pending' });
    const sixth = planDeliveries(
      { agent: 'fans', category: 'fyi', deadlineAt: null },
      player({ fyiEmailsLastWeek: 5 }),
      AT_1300_SYDNEY,
    );
    expect(sixth[0]).toMatchObject({ channel: 'email', status: 'digest' });
    // Push is never digested.
    expect(sixth[1]).toMatchObject({ channel: 'push', status: 'pending' });
  });

  it('never digests a For-you email', () => {
    const planned = planDeliveries(
      { agent: 'fans', category: 'for_you', deadlineAt: null },
      player({ fyiEmailsLastWeek: 12 }),
      AT_1300_SYDNEY,
    );
    expect(planned[0]).toMatchObject({ channel: 'email', status: 'pending' });
  });

  it("starts the week on the player's local Monday", () => {
    // Tuesday 22 September 2026 in Sydney.
    expect(weekStart(AT_1300_SYDNEY, SYDNEY)).toBe('2026-09-21');
  });
});
