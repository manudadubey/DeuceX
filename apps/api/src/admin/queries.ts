import type { AdminRole } from '@deucex/shared';
import { AGENTS, PROVIDERS, agentInfo } from './agents-registry';
import { APPROVAL_THRESHOLD, PRO_PRICE_AUD, SPEND_CAP_AUD } from './aggregation';
import type { ConsoleQuery } from './console-db';

// Read models for the console pages (PRD-13 section 4). Every query here
// runs as the console role (console-db.ts), so the step 5.1 grants bound
// what each one can even ask for: nothing below selects note content,
// moods, photo references, patron identities or share tokens, and a
// query that tried would fail with a permission error rather than leak.

export const ELITE_PRICE_AUD = 149;
const DAY_MS = 24 * 60 * 60 * 1000;

export type PlayerStatus =
  'Active' | 'Trial' | 'Past due' | 'Unverified' | 'Minor' | 'Dormant' | 'Deleting';

export interface PlayerStatusInput {
  dob: string;
  verification: string;
  tierStatus: string | null;
  trialEndsAt: string | null;
  deletionEffectiveAt: string | null;
  createdAt: string;
  lastActiveAt: string | null;
}

export function ageOn(dob: string, now: Date): number {
  const birth = new Date(`${dob}T00:00:00Z`);
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

/** PRD-13 section 4.3's statuses, most urgent first when several apply. */
export function playerStatus(p: PlayerStatusInput, now: Date): PlayerStatus {
  if (p.deletionEffectiveAt && new Date(p.deletionEffectiveAt).getTime() > now.getTime()) {
    return 'Deleting';
  }
  if (p.tierStatus === 'past_due') return 'Past due';
  if (ageOn(p.dob, now) < 18) return 'Minor';
  if (p.verification !== 'verified') return 'Unverified';
  if (
    p.tierStatus === 'trialing' ||
    (p.trialEndsAt && new Date(p.trialEndsAt).getTime() > now.getTime())
  )
    return 'Trial';
  const lastActive = p.lastActiveAt ?? p.createdAt;
  if (now.getTime() - new Date(lastActive).getTime() > 30 * DAY_MS) return 'Dormant';
  return 'Active';
}

interface PlayerRow {
  id: string;
  name: string;
  email: string;
  country: string;
  tour: string;
  dob: string;
  tier: string | null;
  tier_status: string | null;
  stage: string | null;
  stage_pinned: boolean;
  verification: string;
  verification_source: string | null;
  tour_player_id: string | null;
  itf_id: string | null;
  tour_rank: number | null;
  itf_rank: number | null;
  trial_ends_at: string | null;
  deletion_effective_at: string | null;
  deletion_requested_at: string | null;
  created_at: string;
  last_active_at: string | null;
  patrons: number;
  guardian_email: string | null;
  guardian_confirmed_at: string | null;
}

const PLAYER_COLUMNS = `
  p.id, p.name, p.email, p.country, p.tour, p.dob::text as dob, p.tier, p.tier_status, p.stage,
  p.stage_pinned, p.verification, p.verification_source, p.tour_player_id, p.itf_id,
  p.tour_rank, p.itf_rank, p.trial_ends_at, p.deletion_effective_at, p.deletion_requested_at,
  p.created_at, p.guardian_email, p.guardian_confirmed_at,
  greatest(
    (select max(n.created_at) from public.notes n where n.player_id = p.id),
    (select max(c.created_at) from public.check_ins c where c.player_id = p.id)
  ) as last_active_at,
  (select count(*)::int from public.patrons pa where pa.player_id = p.id and pa.status = 'active') as patrons`;

export interface PlayerListItem {
  id: string;
  name: string;
  email: string;
  country: string;
  tour: string;
  ranking: string | null;
  stage: string | null;
  tier: string;
  status: PlayerStatus;
  patrons: number;
  lastActiveAt: string | null;
}

function rankingLabel(p: Pick<PlayerRow, 'tour' | 'tour_rank' | 'itf_rank'>): string | null {
  if (p.tour_rank) return `${p.tour.toUpperCase()} ${p.tour_rank}`;
  if (p.itf_rank) return `ITF ${p.itf_rank}`;
  return null;
}

function toListItem(p: PlayerRow, now: Date): PlayerListItem {
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    country: p.country,
    tour: p.tour,
    ranking: rankingLabel(p),
    stage: p.stage,
    tier: p.tier ?? 'free',
    status: statusOf(p, now),
    patrons: p.patrons,
    lastActiveAt: p.last_active_at,
  };
}

function statusOf(p: PlayerRow, now: Date): PlayerStatus {
  return playerStatus(
    {
      dob: p.dob,
      verification: p.verification,
      tierStatus: p.tier_status,
      trialEndsAt: p.trial_ends_at,
      deletionEffectiveAt: p.deletion_effective_at,
      createdAt: p.created_at,
      lastActiveAt: p.last_active_at,
    },
    now,
  );
}

export interface PlayersQuery {
  q?: string;
  tier?: string;
  status?: string;
}

