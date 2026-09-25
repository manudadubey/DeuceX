import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import {
  sendPlayerSignInLink,
  sendStaffDataExport,
  sendStaffDeletionStartedEmail,
  type AdminActionGateDb,
  type DataExportDb,
  type EmailClient,
} from '@deucex/actions/account';
import { retryAgentRunNow } from '@deucex/actions/queue';
import { roleAtLeast } from '@deucex/shared';
import type { PgBoss } from 'pg-boss';
import type { RankingLookupAdapter } from '../rankings/adapter';
import { AGENTS, PROVIDERS, agentInfo } from './agents-registry';
import { notifyPlayer, recordAdminAction, ReasonRequiredError, type RequestMeta } from './audit';
import {
  OWNER_ONLY_ACTIONS,
  compEnd,
  deletionDate,
  extendedTrialEnd,
  formatDay,
  playerConsequence,
  type PlayerActionType,
} from './consequences';
import type { ConsoleDb, ConsoleQuery } from './console-db';
import type { Staff } from './staff-auth';

// The console's state changes (PRD-13 section 4). Each one: checks the role
// the request acts as, rebuilds the consequence sentence from current
// state, writes the change and its admin_actions row in one console-role
// transaction, and only then runs any email through the admin-action gate
// (packages/actions/src/admin.ts). A failure anywhere before commit leaves
// no state change and no audit row (PRD-13 section 3, "Failure behaviour").

export class AdminActionError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = 'AdminActionError';
  }
}

export interface AdminActionDeps {
  consoleDb: ConsoleDb;
  gateDb: AdminActionGateDb;
  email: EmailClient;
  /** Service-role client: generates Supabase sign-in links (auth admin API) only. */
  authAdmin: SupabaseClient<Database>;
  exportDb: DataExportDb;
  ranking: RankingLookupAdapter;
  actionsBoss: PgBoss | null;
  appBaseUrl: string;
  now?: () => Date;
}

interface ActionPlayer {
  id: string;
  name: string;
  email: string;
  tour: 'atp' | 'wta';
  country: string;
  tier: string | null;
  tier_status: string | null;
  trial_ends_at: string | null;
  verification: string;
  tour_player_id: string | null;
  itf_id: string | null;
  deletion_effective_at: string | null;
  comp_tier: string | null;
}

async function loadPlayer(q: ConsoleQuery, playerId: string): Promise<ActionPlayer> {
  const { rows } = await q.query<ActionPlayer>(
    `select id, name, email, tour, country, tier, tier_status, trial_ends_at, verification,
            tour_player_id, itf_id, deletion_effective_at, comp_tier
     from public.players where id = $1`,
    [playerId],
  );
  const player = rows[0];
  if (!player) throw new AdminActionError(404, 'No such player.');
  return player;
}

function consequenceFor(
  action: PlayerActionType,
  player: ActionPlayer,
  now: Date,
  extra: { shareScope?: string | undefined } = {},
): string {
  return playerConsequence(
    action,
    {
      name: player.name,
      email: player.email,
      tier: player.tier,
      trialEndsAt: player.trial_ends_at,
      verification: player.verification,
      deletionEffectiveAt: player.deletion_effective_at,
    },
    now,
    { ...extra, agentCount: AGENTS.filter((a) => a.queued).length },
  );
}

function assertAllowed(staff: Staff, action: PlayerActionType): void {
  if (OWNER_ONLY_ACTIONS.includes(action) && staff.actingRole !== 'owner') {
    throw new AdminActionError(403, 'Only the owner can take this action.');
  }
}

export async function previewPlayerAction(
  deps: AdminActionDeps,
  staff: Staff,
  playerId: string,
  action: PlayerActionType,
  input: { linkId?: string },
): Promise<{ consequence: string; reasonRequired: boolean }> {
  assertAllowed(staff, action);
  const now = deps.now?.() ?? new Date();
  return deps.consoleDb.tx(async (q) => {
    const player = await loadPlayer(q, playerId);
    const scope = input.linkId ? await shareScope(q, playerId, input.linkId) : undefined;
    return {
      consequence: consequenceFor(action, player, now, { shareScope: scope }),
      reasonRequired: action === 'delete_account' || action === 'comp',
    };
  });
}

