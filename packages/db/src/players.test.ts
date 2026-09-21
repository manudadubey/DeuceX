import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_AGENT_TOGGLES,
  GuardianEmailRequiredError,
  ageFromDob,
  canPublishProfile,
  countryDefaults,
  detectStage,
  finishOnboarding,
  isMinor,
  requireGuardianEmailIfMinor,
} from './players';
import type { Database } from './database.types';
import type { FinishOnboardingInput } from './players';

describe('detectStage', () => {
  it('is stage 1 with no tour ranking', () => {
    expect(detectStage(null)).toBe('1');
  });

  it('is stage 1 above 800', () => {
    expect(detectStage(801)).toBe('1');
  });

  it('is stage 2 between 450 and 800', () => {
    expect(detectStage(800)).toBe('2');
    expect(detectStage(487)).toBe('2');
    expect(detectStage(450)).toBe('2');
  });

  it('is stage 3 inside 450', () => {
    expect(detectStage(449)).toBe('3');
    expect(detectStage(1)).toBe('3');
  });
});

describe('ageFromDob / isMinor', () => {
  it('counts a full year only after the birthday has passed', () => {
    expect(ageFromDob('2008-09-20', new Date('2026-09-19T00:00:00Z'))).toBe(17);
    expect(ageFromDob('2008-09-20', new Date('2026-09-20T00:00:00Z'))).toBe(18);
  });

  it('flags under-18 as a minor', () => {
    expect(isMinor('2009-01-01', new Date('2026-09-21T00:00:00Z'))).toBe(true);
    expect(isMinor('2003-02-14', new Date('2026-09-21T00:00:00Z'))).toBe(false);
  });
});

describe('requireGuardianEmailIfMinor', () => {
  const asOf = new Date('2026-09-21T00:00:00Z');

  it('throws for a minor with no guardian email', () => {
    expect(() => requireGuardianEmailIfMinor('2010-01-01', null, asOf)).toThrow(
      GuardianEmailRequiredError,
    );
  });

  it('passes for a minor with a guardian email', () => {
    expect(() =>
      requireGuardianEmailIfMinor('2010-01-01', 'guardian@example.com', asOf),
    ).not.toThrow();
  });

  it('passes for an adult with no guardian email', () => {
    expect(() => requireGuardianEmailIfMinor('1998-01-01', null, asOf)).not.toThrow();
  });
});

describe('canPublishProfile', () => {
  it('is false when unverified (M-ID-2)', () => {
    expect(
      canPublishProfile({
        verification: 'unverified',
        dob: '1998-01-01',
        guardianEmail: null,
        guardianConfirmedAt: null,
      }),
    ).toBe(false);
  });

  it('is false for a verified minor whose guardian has not confirmed (M-ID-3)', () => {
    expect(
      canPublishProfile({
        verification: 'verified',
        dob: '2010-01-01',
        guardianEmail: 'guardian@example.com',
        guardianConfirmedAt: null,
      }),
    ).toBe(false);
  });

  it('is true for a verified minor once the guardian has confirmed', () => {
    expect(
      canPublishProfile({
        verification: 'verified',
        dob: '2010-01-01',
        guardianEmail: 'guardian@example.com',
        guardianConfirmedAt: '2026-09-01T00:00:00Z',
      }),
    ).toBe(true);
  });

  it('is true for a verified adult', () => {
    expect(
      canPublishProfile({
        verification: 'verified',
        dob: '1998-01-01',
        guardianEmail: null,
        guardianConfirmedAt: null,
      }),
    ).toBe(true);
  });
});

describe('countryDefaults', () => {
  it('returns the listed defaults for a known country', () => {
    expect(countryDefaults('Australia')).toEqual({
      homeCurrency: 'AUD',
      timezone: 'Australia/Sydney',
      appLanguage: 'en',
    });
  });

  it('falls back to AUD/UTC/en for an unlisted country', () => {
    expect(countryDefaults('Elbonia')).toEqual({
      homeCurrency: 'AUD',
      timezone: 'UTC',
      appLanguage: 'en',
    });
  });
});

function fakeUpsertQuery(result: { data: unknown; error: Error | null }) {
  const query: Record<string, unknown> = {};
  const chain = ['upsert', 'select', 'eq'];
  for (const method of chain) {
    query[method] = vi.fn().mockReturnValue(query);
  }
  query.single = vi.fn().mockResolvedValue(result);
  (query as unknown as { then: PromiseLike<unknown>['then'] }).then = (resolve) =>
    Promise.resolve(result).then(resolve as never);
  return query;
}