export async function listPlayers(q: ConsoleQuery, filter: PlayersQuery, now: Date) {
  const search = filter.q?.trim() ?? '';
  const { rows } = await q.query<PlayerRow>(
    `select ${PLAYER_COLUMNS}
     from public.players p
     where ($1 = '' or p.name ilike '%' || $1 || '%' or p.email ilike '%' || $1 || '%'
            or p.country ilike $1 or p.tour_player_id = $1 or p.itf_id = $1
            or p.tour_rank::text = $1 or p.itf_rank::text = $1)
       and ($2 = '' or coalesce(p.tier, 'free') = $2)
     order by p.created_at desc
     limit 200`,
    [search, filter.tier ?? ''],
  );
  const all = rows.map((r) => toListItem(r, now));
  const players = filter.status ? all.filter((p) => p.status === filter.status) : all;

  const { rows: statsRows } = await q.query<{
    total: number;
    free: number;
    pro: number;
    elite: number;
    atp: number;
    wta: number;
    stage1: number;
    stage2: number;
    stage3: number;
    unverified: number;
    ambiguous: number;
    minors: number;
    minors_confirmed: number;
  }>(
    `select count(*)::int as total,
            count(*) filter (where coalesce(tier, 'free') = 'free')::int as free,
            count(*) filter (where tier = 'pro')::int as pro,
            count(*) filter (where tier = 'elite')::int as elite,
            count(*) filter (where tour = 'atp')::int as atp,
            count(*) filter (where tour = 'wta')::int as wta,
            count(*) filter (where stage = '1')::int as stage1,
            count(*) filter (where stage = '2')::int as stage2,
            count(*) filter (where stage = '3')::int as stage3,
            count(*) filter (where verification <> 'verified')::int as unverified,
            count(*) filter (where verification = 'ambiguous')::int as ambiguous,
            count(*) filter (where dob > ($1::date - interval '18 years'))::int as minors,
            count(*) filter (where dob > ($1::date - interval '18 years') and guardian_confirmed_at is not null)::int as minors_confirmed
     from public.players`,
    [now.toISOString().slice(0, 10)],
  );
  const dormant = all.filter((p) => p.status === 'Dormant').length;
  return { stats: { ...statsRows[0]!, dormant }, players };
}

export async function getPlayerDetail(q: ConsoleQuery, playerId: string, now: Date) {
  const { rows } = await q.query<
    PlayerRow & {
      home_currency: string;
      timezone: string;
      app_language: string;
      spoken_language: string;
      billing_cycle: string | null;
      comp_tier: string | null;
      comp_until: string | null;
      onboarding_started_at: string | null;
    }
  >(
    `select ${PLAYER_COLUMNS}, p.home_currency, p.timezone, p.app_language, p.spoken_language,
            p.billing_cycle, p.comp_tier, p.comp_until, p.onboarding_started_at
     from public.players p where p.id = $1`,
    [playerId],
  );
  const p = rows[0];
  if (!p) return null;

  const [links, schedules, spend, audit, approvals] = await Promise.all([
    q.query<{
      id: string;
      scope: string;
      created_at: string;
      expires_at: string;
      revoked: boolean;
      last_opened_at: string | null;
      open_count: number;
    }>(
      `select id, scope, created_at, expires_at, revoked, last_opened_at, open_count
       from public.share_links where player_id = $1 order by created_at desc`,
      [playerId],
    ),
    q.query<{ agent_name: string; paused: boolean }>(
      `select agent_name, paused from public.agent_schedules where player_id = $1`,
      [playerId],
    ),
    q.query<{ usd: string }>(
      `select coalesce(sum(cost_amount), 0)::text as usd from public.agent_runs
       where player_id = $1 and started_at >= date_trunc('month', $2::timestamptz)`,
      [playerId, now.toISOString()],
    ),
    q.query<{
      id: string;
      action_type: string;
      admin_name: string | null;
      role_at_time: string;
      consequence: string;
      reason: string | null;
      created_at: string;
    }>(
      `select id, action_type, admin_name, role_at_time, consequence, reason, created_at
       from public.admin_actions where player_id = $1 order by created_at desc limit 50`,
      [playerId],
    ),
    q.query<{ id: string; action_type: string; approved_at: string }>(
      `select id, action_type, approved_at from public.approvals
       where player_id = $1 order by approved_at desc limit 50`,
      [playerId],
    ),
  ]);

  const pausedAgents = schedules.rows.filter((s) => s.paused).map((s) => s.agent_name);
  const queued = AGENTS.filter((a) => a.queued).map((a) => a.name);
  const age = ageOn(p.dob, now);

  // The player's audit log as the player sees it (their own approvals and
  // the staff actions on their account), newest first, admin rows marked.
  const log = [
    ...audit.rows.map((a) => ({
      id: a.id,
      at: a.created_at,
      actor: 'admin' as const,
      actorName: a.admin_name,
      role: a.role_at_time,
      action: a.action_type,
      detail: a.consequence,
      reason: a.reason,
    })),
    ...approvals.rows.map((a) => ({
      id: a.id,
      at: a.approved_at,
      actor: 'player' as const,
      actorName: p.name,
      role: null,
      action: a.action_type,
      detail: null,
      reason: null,
    })),
  ].sort((x, y) => y.at.localeCompare(x.at));

  return {
    ...toListItem(p, now),
    dob: p.dob,
    age,
    minor: age < 18,
    guardian: age < 18 ? { email: p.guardian_email, confirmedAt: p.guardian_confirmed_at } : null,
    stagePinned: p.stage_pinned,
    tourPlayerId: p.tour_player_id,
    itfId: p.itf_id,
    verification: p.verification,
    verificationSource: p.verification_source,
    homeCurrency: p.home_currency,
    timezone: p.timezone,
    languages: [...new Set([p.app_language, p.spoken_language])],
    signedUpAt: p.created_at,
    signUpChannel: p.onboarding_started_at ? 'Onboarding' : 'Unknown',
    billingCycle: p.billing_cycle,
    trialEndsAt: p.trial_ends_at,
    comp: p.comp_tier ? { tier: p.comp_tier, until: p.comp_until } : null,
    deletionEffectiveAt: p.deletion_effective_at,
    agentSchedule: {
      paused: pausedAgents,
      allPaused: queued.every((a) => pausedAgents.includes(a)),
    },
    modelSpendUsd: Number(spend.rows[0]?.usd ?? 0),
    shareLinks: links.rows.map((l) => ({
      id: l.id,
      scope: l.scope,
      createdAt: l.created_at,
      expiresAt: l.expires_at,
      revoked: l.revoked,
      lastOpenedAt: l.last_opened_at,
      openCount: l.open_count,
    })),
    auditLog: log,
  };
}