async function shareScope(q: ConsoleQuery, playerId: string, linkId: string): Promise<string> {
  const { rows } = await q.query<{ scope: string; revoked: boolean }>(
    `select scope, revoked from public.share_links where id = $1 and player_id = $2`,
    [linkId, playerId],
  );
  if (!rows[0]) throw new AdminActionError(404, 'No such share link.');
  if (rows[0].revoked) throw new AdminActionError(409, 'That link is already revoked.');
  return rows[0].scope;
}

export async function runPlayerAction(
  deps: AdminActionDeps,
  staff: Staff,
  meta: RequestMeta,
  playerId: string,
  action: PlayerActionType,
  input: { reason?: string | null; linkId?: string },
): Promise<{ ok: true; consequence: string }> {
  assertAllowed(staff, action);
  const now = deps.now?.() ?? new Date();

  // Everything that touches only the database happens in one transaction.
  const staged = await deps.consoleDb
    .tx(async (q) => {
      const player = await loadPlayer(q, playerId);
      const scope = input.linkId ? await shareScope(q, playerId, input.linkId) : undefined;
      const consequence = consequenceFor(action, player, now, { shareScope: scope });
      const record = (extra: { notifiedPlayer?: boolean; target?: Record<string, unknown> } = {}) =>
        recordAdminAction(q, staff, meta, {
          playerId,
          actionType: action,
          consequence,
          reason: input.reason ?? null,
          ...extra,
        });

      switch (action) {
        case 'trial_extend': {
          const until = extendedTrialEnd(player.trial_ends_at, now);
          await q.query(`update public.players set trial_ends_at = $2 where id = $1`, [
            playerId,
            until.toISOString(),
          ]);
          await notifyPlayer(q, {
            playerId,
            title: 'Your Pro trial was extended',
            body: `DeuceX support extended your Pro trial to ${formatDay(until)}. Nothing is charged before then.`,
            href: '/settings?pane=billing',
          });
          const id = await record({
            notifiedPlayer: true,
            target: { trialEndsAt: until.toISOString() },
          });
          return { player, consequence, adminActionId: id };
        }
        case 'comp': {
          if (player.comp_tier)
            throw new AdminActionError(409, `${player.name} already has a comp.`);
          const until = compEnd(now);
          await q.query(
            `update public.players
             set comp_previous_tier = coalesce(tier, 'free'), comp_tier = 'elite', comp_until = $2,
                 tier = 'elite', tier_status = 'comped'
             where id = $1`,
            [playerId, until.toISOString()],
          );
          await notifyPlayer(q, {
            playerId,
            title: 'You have Elite free for a month',
            body: `DeuceX gave you Elite until ${formatDay(until)}. Nothing is charged; you return to your current plan after that.`,
            href: '/settings?pane=billing',
          });
          const id = await record({
            notifiedPlayer: true,
            target: { compUntil: until.toISOString() },
          });
          return { player, consequence, adminActionId: id };
        }
        case 'pause_agents':
        case 'resume_agents': {
          const paused = action === 'pause_agents';
          for (const agent of AGENTS.filter((a) => a.queued)) {
            await q.query(
              `insert into public.agent_schedules (player_id, agent_name, paused, updated_at)
               values ($1, $2, $3, now())
               on conflict (player_id, agent_name) do update set paused = excluded.paused, updated_at = now()`,
              [playerId, agent.name, paused],
            );
          }
          await notifyPlayer(q, {
            playerId,
            title: paused ? 'DeuceX support paused your agents' : 'Your agents are running again',
            body: paused
              ? 'No new proposals until they are resumed. Nothing you already approved is undone.'
              : 'They pick up from their next scheduled run.',
            href: '/settings?pane=agents',
          });
          const id = await record({ notifiedPlayer: true });
          return { player, consequence, adminActionId: id };
        }
        case 'delete_account': {
          if (!input.reason?.trim()) throw new ReasonRequiredError(action);
          if (player.deletion_effective_at && new Date(player.deletion_effective_at) > now) {
            throw new AdminActionError(
              409,
              `${player.name}'s account is already scheduled for deletion.`,
            );
          }
          const effective = deletionDate(now);
          await q.query(
            `update public.players
             set deletion_requested_at = $2, deletion_effective_at = $3, deletion_cancelled_at = null
             where id = $1`,
            [playerId, now.toISOString(), effective.toISOString()],
          );
          const id = await record({
            notifiedPlayer: true,
            target: { effectiveAt: effective.toISOString() },
          });
          return { player, consequence, adminActionId: id, effectiveAt: effective.toISOString() };
        }
        case 'cancel_deletion': {
          if (!player.deletion_effective_at) {
            throw new AdminActionError(409, `${player.name} has no deletion scheduled.`);
          }
          await q.query(
            `update public.players
             set deletion_effective_at = null, deletion_requested_at = null, deletion_cancelled_at = $2
             where id = $1`,
            [playerId, now.toISOString()],
          );
          await notifyPlayer(q, {
            playerId,
            title: 'Your account deletion was cancelled',
            body: 'At your request, DeuceX support cancelled the deletion. Your account is restored as it was.',
          });
          const id = await record({ notifiedPlayer: true });
          return { player, consequence, adminActionId: id };
        }
        case 'revoke_share_link': {
          await q.query(
            `update public.share_links set revoked = true where id = $1 and player_id = $2`,
            [input.linkId, playerId],
          );
          const id = await record({ target: { linkId: input.linkId, scope } });
          return { player, consequence, adminActionId: id };
        }
        case 'offer_elite': {
          await notifyPlayer(q, {
            playerId,
            title: 'Your patron page is full',
            body: 'Pro pages hold 50 patrons and people are waiting. Elite lifts the cap and invites your waitlist.',
            href: '/settings?pane=billing',
          });
          const id = await record({ notifiedPlayer: true });
          return { player, consequence, adminActionId: id };
        }
        case 'magic_link':
        case 'export_data':
        case 'reverify': {
          const id = await record({ notifiedPlayer: action !== 'reverify' });
          return { player, consequence, adminActionId: id };
        }
      }
    })
    .catch((error: unknown) => {
      if (error instanceof ReasonRequiredError) throw new AdminActionError(400, error.message);
      throw error;
    });

  // Side effects that leave the platform, each behind its admin_actions row.
  switch (action) {
    case 'delete_account':
      await sendStaffDeletionStartedEmail(deps.gateDb, deps.email, {
        adminActionId: staged.adminActionId,
        playerId,
        playerEmail: staged.player.email,
        effectiveAt: (staged as { effectiveAt: string }).effectiveAt,
        appBaseUrl: deps.appBaseUrl,
      });
      break;
    case 'magic_link': {
      const { data, error } = await deps.authAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: staged.player.email,
      });
      if (error || !data.properties?.hashed_token) {
        throw new AdminActionError(
          409,
          'Supabase could not create a sign-in link for this player.',
        );
      }
      await sendPlayerSignInLink(deps.gateDb, deps.email, {
        adminActionId: staged.adminActionId,
        playerId,
        playerEmail: staged.player.email,
        signInUrl: `${deps.appBaseUrl}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`,
      });
      break;
    }
    case 'export_data':
      await sendStaffDataExport(deps.gateDb, deps.email, deps.exportDb, {
        adminActionId: staged.adminActionId,
        playerId,
      });
      break;
    case 'reverify':
      await reverify(deps, staged.player, now);
      break;
    default:
      break;
  }

  return { ok: true, consequence: staged.consequence };
}

