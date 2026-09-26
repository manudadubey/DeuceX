import type pg from 'pg';
import type { PgBoss } from 'pg-boss';
import { AGENTS } from './agents-registry';

// The nightly aggregation (PRD-13 AD-13, TECH-ARCHITECTURE.md section 8):
// agent_runs and approvals rolled up into agent_health_daily, one row per
// agent per day, then the two owner alerts that hang off it (AD-AC-5's
// approval rate under 30 percent for 14 days, AD-19's spend at 80 percent
// of the cap) and the comp expiry sweep. Runs as the platform's own
// connection, not as the console role: it's a scheduled job, not a staff
// action, and agent_health_daily has no console write grant.

export const APPROVAL_THRESHOLD = 0.3;
export const APPROVAL_ALERT_DAYS = 14;
export const PRO_PRICE_AUD = 49;
export const SPEND_CAP_AUD = PRO_PRICE_AUD * 0.15; // A$7.35
export const SPEND_ALERT_SHARE = 0.8; // A$5.88

// Where a player's explicit "no" is recorded, per agent (PRD-13 section 7's
// dismiss rate). Agents not listed have no dismiss action yet.
const DISMISS_SQL: Record<string, string> = {
  tournament: `select count(*)::int from public.entry_decisions
               where status = 'skipped' and created_at::date = $1`,
  content: `select count(*)::int from public.patron_updates
            where status = 'skipped' and created_at::date = $1`,
  'mindset-coach': `select count(*)::int from public.patterns
                    where dismissed and dismissed_at::date = $1`,
};

export interface AggregationResult {
  day: string;
  agents: number;
  alertsRaised: string[];
}

export async function aggregateDay(client: pg.ClientBase, day: string): Promise<number> {
  const { rows } = await client.query<{
    agent: string;
    runs: number;
    successes: number;
    p50_ms: number | null;
    p95_ms: number | null;
    cost_total: string;
    proposal_runs: number;
    approved_within_48h: number;
  }>(
    `select r.agent_name as agent,
            count(*)::int as runs,
            count(*) filter (where r.status = 'succeeded')::int as successes,
            percentile_cont(0.5) within group (
              order by extract(epoch from (r.completed_at - r.started_at)) * 1000
            )::int as p50_ms,
            percentile_cont(0.95) within group (
              order by extract(epoch from (r.completed_at - r.started_at)) * 1000
            )::int as p95_ms,
            coalesce(sum(r.cost_amount), 0)::text as cost_total,
            count(*) filter (where r.status = 'succeeded' and r.agent_name = any($2))::int as proposal_runs,
            count(*) filter (
              where r.agent_name = any($2) and exists (
                select 1 from public.approvals a
                where a.agent_run_id = r.id and a.approved_at <= r.started_at + interval '48 hours'
              )
            )::int as approved_within_48h
     from public.agent_runs r
     where r.started_at::date = $1
     group by r.agent_name`,
    [day, AGENTS.filter((a) => a.proposes).map((a) => a.name)],
  );

  for (const row of rows) {
    const dismissSql = DISMISS_SQL[row.agent];
    const dismissed = dismissSql
      ? ((await client.query<{ count: number }>(dismissSql, [day])).rows[0]?.count ?? 0)
      : null;
    const cost = Number(row.cost_total);
    await client.query(
      `insert into public.agent_health_daily
         (agent, day, runs, successes, success_rate, p50_ms, p95_ms, cost_total, cost_currency,
          cost_per_run, proposal_runs, approved_within_48h, dismissed, computed_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'USD', $9, $10, $11, $12, now())
       on conflict (agent, day) do update set
         runs = excluded.runs, successes = excluded.successes, success_rate = excluded.success_rate,
         p50_ms = excluded.p50_ms, p95_ms = excluded.p95_ms, cost_total = excluded.cost_total,
         cost_per_run = excluded.cost_per_run, proposal_runs = excluded.proposal_runs,
         approved_within_48h = excluded.approved_within_48h, dismissed = excluded.dismissed,
         computed_at = now()`,
      [
        row.agent,
        day,
        row.runs,
        row.successes,
        row.runs ? row.successes / row.runs : null,
        row.p50_ms,
        row.p95_ms,
        cost,
        row.runs ? cost / row.runs : null,
        row.proposal_runs,
        row.approved_within_48h,
        dismissed,
      ],
    );
  }

  // Rolling seven-day rates for every agent with a row that day (PRD-13
  // section 7: judged over a rolling seven days, not day by day). The
  // approval rate is measured through approvals.agent_run_id, which approval
  // writers only started setting after step 5.1 (0 of 20 production
  // approvals carried it then). Until an agent has any linked approval, its
  // rate stays null ("not linked yet") rather than a false 0 percent, so the
  // 30 percent alert can't fire on missing data.
  await client.query(
    `update public.agent_health_daily d set
       approval_rate_7d = case when exists (
         select 1 from public.approvals a
         join public.agent_runs r on r.id = a.agent_run_id
         where r.agent_name = d.agent
       ) then w.approved::numeric / nullif(w.proposals, 0) end,
       dismiss_rate_7d = w.dismissed::numeric / nullif(w.proposals, 0)
     from (
       select agent, sum(proposal_runs) as proposals, sum(approved_within_48h) as approved,
              sum(dismissed) as dismissed
       from public.agent_health_daily
       where day between $1::date - 6 and $1::date
       group by agent
     ) w
     where d.agent = w.agent and d.day = $1::date`,
    [day],
  );

  return rows.length;
}