async function audPerUsd(q: ConsoleQuery, now: Date): Promise<number | null> {
  const { rows } = await q.query<{ usd: string | null; aud: string | null }>(
    `select
       (select rate_to_eur from public.fx_rates_daily where currency = 'USD' and date <= $1
         order by date desc, (source = 'ecb') desc limit 1)::text as usd,
       (select rate_to_eur from public.fx_rates_daily where currency = 'AUD' and date <= $1
         order by date desc, (source = 'ecb') desc limit 1)::text as aud`,
    [now.toISOString().slice(0, 10)],
  );
  const r = rows[0];
  return r?.usd && r.aud ? Number(r.aud) / Number(r.usd) : null;
}

export interface AttentionItem {
  severity: 'danger' | 'warn' | 'info';
  group: 'promise' | 'money' | 'hygiene';
  title: string;
  body: string;
  href: string;
  cta: string;
}

async function attentionItems(
  q: ConsoleQuery,
  role: AdminRole,
  now: Date,
): Promise<AttentionItem[]> {
  const items: AttentionItem[] = [];
  const [cases, failures, feeds, deadlines, ambiguous, pastDue] = await Promise.all([
    q.query<{ kind: string; n: number; oldest: string }>(
      `select kind, count(*)::int as n, min(opened_at) as oldest from public.cases
       where resolved_at is null group by kind`,
    ),
    q.query<{ n: number; exhausted: number }>(
      `select count(*)::int as n, count(*) filter (where exhausted_at is not null)::int as exhausted
       from public.run_failures where resolved_at is null`,
    ),
    q.query<{ feed: string }>(`select feed from public.feed_status where next_expected_at < $1`, [
      now.toISOString(),
    ]),
    q.query<{ n: number }>(
      `select count(*)::int as n from public.tournaments
       where entry_deadline is null and start_date >= $1::date`,
      [now.toISOString().slice(0, 10)],
    ),
    q.query<{ n: number }>(
      `select count(*)::int as n from public.players where verification = 'ambiguous'`,
    ),
    q.query<{ n: number }>(
      `select count(*)::int as n from public.players where tier_status = 'past_due'`,
    ),
  ]);

  for (const c of cases.rows) {
    const labels: Record<string, string> = {
      distress: 'Distress pattern needs a person',
      guardian: 'Guardian confirmation outstanding',
      report: 'Report waiting for review',
      governance: 'Real-person governance check failed',
    };
    items.push({
      severity: c.kind === 'distress' ? 'danger' : 'warn',
      group: 'promise',
      title: `${labels[c.kind] ?? c.kind}${c.n > 1 ? ` (${c.n})` : ''}`,
      body:
        c.kind === 'distress'
          ? 'A person must confirm within 24 hours that the "Someone to call" card was shown.'
          : `Oldest opened ${new Date(c.oldest).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}.`,
      href: '/trust',
      cta: 'Case',
    });
  }
  const f = failures.rows[0]!;
  if (f.n > 0 && role !== 'support') {
    items.push({
      severity: f.exhausted > 0 ? 'danger' : 'warn',
      group: 'promise',
      title: `${f.n} agent run${f.n === 1 ? '' : 's'} failing`,
      body:
        f.exhausted > 0
          ? `${f.exhausted} exhausted their retries; those players were told the run didn't complete.`
          : 'All still retrying on the 5, 20 and 60 minute schedule.',
      href: '/agents',
      cta: 'Open',
    });
  }
  if (ambiguous.rows[0]!.n > 0) {
    items.push({
      severity: 'warn',
      group: 'promise',
      title: `${ambiguous.rows[0]!.n} ambiguous ranking match${ambiguous.rows[0]!.n === 1 ? '' : 'es'}`,
      body: 'Waiting on the player to choose; public profile and share links stay off until verified.',
      href: '/players?status=Unverified',
      cta: 'Players',
    });
  }
  if (pastDue.rows[0]!.n > 0 && role === 'owner') {
    items.push({
      severity: 'info',
      group: 'money',
      title: `${pastDue.rows[0]!.n} subscription${pastDue.rows[0]!.n === 1 ? '' : 's'} past due`,
      body: 'Stripe retries on its own schedule; a lapse moves the player to Free with data kept.',
      href: '/money',
      cta: 'Money',
    });
  }
  if (role !== 'support') {
    for (const feed of feeds.rows) {
      items.push({
        severity: 'warn',
        group: 'hygiene',
        title: `${feed.feed} missed its window`,
        body: 'The last good snapshot stays in use. Players are not told unless a decision depends on it.',
        href: '/ingestion',
        cta: 'Ingestion',
      });
    }
    if (deadlines.rows[0]!.n > 0) {
      items.push({
        severity: 'info',
        group: 'hygiene',
        title: `${deadlines.rows[0]!.n} upcoming event${deadlines.rows[0]!.n === 1 ? '' : 's'} without an entry deadline`,
        body: 'Shown to players as "deadline unconfirmed" until set; no countdown runs.',
        href: '/ingestion',
        cta: 'Set',
      });
    }
  }
  const order = { promise: 0, money: 1, hygiene: 2 };
  const sev = { danger: 0, warn: 1, info: 2 };
  return items.sort((a, b) => order[a.group] - order[b.group] || sev[a.severity] - sev[b.severity]);
}