async function reverify(deps: AdminActionDeps, player: ActionPlayer, now: Date): Promise<void> {
  const result = await deps.ranking.lookup({
    tour: player.tour,
    tourPlayerId: player.tour_player_id,
    itfId: player.itf_id,
    name: player.name,
    country: player.country,
  });
  if (result.status === player.verification) return;
  const source = result.status === 'verified' ? result.source : null;
  await deps.consoleDb.tx(async (q) => {
    await q.query(
      `update public.players set verification = $2, verification_source = $3 where id = $1`,
      [player.id, result.status, source],
    );
    // PRD-13 section 9: told only when the result changed.
    await notifyPlayer(q, {
      playerId: player.id,
      title:
        result.status === 'verified'
          ? 'Your ranking is verified'
          : result.status === 'ambiguous'
            ? 'Choose which ranking is yours'
            : 'Your ranking could not be verified',
      body:
        result.status === 'verified'
          ? `DeuceX support re-checked your ranking on ${formatDay(now)}. Your public profile and share links are available.`
          : 'DeuceX support re-checked your ranking. Open your profile to finish verification.',
      href: '/profile',
    });
  });
}

// ---------------------------------------------------------------------------
// Agent health (ops and owner).
// ---------------------------------------------------------------------------

function requireRole(staff: Staff, minimum: 'ops' | 'owner'): void {
  if (!roleAtLeast(staff.actingRole, minimum)) {
    throw new AdminActionError(403, minimum === 'owner' ? 'Owner only.' : 'Ops or owner only.');
  }
}