const baseInput: FinishOnboardingInput = {
  playerId: 'player-1',
  name: 'Arya Dubey',
  email: 'arya@example.com',
  country: 'Australia',
  dob: '1998-02-14',
  handed: 'right',
  tour: 'atp',
  tourPlayerId: 'B0AH',
  itfId: '800345612',
  verification: 'unverified',
  verificationSource: null,
  tourRank: null,
  tourPoints: null,
  itfRank: null,
  wtn: null,
  stage: '1',
  stagePinned: false,
  targetRank: 400,
  keyTournaments: [],
  surfaces: ['clay', 'hard'],
  weeklyBudget: 1200,
  blockedDates: null,
  plan: 'pro',
  billingCycle: 'monthly',
  agents: DEFAULT_AGENT_TOGGLES,
  guardianEmail: null,
  onboardingStartedAt: '2026-09-21T00:00:00Z',
};

describe('finishOnboarding', () => {
  it('throws before writing anything for an under-18 player with no guardian email', async () => {
    const from = vi.fn();
    const client = { from } as unknown as SupabaseClient<Database>;

    await expect(
      finishOnboarding(client, { ...baseInput, dob: '2012-01-01', guardianEmail: null }),
    ).rejects.toThrow(GuardianEmailRequiredError);
    expect(from).not.toHaveBeenCalled();
  });

  it('upserts the players row with defaults derived from country and plan', async () => {
    const playersQuery = fakeUpsertQuery({ data: { id: 'player-1' }, error: null });
    const from = vi.fn().mockReturnValue(playersQuery);
    const client = { from } as unknown as SupabaseClient<Database>;

    await finishOnboarding(client, baseInput);

    expect(from).toHaveBeenCalledWith('players');
    const [upsertArg, upsertOptions] = (playersQuery.upsert as ReturnType<typeof vi.fn>).mock
      .calls[0] as [Record<string, unknown>, { onConflict: string }];
    expect(upsertArg).toMatchObject({
      id: 'player-1',
      home_currency: 'AUD',
      app_language: 'en',
      timezone: 'Australia/Sydney',
      units: 'metric',
      dashboard_state: 'first',
      tier: 'pro',
      tier_status: 'trialing',
    });
    expect(upsertOptions).toEqual({ onConflict: 'id' });
  });

  it('sets tier_status to free for the Free plan, not trialing', async () => {
    const playersQuery = fakeUpsertQuery({ data: { id: 'player-1' }, error: null });
    const from = vi.fn().mockReturnValue(playersQuery);
    const client = { from } as unknown as SupabaseClient<Database>;

    await finishOnboarding(client, { ...baseInput, plan: 'free' });

    const upsertArg = (playersQuery.upsert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(upsertArg).toMatchObject({ tier: 'free', tier_status: 'free' });
  });

  it('writes a paused agent_schedules row only for agents turned off (mindset by default)', async () => {
    const playersQuery = fakeUpsertQuery({ data: { id: 'player-1' }, error: null });
    const schedulesQuery = { upsert: vi.fn().mockResolvedValue({ error: null }) };
    const from = vi.fn((table: string) => (table === 'players' ? playersQuery : schedulesQuery));
    const client = { from } as unknown as SupabaseClient<Database>;

    await finishOnboarding(client, baseInput);

    expect(schedulesQuery.upsert).toHaveBeenCalledWith(
      [{ player_id: 'player-1', agent_name: 'mindset', paused: true }],
      { onConflict: 'player_id,agent_name' },
    );
  });

  it('writes no agent_schedules rows when every agent is left on', async () => {
    const playersQuery = fakeUpsertQuery({ data: { id: 'player-1' }, error: null });
    const schedulesQuery = { upsert: vi.fn().mockResolvedValue({ error: null }) };
    const from = vi.fn((table: string) => (table === 'players' ? playersQuery : schedulesQuery));
    const client = { from } as unknown as SupabaseClient<Database>;

    await finishOnboarding(client, {
      ...baseInput,
      agents: { tournament: true, content: true, financial: true, mindset: true },
    });

    expect(schedulesQuery.upsert).not.toHaveBeenCalled();
  });
});
