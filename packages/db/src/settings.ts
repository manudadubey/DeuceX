import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// Hand-maintained unions for the fields PRD-12 fixes to exactly three or
// four choices, the same idiom players.ts already uses for tour/handed/etc.
// (none of these have a database CHECK constraint — Preferences validates
// client-side, same as the onboarding wizard's own toggle groups do).
export type AppLanguage = 'en' | 'zh' | 'es';
export type HomeCurrency = 'AUD' | 'USD' | 'CNY';
export type SpokenLanguage = 'auto' | 'en' | 'zh' | 'es' | 'de';
export type Units = 'metric' | 'imperial';
export type DateFormat = 'DMY' | 'MDY' | 'ISO';

export interface UpdateAccountInput {
  playerId: string;
  name: string;
  timezone: string;
}

// Account pane (PRD-12 4.2): name and time zone only. Email is shown
// read-only ("Verified · used for sign-in and agent emails") — the PRD's own
// copy gives it no edit control, and changing it for real needs Supabase's
// email-change verification flow, out of scope here.
export async function updateAccount(
  client: SupabaseClient<Database>,
  input: UpdateAccountInput,
): Promise<void> {
  const { error } = await client
    .from('players')
    .update({ name: input.name, timezone: input.timezone })
    .eq('id', input.playerId);
  if (error) throw error;
}

export interface UpdatePreferencesInput {
  playerId: string;
  appLanguage: AppLanguage;
  homeCurrency: HomeCurrency;
  spokenLanguage: SpokenLanguage;
  patronLanguage: string | null;
  units: Units;
  dateFormat: DateFormat;
}

// Preferences pane (PRD-12 4.3), one Save button writing every field at
// once. patronLanguage stays singular per decisions worksheet 9 ("One draft
// per language"), not the PRD prose's multi-select — see the step 2.3
// migration's design notes for the full reasoning.
export async function updatePreferences(
  client: SupabaseClient<Database>,
  input: UpdatePreferencesInput,
): Promise<void> {
  const { error } = await client
    .from('players')
    .update({
      app_language: input.appLanguage,
      home_currency: input.homeCurrency,
      spoken_language: input.spokenLanguage,
      patron_language: input.patronLanguage,
      units: input.units,
      date_format: input.dateFormat,
    })
    .eq('id', input.playerId);
  if (error) throw error;
}

// PRD-08 CE-17: the kg/lb control in the Conditions brief and the Equipment
// pane both need to write players.units without touching Preferences' other
// fields (updatePreferences above writes all of them at once, which would
// silently blank the rest) — a narrow single-column update, same shape as
// updateAccount above.
export async function updateUnits(
  client: SupabaseClient<Database>,
  input: { playerId: string; units: Units },
): Promise<void> {
  const { error } = await client
    .from('players')
    .update({ units: input.units })
    .eq('id', input.playerId);
  if (error) throw error;
}

export type NotificationChannel = 'in_app' | 'email' | 'push';
export type NotificationCategory = 'for_you' | 'fyi';
export const NOTIFICATION_AGENTS = [
  'tournament',
  'content',
  'mindset',
  'financial',
  'fans',
] as const;
export type NotificationAgent = (typeof NOTIFICATION_AGENTS)[number];

// PRD-12 4.5 / decisions worksheet 13: two rows per agent, three channels
// each. Stored as one jsonb column on players; a missing agent, category or
// channel key means "on", the same default-by-absence idiom agent_schedules
// already uses, so a player who never opens Notifications still gets every
// channel.
export type NotificationPrefs = Partial<
  Record<
    NotificationAgent,
    Partial<Record<NotificationCategory, Partial<Record<NotificationChannel, boolean>>>>
  >
>;

export function isNotificationChannelEnabled(
  prefs: NotificationPrefs,
  agent: NotificationAgent,
  category: NotificationCategory,
  channel: NotificationChannel,
): boolean {
  return prefs[agent]?.[category]?.[channel] ?? true;
}

/**
 * The Settings row a notification's `agent` belongs to. Notifications from
 * the platform itself (for example staff actions, agent `deucex`) have no
 * row, so every channel stays on for them.
 */