/** The consequence of a global agent pause or resume; throws for an agent that can't be paused. */
export function agentPauseConsequence(agentName: string, paused: boolean): string {
  const info = AGENTS.find((a) => a.name === agentName);
  if (!info?.queued)
    throw new AdminActionError(
      400,
      'This agent runs on its own trigger and cannot be paused here.',
    );
  return paused
    ? `Pauses the ${info.label} for every player now: no new proposals until resumed. Nothing approved is undone, and players see a notice on its page.`
    : `Resumes the ${info.label} for every player from its next scheduled run.`;
}

export async function setAgentPaused(
  deps: AdminActionDeps,
  staff: Staff,
  meta: RequestMeta,
  agentName: string,
  paused: boolean,
  reason: string | null,
): Promise<{ consequence: string }> {
  requireRole(staff, 'ops');
  const consequence = agentPauseConsequence(agentName, paused);
  await deps.consoleDb.tx(async (q) => {
    await q.query(
      `insert into public.agent_global_pauses (agent_name, paused, changed_by, reason) values ($1, $2, $3, $4)`,
      [agentName, paused, staff.id, reason],
    );
    await recordAdminAction(q, staff, meta, {
      playerId: null,
      actionType: paused ? 'agent_pause' : 'agent_resume',
      target: { agent: agentName },
      consequence,
      reason,
    });
  });
  return { consequence };
}

/** The consequence of a provider kill switch (AD-16); throws for an unknown or unwired provider. */
export function providerSwitchConsequence(provider: string, state: 'on' | 'off'): string {
  const info = PROVIDERS.find((p) => p.key === provider);
  if (!info) throw new AdminActionError(404, 'No such provider.');
  if (!info.wired) throw new AdminActionError(409, `${info.label}: this switch isn't wired yet.`);
  const dependents = AGENTS.filter((a) => a.providers.includes(provider)).map((a) => a.label);
  return state === 'off'
    ? `Turns ${info.label} off now: ${dependents.join(', ')} pause for every player and show a plain notice. Nothing approved is undone.`
    : `Turns ${info.label} back on; ${dependents.join(', ')} resume from their next run.`;
}

export async function setProviderState(
  deps: AdminActionDeps,
  staff: Staff,
  meta: RequestMeta,
  provider: string,
  state: 'on' | 'off',
  reason: string | null,
): Promise<{ consequence: string }> {
  requireRole(staff, 'owner');
  const consequence = providerSwitchConsequence(provider, state);
  try {
    await deps.consoleDb.tx(async (q) => {
      await q.query(
        `insert into public.provider_switches (provider, state, changed_by, reason) values ($1, $2, $3, $4)`,
        [provider, state, staff.id, reason?.trim() || null],
      );
      await recordAdminAction(q, staff, meta, {
        playerId: null,
        actionType: 'provider_switch',
        target: { provider, state },
        consequence,
        reason,
      });
    });
  } catch (error) {
    if (error instanceof ReasonRequiredError) throw new AdminActionError(400, error.message);
    throw error;
  }
  return { consequence };
}

async function loadRetry(deps: AdminActionDeps, failureId: string) {
  const failure = await deps.consoleDb.read(async (q) => {
    const { rows } = await q.query<{
      agent_name: string;
      player_id: string;
      scheduled_window: string;
      player_name: string;
      resolved_at: string | null;
    }>(
      `select f.agent_name, f.player_id, f.scheduled_window, p.name as player_name, f.resolved_at
       from public.run_failures f join public.players p on p.id = f.player_id where f.id = $1`,
      [failureId],
    );
    return rows[0] ?? null;
  });
  if (!failure) throw new AdminActionError(404, 'No such failed run.');
  if (failure.resolved_at) throw new AdminActionError(409, 'That run is no longer failing.');
  if (!AGENTS.find((a) => a.name === failure.agent_name)?.queued) {
    throw new AdminActionError(
      409,
      'This agent retries on its own trigger; retry it from the player side.',
    );
  }
  const consequence = `Re-queues ${failure.player_name}'s ${agentInfo(failure.agent_name).label} run now with the attempt count reset. Nothing is sent to the player unless it succeeds.`;
  return { failure, consequence };
}