/** AD-AC-5: every agent whose 7-day approval rate has been under 30 percent on each of the last 14 days. */
export async function agentsUnderThreshold(client: pg.ClientBase, day: string): Promise<string[]> {
  const { rows } = await client.query<{ agent: string }>(
    `select agent from public.agent_health_daily
     where day between $1::date - ($2::int - 1) and $1::date
       and approval_rate_7d is not null
     group by agent
     having count(*) = $2 and bool_and(approval_rate_7d < $3)`,
    [day, APPROVAL_ALERT_DAYS, APPROVAL_THRESHOLD],
  );
  return rows.map((r) => r.agent);
}

async function raiseAlert(
  client: pg.ClientBase,
  alert: {
    kind: string;
    category: 'act' | 'fyi';
    title: string;
    body: string;
    link: string;
    roleOwner: string;
    dedupeKey: string;
  },
): Promise<boolean> {
  const { rowCount } = await client.query(
    `insert into public.alerts (kind, category, title, body, link, role_owner, dedupe_key)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict do nothing`,
    [
      alert.kind,
      alert.category,
      alert.title,
      alert.body,
      alert.link,
      alert.roleOwner,
      alert.dedupeKey,
    ],
  );
  return rowCount === 1;
}

/** Converts a USD month-to-date model spend into A$ per paying player (PRD-13 section 7). */
export async function spendPerPayingPlayerAud(
  client: pg.ClientBase,
  monthStart: string,
  now: Date,
): Promise<{ perPlayer: number | null; payingPlayers: number; totalAud: number }> {
  const { rows } = await client.query<{
    usd: string;
    paying: number;
    usd_per_eur: string | null;
    aud_per_eur: string | null;
  }>(
    `select
       (select coalesce(sum(cost_amount), 0) from public.agent_runs
         where started_at >= $1 and cost_currency = 'USD')::text as usd,
       (select count(*) from public.players where tier in ('pro', 'elite'))::int as paying,
       (select rate_to_eur from public.fx_rates_daily where currency = 'USD' and date <= $2
         order by date desc, (source = 'ecb') desc limit 1)::text as usd_per_eur,
       (select rate_to_eur from public.fx_rates_daily where currency = 'AUD' and date <= $2
         order by date desc, (source = 'ecb') desc limit 1)::text as aud_per_eur`,
    [monthStart, now.toISOString().slice(0, 10)],
  );
  const row = rows[0]!;
  const usd = Number(row.usd);
  const totalAud =
    row.usd_per_eur && row.aud_per_eur
      ? (usd / Number(row.usd_per_eur)) * Number(row.aud_per_eur)
      : usd;
  return {
    totalAud,
    payingPlayers: row.paying,
    perPlayer: row.paying ? totalAud / row.paying : null,
  };
}

export async function runNightlyAggregation(
  pool: pg.Pool,
  now: Date = new Date(),
): Promise<AggregationResult> {
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const client = await pool.connect();
  const alertsRaised: string[] = [];
  try {
    // Yesterday is the complete day; today is refreshed too so a manual
    // Refresh in the console shows this morning's runs.
    let agents = await aggregateDay(client, yesterday);
    agents += await aggregateDay(client, today);

    for (const agent of await agentsUnderThreshold(client, yesterday)) {
      const raised = await raiseAlert(client, {
        kind: 'approval_under_threshold',
        category: 'act',
        title: `${agent}: approval rate under 30 percent for 14 days`,
        body: 'Players have acted on fewer than 3 in 10 of its proposals within 48 hours for two weeks (PRD-00 section 6).',
        link: '/agents',
        roleOwner: 'owner',
        dedupeKey: `approval_under_threshold:${agent}:${yesterday}`,
      });
      if (raised) alertsRaised.push(`approval_under_threshold:${agent}`);
    }

    const monthStart = `${today.slice(0, 7)}-01`;
    const spend = await spendPerPayingPlayerAud(client, monthStart, now);
    if (spend.perPlayer !== null && spend.perPlayer >= SPEND_CAP_AUD * SPEND_ALERT_SHARE) {
      const raised = await raiseAlert(client, {
        kind: 'spend_80_percent',
        category: 'act',
        title: `Model spend is A$${spend.perPlayer.toFixed(2)} per paying player`,
        body: `That is ${Math.round((spend.perPlayer / SPEND_CAP_AUD) * 100)} percent of the A$7.35 cap, month to date.`,
        link: '/money',
        roleOwner: 'owner',
        dedupeKey: `spend_80_percent:${today.slice(0, 7)}`,
      });
      if (raised) alertsRaised.push('spend_80_percent');
    }

    // Comps end on their date (the comp action's own consequence sentence).
    await client.query(
      `update public.players
       set tier = comp_previous_tier, comp_tier = null, comp_until = null, comp_previous_tier = null,
           tier_status = case when tier_status = 'comped' then null else tier_status end
       where comp_until is not null and comp_until <= $1`,
      [now.toISOString()],
    );

    return { day: yesterday, agents, alertsRaised };
  } finally {
    client.release();
  }
}

const AGGREGATION_QUEUE = 'admin-nightly-aggregation';

/** 02:00 UTC every night (PRD-13 section 4.2's "Figures aggregated 02:00 UTC"). */
export async function registerNightlyAggregation(boss: PgBoss, pool: pg.Pool): Promise<void> {
  await boss.createQueue(AGGREGATION_QUEUE);
  await boss.schedule(AGGREGATION_QUEUE, '0 2 * * *', {}, { tz: 'UTC' });
  await boss.work(AGGREGATION_QUEUE, async () => {
    await runNightlyAggregation(pool);
  });
}