async function approvalRates(q: ConsoleQuery) {
  const { rows } = await q.query<{ agent: string; approval_rate_7d: string | null; day: string }>(
    `select distinct on (agent) agent, approval_rate_7d::text, day::text
     from public.agent_health_daily order by agent, day desc`,
  );
  return AGENTS.filter((a) => a.proposes).map((a) => {
    const row = rows.find((r) => r.agent === a.name);
    const rate = row?.approval_rate_7d != null ? Number(row.approval_rate_7d) : null;
    return {
      agent: a.name,
      label: a.label,
      rate,
      under: rate !== null && rate < APPROVAL_THRESHOLD,
    };
  });
}

function weekStart(d: Date): string {
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day))
    .toISOString()
    .slice(0, 10);
}

export async function getOverview(q: ConsoleQuery, role: AdminRole, now: Date) {
  const today = now.toISOString().slice(0, 10);
  const [players, runs, weekly, spendMonths, lastAgg, rate] = await Promise.all([
    q.query<{
      total: number;
      active: number;
      new_week: number;
      pro: number;
      elite: number;
      trials: number;
      trials_ending: number;
    }>(
      `select count(*)::int as total,
              count(*) filter (where exists (select 1 from public.notes n where n.player_id = p.id and n.created_at > $1::timestamptz - interval '7 days')
                               or exists (select 1 from public.check_ins c where c.player_id = p.id and c.created_at > $1::timestamptz - interval '7 days'))::int as active,
              count(*) filter (where p.created_at > $1::timestamptz - interval '7 days')::int as new_week,
              count(*) filter (where p.tier = 'pro' and p.trial_ends_at is null and p.tier_status is distinct from 'trialing')::int as pro,
              count(*) filter (where p.tier = 'elite' and p.comp_tier is null)::int as elite,
              count(*) filter (where p.trial_ends_at > $1 or p.tier_status = 'trialing')::int as trials,
              count(*) filter (where p.trial_ends_at > $1 and p.trial_ends_at <= $1::timestamptz + interval '7 days')::int as trials_ending
       from public.players p`,
      [now.toISOString()],
    ),
    q.query<{ total: number; failed: number; finished: string | null; median_ms: number | null }>(
      `select count(*)::int as total,
              count(*) filter (where status <> 'succeeded')::int as failed,
              max(completed_at) as finished,
              percentile_cont(0.5) within group (order by extract(epoch from (completed_at - started_at)) * 1000)::int as median_ms
       from public.agent_runs where trigger_type = 'schedule' and started_at::date = $1`,
      [today],
    ),
    q.query<{ week: string; signups: number }>(
      `select date_trunc('week', created_at)::date::text as week, count(*)::int as signups
       from public.players where created_at > $1::timestamptz - interval '12 weeks' group by 1 order by 1`,
      [now.toISOString()],
    ),
    q.query<{ month: string; usd: string; paying: number }>(
      `select to_char(date_trunc('month', r.started_at), 'YYYY-MM') as month,
              coalesce(sum(r.cost_amount), 0)::text as usd,
              (select count(*)::int from public.players where tier in ('pro', 'elite')) as paying
       from public.agent_runs r
       where r.started_at > date_trunc('month', $1::timestamptz) - interval '5 months'
       group by 1 order by 1`,
      [now.toISOString()],
    ),
    q.query<{ at: string | null }>(
      `select max(computed_at) as at from public.agent_health_daily`,
    ),
    audPerUsd(q, now),
  ]);

  const p = players.rows[0]!;
  const r = runs.rows[0]!;
  const weeks: { week: string; signups: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const w = weekStart(new Date(now.getTime() - i * 7 * DAY_MS));
    weeks.push({ week: w, signups: weekly.rows.find((x) => x.week === w)?.signups ?? 0 });
  }
  const months: { month: string; perPlayerAud: number | null }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = d.toISOString().slice(0, 7);
    const row = spendMonths.rows.find((x) => x.month === key);
    const usd = row ? Number(row.usd) : 0;
    const aud = rate ? usd * rate : usd;
    months.push({ month: key, perPlayerAud: row && row.paying ? aud / row.paying : null });
  }

  return {
    date: today,
    aggregatedAt: lastAgg.rows[0]?.at ?? null,
    stats: {
      signedUp: p.total,
      active: p.active,
      newThisWeek: p.new_week,
      weeklyActiveShare: p.total ? p.active / p.total : null,
      mrrAud: role === 'owner' ? p.pro * PRO_PRICE_AUD + p.elite * ELITE_PRICE_AUD : null,
      pro: p.pro,
      elite: p.elite,
      trials: p.trials,
      trialsEndingThisWeek: p.trials_ending,
      morningRun: {
        total: r.total,
        failed: r.failed,
        finishedAt: r.finished,
        medianMs: r.median_ms,
      },
    },
    attention: await attentionItems(q, role, now),
    approvalRates: await approvalRates(q),
    signups: weeks,
    spendPerPlayer: months,
    spendCapAud: SPEND_CAP_AUD,
  };
}