/** The consequence of retrying a failed run (AD-14); throws when it can't be retried. */
export async function previewRetryFailedRun(
  deps: AdminActionDeps,
  failureId: string,
): Promise<string> {
  return (await loadRetry(deps, failureId)).consequence;
}

export async function retryFailedRun(
  deps: AdminActionDeps,
  staff: Staff,
  meta: RequestMeta,
  failureId: string,
): Promise<{ consequence: string }> {
  requireRole(staff, 'ops');
  const actionsBoss = deps.actionsBoss;
  if (!actionsBoss)
    throw new AdminActionError(409, 'The queue is not running in this environment.');
  const { failure, consequence } = await loadRetry(deps, failureId);
  await deps.consoleDb.tx(async (q) => {
    // AD-14 and PRD-13 section 7: a manual retry resets the counter and is logged.
    await q.query(`update public.run_failures set attempts = 0 where id = $1`, [failureId]);
    await recordAdminAction(q, staff, meta, {
      playerId: failure.player_id,
      actionType: 'run_retry',
      target: { failureId, agent: failure.agent_name },
      consequence,
    });
  });
  await retryAgentRunNow(actionsBoss, {
    agentName: failure.agent_name,
    playerId: failure.player_id,
    scheduledWindow: failure.scheduled_window,
    triggerType: 'manual',
  });
  return { consequence };
}

export const DISMISS_RUN_CONSEQUENCE =
  'Removes this failed run from the list without re-running it. The player keeps the notice they already had.';

export async function dismissFailedRun(
  deps: AdminActionDeps,
  staff: Staff,
  meta: RequestMeta,
  failureId: string,
  reason: string | null,
): Promise<{ consequence: string }> {
  requireRole(staff, 'ops');
  if (!reason?.trim()) throw new AdminActionError(400, 'A dismissed run needs a reason (AD-14).');
  const consequence = DISMISS_RUN_CONSEQUENCE;
  await deps.consoleDb.tx(async (q) => {
    const { rows } = await q.query<{ player_id: string }>(
      `update public.run_failures set resolved_at = now(), resolution = 'dismissed', dismissed_reason = $2
       where id = $1 and resolved_at is null returning player_id`,
      [failureId, reason.trim()],
    );
    if (!rows[0]) throw new AdminActionError(404, 'No such open failed run.');
    await recordAdminAction(q, staff, meta, {
      playerId: rows[0].player_id,
      actionType: 'run_dismiss',
      target: { failureId },
      consequence,
      reason,
    });
  });
  return { consequence };
}

// ---------------------------------------------------------------------------
// Trust and safety (AD-24, AD-25).
// ---------------------------------------------------------------------------

export type CaseOutcome = 'card_confirmed' | 'guardian_resent' | 'answer_withdrawn' | 'dismissed';

interface CaseRow {
  kind: string;
  player_id: string;
  resolved_at: string | null;
  card_shown_confirmed_at: string | null;
}

async function loadCase(q: ConsoleQuery, caseId: string): Promise<CaseRow | undefined> {
  const { rows } = await q.query<CaseRow>(
    `select kind, player_id, resolved_at, card_shown_confirmed_at from public.cases where id = $1`,
    [caseId],
  );
  return rows[0];
}