export function prefsAgentFor(agent: string): NotificationAgent | null {
  switch (agent) {
    case 'tournament':
    case 'conditions':
      return 'tournament';
    case 'content':
      return 'content';
    case 'mindset-coach':
    case 'mindset':
      return 'mindset';
    case 'financial':
      return 'financial';
    case 'fans':
    case 'stripe':
      return 'fans';
    default:
      return null;
  }
}

/**
 * The in-app rail (M-NOTIF-1) respects the in-app column too; a row with no
 * Settings agent always shows. Entry deadlines always keep at least one
 * channel, which the Notifications pane enforces before saving (ST-9).
 */
export function showsInApp(
  notification: { agent: string; category: NotificationCategory },
  prefs: NotificationPrefs,
): boolean {
  const agent = prefsAgentFor(notification.agent);
  return agent ? isNotificationChannelEnabled(prefs, agent, notification.category, 'in_app') : true;
}

// ST-9's "entry deadlines always keep at least one channel" rule: a soft UX
// guardrail on the Tournament Agent's For-you row, not a security boundary,
// so it is enforced here as a pure validator the Notifications pane calls
// before Save, not a database constraint.
export function hasAtLeastOneChannel(
  prefs: NotificationPrefs,
  agent: NotificationAgent,
  category: NotificationCategory,
): boolean {
  return (['in_app', 'email', 'push'] as const).some((channel) =>
    isNotificationChannelEnabled(prefs, agent, category, channel),
  );
}

export interface UpdateNotificationPrefsInput {
  playerId: string;
  notificationPrefs: NotificationPrefs;
  quietHoursStart: string;
  quietHoursEnd: string;
  reserveReminderEnabled: boolean;
}

export async function updateNotificationPrefs(
  client: SupabaseClient<Database>,
  input: UpdateNotificationPrefsInput,
): Promise<void> {
  const { error } = await client
    .from('players')
    .update({
      notification_prefs: input.notificationPrefs,
      quiet_hours_start: input.quietHoursStart,
      quiet_hours_end: input.quietHoursEnd,
      reserve_reminder_enabled: input.reserveReminderEnabled,
    })
    .eq('id', input.playerId);
  if (error) throw error;
}

// Agents pane (PRD-12 4.6): one pause switch per agent, mapping directly
// onto agent_schedules.paused. Both directions upsert the row: players have
// insert and update policies on agent_schedules but no delete policy, so the
// old "resume = delete the row" silently matched nothing under RLS and the
// agent stayed paused while the pane said it had resumed. A paused: false
// row means the same as no row to every reader (the pickup check, the
// console), and the console's own resume already writes one.
export async function setAgentPaused(
  client: SupabaseClient<Database>,
  playerId: string,
  agentName: string,
  paused: boolean,
): Promise<void> {
  const { error } = await client
    .from('agent_schedules')
    .upsert(
      { player_id: playerId, agent_name: agentName, paused, updated_at: new Date().toISOString() },
      { onConflict: 'player_id,agent_name' },
    );
  if (error) throw error;
}

export interface UpdateEmergencyContactInput {
  playerId: string;
  emergencyContact: string | null;
}

export async function updateEmergencyContact(
  client: SupabaseClient<Database>,
  input: UpdateEmergencyContactInput,
): Promise<void> {
  const { error } = await client
    .from('players')
    .update({ emergency_contact: input.emergencyContact })
    .eq('id', input.playerId);
  if (error) throw error;
}

// Plan & billing's "Downgrade to Free" (PRD-12 4.4, ST-8): no real Stripe
// Billing subscription exists yet (that lands with a later billing step), so
// there is no true period-end to defer to. This applies the tier change
// immediately, same as a Free signup at onboarding (finishOnboarding sets
// tier_status: 'free' the same way) — the confirmation copy's "takes effect
// <date>" is therefore a display approximation, flagged in BUILD-LOG, not a
// deferred write. Revisit once real Stripe Billing subscriptions exist.
export async function downgradeToFree(
  client: SupabaseClient<Database>,
  playerId: string,
): Promise<void> {
  const { error } = await client
    .from('players')
    .update({ tier: 'free', tier_status: 'free' })
    .eq('id', playerId);
  if (error) throw error;
}