export async function getAgentHealth(q: ConsoleQuery, role: AdminRole, now: Date) {
  const today = now.toISOString().slice(0, 10);
  const [week, todayRuns, failures, hourly, pauses, switches, backlog, rate] = await Promise.all([
    q.query<{
      agent: string;
      runs: number;
      successes: number;
      p50_ms: number | null;
      cost_total: string;
      approval_rate_7d: string | null;
      dismiss_rate_7d: string | null;
    }>(
      `select agent, sum(runs)::int as runs, sum(successes)::int as successes,
              percentile_cont(0.5) within group (order by p50_ms)::int as p50_ms,
              sum(cost_total)::text as cost_total,
              (array_agg(approval_rate_7d order by day desc))[1]::text as approval_rate_7d,
              (array_agg(dismiss_rate_7d order by day desc))[1]::text as dismiss_rate_7d
       from public.agent_health_daily where day > $1::date - 7 group by agent`,
      [today],
    ),
    q.query<{
      total: number;
      scheduled: number;
      failed: number;
      p50: number | null;
      p95: number | null;
      usd: string;
    }>(
      `select count(*)::int as total,
              count(*) filter (where trigger_type = 'schedule')::int as scheduled,
              count(*) filter (where status <> 'succeeded')::int as failed,
              percentile_cont(0.5) within group (order by extract(epoch from (completed_at - started_at)) * 1000)::int as p50,
              percentile_cont(0.95) within group (order by extract(epoch from (completed_at - started_at)) * 1000)::int as p95,
              coalesce(sum(cost_amount), 0)::text as usd
       from public.agent_runs where started_at::date = $1`,
      [today],
    ),
    q.query<{
      id: string;
      agent_name: string;
      player_id: string;
      player_name: string;
      attempts: number;
      last_error: string;
      first_failed_at: string;
      exhausted_at: string | null;
      player_told_at: string | null;
    }>(
      `select f.id, f.agent_name, f.player_id, p.name as player_name, f.attempts, f.last_error,
              f.first_failed_at, f.exhausted_at, f.player_told_at
       from public.run_failures f join public.players p on p.id = f.player_id
       where f.resolved_at is null order by f.first_failed_at`,
    ),
    q.query<{ hour: number; completed: number; failed: number }>(
      `select extract(hour from started_at)::int as hour,
              count(*) filter (where status = 'succeeded')::int as completed,
              count(*) filter (where status <> 'succeeded')::int as failed
       from public.agent_runs where started_at > $1::timestamptz - interval '24 hours'
       group by 1`,
      [now.toISOString()],
    ),
    q.query<{ agent_name: string; paused: boolean }>(
      `select distinct on (agent_name) agent_name, paused from public.agent_global_pauses
       order by agent_name, changed_at desc`,
    ),
    q.query<{ provider: string; state: string; changed_at: string }>(
      `select distinct on (provider) provider, state, changed_at from public.provider_switches
       order by provider, changed_at desc`,
    ),
    q.query<{ transcription: number }>(
      `select count(*)::int as transcription from public.notes
       where status in ('uploaded', 'transcribing', 'queued') and deleted_at is null`,
    ),
    audPerUsd(q, now),
  ]);

  const t = todayRuns.rows[0]!;
  const toAud = (usd: number) => (rate ? usd * rate : null);
  const nowHour = now.getUTCHours();
  const runsPerHour = Array.from({ length: 24 }, (_, i) => {
    const hour = (nowHour - 23 + i + 24) % 24;
    const row = hourly.rows.find((h) => h.hour === hour);
    return { hour, completed: row?.completed ?? 0, failed: row?.failed ?? 0 };
  });

  return {
    stats: {
      runsToday: t.total,
      scheduledToday: t.scheduled,
      onDemandToday: t.total - t.scheduled,
      failedToday: t.failed,
      openFailures: failures.rows.length,
      p50Ms: t.p50,
      p95Ms: t.p95,
      costTodayAud: toAud(Number(t.usd)),
      costPerRunAud: t.total ? toAud(Number(t.usd) / t.total) : null,
    },
    agents: AGENTS.map((a) => {
      const w = week.rows.find((r) => r.agent === a.name);
      const approval = w?.approval_rate_7d != null ? Number(w.approval_rate_7d) : null;
      return {
        name: a.name,
        label: a.label,
        cadence: a.cadence,
        pausable: a.queued,
        paused: pauses.rows.find((p) => p.agent_name === a.name)?.paused ?? false,
        runs7d: w?.runs ?? 0,
        successRate: w && w.runs ? w.successes / w.runs : null,
        p50Ms: w?.p50_ms ?? null,
        costPerRunAud: w && w.runs ? toAud(Number(w.cost_total) / w.runs) : null,
        approvalRate: a.proposes ? approval : null,
        dismissRate: w?.dismiss_rate_7d != null ? Number(w.dismiss_rate_7d) : null,
        underThreshold: approval !== null && approval < APPROVAL_THRESHOLD,
      };
    }),
    failures: failures.rows.map((f) => ({
      id: f.id,
      agent: agentInfo(f.agent_name).label,
      agentName: f.agent_name,
      playerId: f.player_id,
      playerName: f.player_name,
      attempts: f.attempts,
      error: f.last_error,
      firstFailedAt: f.first_failed_at,
      exhausted: f.exhausted_at !== null,
      playerToldAt: f.player_told_at,
    })),
    queues: { transcriptionBacklog: backlog.rows[0]!.transcription },
    runsPerHour,
    providers:
      role === 'owner'
        ? PROVIDERS.map((p) => {
            const s = switches.rows.find((x) => x.provider === p.key);
            return {
              ...p,
              state: (s?.state ?? 'on') as 'on' | 'off',
              changedAt: s?.changed_at ?? null,
              dependents: AGENTS.filter((a) => a.providers.includes(p.key)).map((a) => a.label),
            };
          })
        : null,
  };
}