/** Validates a case outcome (AD-24, AD-25) and returns its consequence sentence. */
function caseConsequence(
  c: CaseRow | undefined,
  outcome: CaseOutcome,
  reason: string | null,
): string {
  if (!c) throw new AdminActionError(404, 'No such case.');
  if (c.resolved_at) throw new AdminActionError(409, 'This case is already resolved.');

  // AD-25 and AD-AC-12: a distress case can't be closed by dismissal
  // alone; a person must first confirm the card was shown.
  if (c.kind === 'distress' && outcome !== 'card_confirmed') {
    throw new AdminActionError(
      400,
      'A distress case closes only when a person confirms the "Someone to call" card was shown.',
    );
  }
  if (outcome === 'guardian_resent') {
    throw new AdminActionError(
      409,
      "The guardian confirmation email isn't built yet (step 1.4 skipped it), so there is nothing to resend.",
    );
  }
  if (outcome === 'dismissed' && !reason?.trim()) {
    throw new AdminActionError(400, 'Write a reason before dismissing a case.');
  }

  return outcome === 'card_confirmed'
    ? 'Records that the "Someone to call" card was shown and closes the case. The note itself is never opened.'
    : outcome === 'answer_withdrawn'
      ? 'Withdraws the reported answer and closes the case; the player is told.'
      : 'Closes the case with no change to the account.';
}

export async function previewResolveCase(
  deps: AdminActionDeps,
  caseId: string,
  outcome: CaseOutcome,
  reason: string | null,
): Promise<string> {
  return deps.consoleDb.read(async (q) =>
    caseConsequence(await loadCase(q, caseId), outcome, reason),
  );
}

export async function resolveCase(
  deps: AdminActionDeps,
  staff: Staff,
  meta: RequestMeta,
  caseId: string,
  outcome: CaseOutcome,
  reason: string | null,
): Promise<{ consequence: string }> {
  const now = deps.now?.() ?? new Date();
  return deps.consoleDb.tx(async (q) => {
    const c = await loadCase(q, caseId);
    const consequence = caseConsequence(c, outcome, reason);
    if (!c) throw new AdminActionError(404, 'No such case.');

    await q.query(
      `update public.cases
       set outcome = $2, resolved_by = $3, resolved_at = $4,
           card_shown_confirmed_at = case when $2 = 'card_confirmed' then $4 else card_shown_confirmed_at end
       where id = $1`,
      [caseId, outcome, staff.id, now.toISOString()],
    );
    const notify = outcome === 'answer_withdrawn';
    if (notify) {
      await notifyPlayer(q, {
        playerId: c.player_id,
        title: 'A reported answer was withdrawn',
        body: 'DeuceX support reviewed a report about one of your agent answers and withdrew it.',
      });
    }
    await recordAdminAction(q, staff, meta, {
      playerId: c.player_id,
      actionType: 'case_resolve',
      target: { caseId, kind: c.kind, outcome },
      consequence,
      reason,
      notifiedPlayer: notify,
    });
    return { consequence };
  });
}

// ---------------------------------------------------------------------------
// Alerts and routing (PRD-13 section 4.8, AD-27).
// ---------------------------------------------------------------------------

export async function acknowledgeAlerts(
  deps: AdminActionDeps,
  staff: Staff,
  ids: string[] | 'all',
): Promise<void> {
  await deps.consoleDb.tx(async (q) => {
    if (ids === 'all') {
      await q.query(
        `update public.alerts set acknowledged_by = $1, acknowledged_at = now() where acknowledged_at is null`,
        [staff.name],
      );
    } else {
      await q.query(
        `update public.alerts set acknowledged_by = $1, acknowledged_at = now()
         where id = any($2::uuid[]) and acknowledged_at is null`,
        [staff.name, ids],
      );
    }
  });
}

export async function saveRouting(
  deps: AdminActionDeps,
  staff: Staff,
  meta: RequestMeta,
  routes: Array<{ role: string; alertKind: string; push: boolean; email: boolean }>,
): Promise<void> {
  requireRole(staff, 'ops');
  await deps.consoleDb.tx(async (q) => {
    for (const r of routes) {
      if (!['support', 'ops', 'owner'].includes(r.role))
        throw new AdminActionError(400, 'Unknown role.');
      await q.query(
        `insert into public.alert_routes (role, alert_kind, push, email, updated_by, updated_at)
         values ($1, $2, $3, $4, $5, now())
         on conflict (role, alert_kind) do update
           set push = excluded.push, email = excluded.email, updated_by = excluded.updated_by, updated_at = now()`,
        [r.role, r.alertKind, r.push, r.email, staff.id],
      );
    }
    await recordAdminAction(q, staff, meta, {
      playerId: null,
      actionType: 'routing_update',
      target: { routes: routes.length },
      consequence: `Saves alert routing for ${routes.length} role and alert pairs. Takes effect for the next alert.`,
    });
  });
}
