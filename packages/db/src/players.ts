import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// Hand-maintained unions for players' check constraints (step 0.2 and step
// 1.4 migrations), the same idiom notes.ts and mindset.ts already use.
export type PlayerTour = 'atp' | 'wta';
export type PlayerVerification = 'verified' | 'ambiguous' | 'unverified';
export type PlayerHanded = 'right' | 'left';
export type PlayerSurface = 'clay' | 'hard' | 'indoor_hard' | 'grass';
export type PlayerPlan = 'free' | 'pro' | 'elite';
export type PlayerBillingCycle = 'monthly' | 'annual';
export type PlayerDashboardState = 'first' | 'full';

export type Player = Database['public']['Tables']['players']['Row'];

// PRD-00 section 3's thresholds, read off the verified singles ranking on
// the player's own tour (M-STG-1, M-STG-3): "no surface may hard-code ATP",
// so this takes a plain number, not a tour-specific field.
export function detectStage(tourRank: number | null): '1' | '2' | '3' {
  if (tourRank === null || tourRank > 800) return '1';
  if (tourRank >= 450) return '2';
  return '3';
}

// Whole years as of `asOf` (defaults to now), the ordinary "have they had
// their birthday yet this year" calculation.
export function ageFromDob(dob: string, asOf: Date = new Date()): number {
  const birth = new Date(dob);
  let age = asOf.getUTCFullYear() - birth.getUTCFullYear();
  const hasHadBirthdayThisYear =
    asOf.getUTCMonth() > birth.getUTCMonth() ||
    (asOf.getUTCMonth() === birth.getUTCMonth() && asOf.getUTCDate() >= birth.getUTCDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

export function isMinor(dob: string, asOf: Date = new Date()): boolean {
  return ageFromDob(dob, asOf) < 18;
}

export class GuardianEmailRequiredError extends Error {
  constructor() {
    super('A guardian email is required for players under 18 (M-ID-3)');
  }
}

// OB-6 / decisions worksheet 1: a hard blocker, checked again here so the
// rule holds even if a client ever skips the UI's own guard.
export function requireGuardianEmailIfMinor(
  dob: string,
  guardianEmail: string | null | undefined,
  asOf: Date = new Date(),
): void {
  if (isMinor(dob, asOf) && !guardianEmail) throw new GuardianEmailRequiredError();
}

// M-ID-2 / decisions worksheet 2: "no public profile until verified." The
// guardian branch (M-ID-3, worksheet 1) adds a second gate on top: a minor's
// profile stays off until the guardian has confirmed, even once the ranking
// itself is verified. No public-profile editor exists yet (that arrives with
// a later step); this is the pure predicate future publish UI gates on.
export function canPublishProfile(player: {
  verification: string;
  dob: string;
  guardianEmail: string | null;
  guardianConfirmedAt: string | null;
}): boolean {
  if (player.verification !== 'verified') return false;
  if (isMinor(player.dob) && !player.guardianConfirmedAt) return false;
  return true;
}

// PRD-11 section 12 flags the country select as wired to nothing; step 1.4
// fixes that for the country list the step 1 form actually offers. "Other"
// intentionally falls through to the same effectively-unset defaults
// Preferences already initialises to (PRD-12), since there's no single
// correct guess for an unlisted country.
export interface CountryDefaults {
  homeCurrency: string;
  timezone: string;
  appLanguage: string;
}

export const COUNTRY_DEFAULTS: Record<string, CountryDefaults> = {
  Austria: { homeCurrency: 'EUR', timezone: 'Europe/Vienna', appLanguage: 'en' },
  Australia: { homeCurrency: 'AUD', timezone: 'Australia/Sydney', appLanguage: 'en' },
  Germany: { homeCurrency: 'EUR', timezone: 'Europe/Berlin', appLanguage: 'en' },
  Italy: { homeCurrency: 'EUR', timezone: 'Europe/Rome', appLanguage: 'en' },
  Spain: { homeCurrency: 'EUR', timezone: 'Europe/Madrid', appLanguage: 'en' },
  China: { homeCurrency: 'CNY', timezone: 'Asia/Shanghai', appLanguage: 'zh' },
  'United States': { homeCurrency: 'USD', timezone: 'America/New_York', appLanguage: 'en' },
};

export const DEFAULT_COUNTRY_DEFAULTS: CountryDefaults = {
  homeCurrency: 'AUD',
  timezone: 'UTC',
  appLanguage: 'en',
};

export function countryDefaults(country: string): CountryDefaults {
  return COUNTRY_DEFAULTS[country] ?? DEFAULT_COUNTRY_DEFAULTS;
}

// The four v1 agents step 4 offers (build plan step 1.4 / PRD-11 OB-12).
export const ONBOARDING_AGENTS = ['tournament', 'content', 'financial', 'mindset'] as const;
export type OnboardingAgent = (typeof ONBOARDING_AGENTS)[number];

export interface AgentToggles {
  tournament: boolean;
  content: boolean;
  financial: boolean;
  mindset: boolean;
}

// PRD-11 section 4.1 step 4: Tournament, Content and Financial default on;
// Mindset defaults off ("starts after your third Match Scribe note").
export const DEFAULT_AGENT_TOGGLES: AgentToggles = {
  tournament: true,
  content: true,
  financial: true,
  mindset: false,
};

export interface FinishOnboardingInput {
  playerId: string;
  name: string;
  email: string;
  country: string;
  dob: string;
  handed: PlayerHanded;
  tour: PlayerTour;
  tourPlayerId: string | null;
  itfId: string | null;
  verification: PlayerVerification;
  verificationSource: string | null;
  tourRank: number | null;
  tourPoints: number | null;
  itfRank: number | null;
  wtn: number | null;
  stage: '1' | '2' | '3';
  stagePinned: boolean;
  targetRank: number | null;
  keyTournaments: string[];
  surfaces: PlayerSurface[];
  weeklyBudget: number | null;
  blockedDates: string | null;
  plan: PlayerPlan;
  billingCycle: PlayerBillingCycle;
  agents: AgentToggles;
  guardianEmail: string | null;
  onboardingStartedAt: string;
  timezone?: string;
}

// Onboarding's single write (PRD-11 section 3, Failure behaviour: "no
// answer is persisted before the final step"). Plain RLS-scoped writes — no
// vendor side effect here (Stripe trial creation is step 2.x's job; see the
// migration's design notes) — so this runs on the player's own anon-scoped
// client the same way notes.ts and mindset.ts do, with RLS itself
// (players_insert_own, players_update_own, agent_schedules_insert_own) as
// the real authorization, not this function.
//
// upsert, not insert: OB-17's "Replay setup" reopens onboarding "without
// discarding existing answers" for a player who has already finished it
// once. Every column this function writes is listed explicitly in the
// payload below, so the ON CONFLICT DO UPDATE this generates only ever
// touches those columns — guardian_confirmed_at and the deletion_* audit
// timestamps, notably absent from the payload, are never overwritten by a
// second onboarding run.
export async function finishOnboarding(
  client: SupabaseClient<Database>,
  input: FinishOnboardingInput,
): Promise<Player> {
  requireGuardianEmailIfMinor(input.dob, input.guardianEmail);

  const defaults = countryDefaults(input.country);
  const finishedAt = new Date().toISOString();

  const { data: player, error } = await client
    .from('players')
    .upsert(
      {
        id: input.playerId,
        name: input.name,
        email: input.email,
        country: input.country,
        dob: input.dob,
        handed: input.handed,
        tour: input.tour,
        tour_player_id: input.tourPlayerId,
        itf_id: input.itfId,
        verification: input.verification,
        verification_source: input.verificationSource,
        tour_rank: input.tourRank,
        tour_points: input.tourPoints,
        itf_rank: input.itfRank,
        wtn: input.wtn,
        stage: input.stage,
        stage_pinned: input.stagePinned,
        target_rank: input.targetRank,
        key_tournaments: input.keyTournaments,
        surfaces: input.surfaces,
        weekly_budget: input.weeklyBudget,
        blocked_dates: input.blockedDates,
        tier: input.plan,
        tier_status: input.plan === 'free' ? 'free' : 'trialing',
        billing_cycle: input.billingCycle,
        guardian_email: input.guardianEmail,
        home_currency: defaults.homeCurrency,
        app_language: defaults.appLanguage,
        units: 'metric',
        timezone: input.timezone ?? defaults.timezone,
        patron_language: null,
        dashboard_state: 'first',
        onboarding_started_at: input.onboardingStartedAt,
        onboarding_finished_at: finishedAt,
      },
      { onConflict: 'id' },
    )
    .select('*')
    .single();
  if (error) throw error;

  // Only agents left off get a row at all, matching agent_schedules' own
  // "no row = not paused" default (step 0.6) rather than writing all four
  // every time. Known gap on replay (OB-17): switching a previously-off
  // agent back on does not un-pause an existing row here — nothing in this
  // step builds the pause/resume surface that would do that (Agent Studio,
  // Elite-only, later phase); upsert at least makes finishing onboarding
  // twice with the same agent off idempotent rather than a conflict error.
  const pausedAgents = ONBOARDING_AGENTS.filter((agent) => !input.agents[agent]);
  if (pausedAgents.length > 0) {
    const { error: scheduleError } = await client.from('agent_schedules').upsert(
      pausedAgents.map((agent) => ({
        player_id: input.playerId,
        agent_name: agent,
        paused: true,
      })),
      { onConflict: 'player_id,agent_name' },
    );
    if (scheduleError) throw scheduleError;
  }

  return player;
}