export async function getMoney(q: ConsoleQuery, now: Date) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const [tiers, fees, feesAllTime, spend, pastDue, waitlists, payouts, rate] = await Promise.all([
    q.query<{
      pro: number;
      elite: number;
      pro_annual: number;
      elite_annual: number;
      paying: number;
    }>(
      `select count(*) filter (where tier = 'pro' and trial_ends_at is null and tier_status is distinct from 'trialing')::int as pro,
              count(*) filter (where tier = 'elite' and comp_tier is null)::int as elite,
              count(*) filter (where tier = 'pro' and billing_cycle = 'annual')::int as pro_annual,
              count(*) filter (where tier = 'elite' and billing_cycle = 'annual')::int as elite_annual,
              count(*) filter (where tier in ('pro', 'elite') and tier_status is distinct from 'trialing')::int as paying
       from public.players`,
    ),
    q.query<{ currency: string; gross: string; fee: string; stripe_fee: string }>(
      `select currency, sum(gross)::text as gross, sum(platform_fee)::text as fee,
              sum(stripe_fee)::text as stripe_fee
       from public.payouts where created_at >= $1 group by currency`,
      [monthStart],
    ),
    q.query<{ currency: string; fee: string }>(
      `select currency, sum(platform_fee)::text as fee from public.payouts group by currency`,
    ),
    q.query<{ agent_name: string; usd: string }>(
      `select agent_name, coalesce(sum(cost_amount), 0)::text as usd from public.agent_runs
       where started_at >= $1 group by agent_name`,
      [monthStart],
    ),
    q.query<{ n: number }>(
      `select count(*)::int as n from public.players where tier_status = 'past_due'`,
    ),
    q.query<{
      player_id: string;
      name: string;
      patrons: number;
      waiting: number;
      since: string | null;
    }>(
      `select p.id as player_id, p.name,
              (select count(*)::int from public.patrons pa where pa.player_id = p.id and pa.status = 'active') as patrons,
              (select count(*)::int from public.patron_waitlist w where w.player_id = p.id and w.converted_at is null and w.invited_at is null) as waiting,
              (select min(joined_at) from public.patron_waitlist w where w.player_id = p.id and w.converted_at is null) as since
       from public.players p where p.tier = 'pro'`,
    ),
    q.query<{
      id: string;
      player_name: string;
      friday: string;
      net: string;
      currency: string;
      status: string;
      paid_at: string | null;
    }>(
      `select po.id, p.name as player_name, po.friday::text, po.net::text, po.currency, po.status, po.paid_at
       from public.payouts po join public.players p on p.id = po.player_id
       order by po.created_at desc limit 20`,
    ),
    audPerUsd(q, now),
  ]);

  const t = tiers.rows[0]!;
  const toAud = (usd: number) => (rate ? usd * rate : usd);
  const categories = { transcription: 0, drafting: 0, other: 0 };
  for (const s of spend.rows) {
    const aud = toAud(Number(s.usd));
    if (s.agent_name === 'match-scribe-extract') categories.transcription += aud;
    else if (
      ['content', 'fans/patron-note', 'mindset-coach', 'financial', 'conditions'].includes(
        s.agent_name,
      )
    )
      categories.drafting += aud;
    else categories.other += aud;
  }
  const totalAud = categories.transcription + categories.drafting + categories.other;

  return {
    mrr: {
      totalAud: t.pro * PRO_PRICE_AUD + t.elite * ELITE_PRICE_AUD,
      proAud: t.pro * PRO_PRICE_AUD,
      eliteAud: t.elite * ELITE_PRICE_AUD,
      pro: t.pro,
      elite: t.elite,
      annual: t.pro_annual + t.elite_annual,
      basis: 'List price times paying players; Stripe Billing is not live yet.',
    },
    platformFee: fees.rows.map((f) => ({
      currency: f.currency,
      gross: Number(f.gross),
      fee: Number(f.fee),
      stripeFee: Number(f.stripe_fee),
    })),
    platformFeeAllTime: feesAllTime.rows.map((f) => ({ currency: f.currency, fee: Number(f.fee) })),
    feeBasis:
      "8 percent of what patrons pay on Pro, 5 percent on Elite, taken on the gross before Stripe's own charge (decisions A1 and A2, settled 13 September).",
    spend: {
      totalAud,
      perPayingPlayerAud: t.paying ? totalAud / t.paying : null,
      capAud: SPEND_CAP_AUD,
      payingPlayers: t.paying,
      categories,
      rateNote: rate
        ? 'Converted from USD at the latest ECB reference rate.'
        : 'No AUD rate on file; shown in USD.',
    },
    pastDue: pastDue.rows[0]!.n,
    waitlists: waitlists.rows
      .filter((w) => w.patrons >= 50 || w.waiting > 0)
      .map((w) => ({
        playerId: w.player_id,
        name: w.name,
        patrons: w.patrons,
        waiting: w.waiting,
        since: w.since,
      })),
    payouts: payouts.rows.map((p) => ({
      id: p.id,
      playerName: p.player_name,
      week: p.friday,
      net: Number(p.net),
      currency: p.currency,
      status: p.status,
      paidAt: p.paid_at,
    })),
  };
}

