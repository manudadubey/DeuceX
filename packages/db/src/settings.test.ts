import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  downgradeToFree,
  hasAtLeastOneChannel,
  isNotificationChannelEnabled,
  setAgentPaused,
  updateAccount,
  updateEmergencyContact,
  updateNotificationPrefs,
  updatePreferences,
} from './settings';
import type { Database } from './database.types';

function fakeQuery(result: { data: unknown; error: Error | null }) {
  const query: Record<string, unknown> = {};
  const chain = ['select', 'eq', 'insert', 'update', 'upsert', 'delete', 'order'];
  for (const method of chain) {
    query[method] = vi.fn().mockReturnValue(query);
  }
  query.single = vi.fn().mockResolvedValue(result);
  (query as unknown as { then: PromiseLike<unknown>['then'] }).then = (resolve) =>
    Promise.resolve(result).then(resolve as never);
  return query;
}

describe('updateAccount', () => {
  it('writes only name and timezone, not email', async () => {
    const query = fakeQuery({ data: null, error: null });
    const from = vi.fn().mockReturnValue(query);
    const client = { from } as unknown as SupabaseClient<Database>;

    await updateAccount(client, {
      playerId: 'player-1',
      name: 'Arya Dubey',
      timezone: 'Europe/Vienna',
    });

    expect(from).toHaveBeenCalledWith('players');
    expect(query.update).toHaveBeenCalledWith({ name: 'Arya Dubey', timezone: 'Europe/Vienna' });
    expect(query.eq).toHaveBeenCalledWith('id', 'player-1');
  });
});

describe('updatePreferences', () => {
  it('writes every preference field in one update, patron_language singular', async () => {
    const query = fakeQuery({ data: null, error: null });
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>;

    await updatePreferences(client, {
      playerId: 'player-1',
      appLanguage: 'en',
      homeCurrency: 'AUD',
      spokenLanguage: 'auto',
      patronLanguage: 'en',
      units: 'metric',
      dateFormat: 'DMY',
    });

    expect(query.update).toHaveBeenCalledWith({
      app_language: 'en',
      home_currency: 'AUD',
      spoken_language: 'auto',
      patron_language: 'en',
      units: 'metric',
      date_format: 'DMY',
    });
  });
});

describe('isNotificationChannelEnabled / hasAtLeastOneChannel', () => {
  it('defaults every agent/category/channel to on when the row is empty', () => {
    expect(isNotificationChannelEnabled({}, 'tournament', 'for_you', 'push')).toBe(true);
  });

  it('respects an explicit false', () => {
    const prefs = { tournament: { for_you: { push: false } } };
    expect(isNotificationChannelEnabled(prefs, 'tournament', 'for_you', 'push')).toBe(false);
    expect(isNotificationChannelEnabled(prefs, 'tournament', 'for_you', 'email')).toBe(true);
  });

  it('is true by default (every channel defaults on)', () => {
    expect(hasAtLeastOneChannel({}, 'tournament', 'for_you')).toBe(true);
  });

  it('is false once every channel for that row is explicitly off (ST-9 guardrail)', () => {
    const prefs = {
      tournament: { for_you: { in_app: false, email: false, push: false } },
    };
    expect(hasAtLeastOneChannel(prefs, 'tournament', 'for_you')).toBe(false);
  });
});

describe('updateNotificationPrefs', () => {
  it('writes prefs, quiet hours and the reminder toggle together', async () => {
    const query = fakeQuery({ data: null, error: null });
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>;

    await updateNotificationPrefs(client, {
      playerId: 'player-1',
      notificationPrefs: { fans: { fyi: { push: false } } },
      quietHoursStart: '22:00',
      quietHoursEnd: '07:00',
      reserveReminderEnabled: false,
    });

    expect(query.update).toHaveBeenCalledWith({
      notification_prefs: { fans: { fyi: { push: false } } },
      quiet_hours_start: '22:00',
      quiet_hours_end: '07:00',
      reserve_reminder_enabled: false,
    });
  });
});

describe('setAgentPaused', () => {
  it('upserts a paused row when pausing', async () => {
    const query = fakeQuery({ data: null, error: null });
    const from = vi.fn().mockReturnValue(query);
    const client = { from } as unknown as SupabaseClient<Database>;

    await setAgentPaused(client, 'player-1', 'tournament', true);

    expect(from).toHaveBeenCalledWith('agent_schedules');
    expect(query.upsert).toHaveBeenCalledWith(
      { player_id: 'player-1', agent_name: 'tournament', paused: true },
      { onConflict: 'player_id,agent_name' },
    );
  });

  it('deletes the row when unpausing, rather than writing paused: false', async () => {
    const query = fakeQuery({ data: null, error: null });
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>;

    await setAgentPaused(client, 'player-1', 'tournament', false);

    expect(query.delete).toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith('agent_name', 'tournament');
  });
});

describe('updateEmergencyContact', () => {
  it('allows null to clear it', async () => {
    const query = fakeQuery({ data: null, error: null });
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>;

    await updateEmergencyContact(client, { playerId: 'player-1', emergencyContact: null });

    expect(query.update).toHaveBeenCalledWith({ emergency_contact: null });
  });
});

describe('downgradeToFree', () => {
  it('sets tier and tier_status to free', async () => {
    const query = fakeQuery({ data: null, error: null });
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>;

    await downgradeToFree(client, 'player-1');

    expect(query.update).toHaveBeenCalledWith({ tier: 'free', tier_status: 'free' });
  });
});