export async function getTrust(q: ConsoleQuery, now: Date) {
  const [cases, deletions, exports, distressMonth] = await Promise.all([
    q.query<{
      id: string;
      kind: string;
      player_id: string;
      player_name: string;
      opened_at: string;
      opened_by_rule: string;
      excerpt: string;
      due_at: string | null;
      card_shown_confirmed_at: string | null;
      escalated_at: string | null;
    }>(
      `select c.id, c.kind, c.player_id, p.name as player_name, c.opened_at, c.opened_by_rule,
              c.excerpt, c.due_at, c.card_shown_confirmed_at, c.escalated_at
       from public.cases c join public.players p on p.id = c.player_id
       where c.resolved_at is null order by c.opened_at`,
    ),
    q.query<{ id: string; name: string; requested: string | null; effective: string }>(
      `select id, name, deletion_requested_at as requested, deletion_effective_at as effective
       from public.players where deletion_effective_at > $1 order by deletion_effective_at`,
      [now.toISOString()],
    ),
    q.query<{ id: string; name: string; requested: string; delivered: string | null }>(
      `select id, name, export_requested_at as requested, export_delivered_at as delivered
       from public.players where export_requested_at is not null
       order by export_requested_at desc limit 20`,
    ),
    q.query<{ n: number }>(
      `select count(*)::int as n from public.cases
       where kind = 'distress' and opened_at >= date_trunc('month', $1::timestamptz)`,
      [now.toISOString()],
    ),
  ]);

  return {
    cases: cases.rows.map((c) => ({
      id: c.id,
      kind: c.kind,
      playerId: c.player_id,
      playerName: c.player_name,
      openedAt: c.opened_at,
      rule: c.opened_by_rule,
      excerpt: c.excerpt,
      dueAt: c.due_at,
      cardShownConfirmedAt: c.card_shown_confirmed_at,
      escalatedAt: c.escalated_at,
      overdue: c.due_at ? new Date(c.due_at).getTime() < now.getTime() : false,
    })),
    distressCardsThisMonth: distressMonth.rows[0]!.n,
    deletions: deletions.rows.map((d) => ({
      playerId: d.id,
      name: d.name,
      requestedAt: d.requested,
      effectiveAt: d.effective,
      daysLeft: Math.ceil((new Date(d.effective).getTime() - now.getTime()) / DAY_MS),
    })),
    exports: exports.rows.map((e) => ({
      playerId: e.id,
      name: e.name,
      requestedAt: e.requested,
      deliveredAt: e.delivered,
    })),
  };
}

export async function listAlerts(q: ConsoleQuery, role: AdminRole) {
  const { rows } = await q.query<{
    id: string;
    kind: string;
    category: string;
    title: string;
    body: string;
    link: string | null;
    role_owner: string | null;
    acknowledged_at: string | null;
    created_at: string;
  }>(
    `select id, kind, category, title, body, link, role_owner, acknowledged_at, created_at
     from public.alerts
     where role_owner is null or role_owner = any($1)
     order by created_at desc limit 100`,
    [
      role === 'owner'
        ? ['support', 'ops', 'owner']
        : role === 'ops'
          ? ['support', 'ops']
          : ['support'],
    ],
  );
  return rows.map((a) => ({
    id: a.id,
    kind: a.kind,
    category: a.category as 'act' | 'fyi',
    title: a.title,
    body: a.body,
    link: a.link,
    roleOwner: a.role_owner,
    acknowledgedAt: a.acknowledged_at,
    createdAt: a.created_at,
  }));
}

export async function listAdminAudit(
  q: ConsoleQuery,
  viewerId: string,
  role: AdminRole,
  adminFilter?: string,
) {
  // AD-28: every admin sees their own log; the owner sees everyone's.
  const adminId = role === 'owner' ? (adminFilter ?? null) : viewerId;
  const { rows } = await q.query<{
    id: string;
    created_at: string;
    admin_name: string | null;
    role_at_time: string;
    action_type: string;
    player_name: string | null;
    consequence: string;
    reason: string | null;
  }>(
    `select a.id, a.created_at, a.admin_name, a.role_at_time, a.action_type, p.name as player_name,
            a.consequence, a.reason
     from public.admin_actions a left join public.players p on p.id = a.player_id
     where ($1::uuid is null or a.admin_id = $1)
     order by a.created_at desc limit 200`,
    [adminId],
  );
  const admins =
    role === 'owner'
      ? (
          await q.query<{ id: string; name: string; role: string }>(
            `select id, name, role from public.admin_users order by name`,
          )
        ).rows
      : [];
  return {
    entries: rows.map((r) => ({
      id: r.id,
      at: r.created_at,
      adminName: r.admin_name,
      role: r.role_at_time,
      action: r.action_type,
      playerName: r.player_name,
      consequence: r.consequence,
      reason: r.reason,
    })),
    admins,
  };
}

export const ALERT_KINDS = [
  { kind: 'run_exhausted', label: 'Agent run failed three retries', category: 'act', owner: 'ops' },
  { kind: 'feed_missed_window', label: 'Feed missed its window', category: 'act', owner: 'ops' },
  { kind: 'case_opened', label: 'Case opened', category: 'act', owner: 'support' },
  {
    kind: 'distress_escalated',
    label: 'Distress case unconfirmed at 24 hours',
    category: 'act',
    owner: 'owner',
  },
  {
    kind: 'approval_under_threshold',
    label: 'Approval rate under 30 percent',
    category: 'act',
    owner: 'owner',
  },
  {
    kind: 'spend_80_percent',
    label: 'Model spend at 80 percent of cap',
    category: 'act',
    owner: 'owner',
  },
  { kind: 'morning_run_summary', label: 'Morning run summary', category: 'fyi', owner: 'ops' },
  { kind: 'weekly_signups', label: 'Weekly sign-ups', category: 'fyi', owner: 'support' },
] as const;

export async function getRouting(q: ConsoleQuery) {
  const { rows } = await q.query<{
    role: string;
    alert_kind: string;
    push: boolean;
    email: boolean;
  }>(`select role, alert_kind, push, email from public.alert_routes`);
  return ALERT_KINDS.map((k) => ({
    ...k,
    routes: (['support', 'ops', 'owner'] as const).map((role) => {
      const r = rows.find((x) => x.role === role && x.alert_kind === k.kind);
      // Default: the owning role gets push and email for needs-action alerts.
      const fallback = k.category === 'act' && role === k.owner;
      return { role, push: r?.push ?? fallback, email: r?.email ?? fallback };
    }),
  }));
}

/** Sidebar badges (PRD-13 section 4.1's counts beside each area). */
export async function getNavCounts(q: ConsoleQuery, now: Date) {
  const { rows } = await q.query<{
    players: number;
    failures: number;
    cases: number;
    feeds: number;
    unread: number;
  }>(
    `select (select count(*)::int from public.players) as players,
            (select count(*)::int from public.run_failures where resolved_at is null) as failures,
            (select count(*)::int from public.cases where resolved_at is null) as cases,
            (select count(*)::int from public.feed_status where next_expected_at < $1) as feeds,
            (select count(*)::int from public.alerts where category = 'act' and acknowledged_at is null) as unread`,
    [now.toISOString()],
  );
  return rows[0]!;
}
