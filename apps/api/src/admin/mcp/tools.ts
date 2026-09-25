import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import { canAccessArea, roleAtLeast, type AdminArea, type AdminRole } from '@deucex/shared';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  DeadlineError,
  listMissingDeadlines,
  previewEntryDeadline,
  setEntryDeadline,
} from '../../rankings/deadlines';
import {
  AdminActionError,
  DISMISS_RUN_CONSEQUENCE,
  agentPauseConsequence,
  dismissFailedRun,
  previewPlayerAction,
  previewResolveCase,
  previewRetryFailedRun,
  providerSwitchConsequence,
  resolveCase,
  retryFailedRun,
  runPlayerAction,
  setAgentPaused,
  setProviderState,
  type AdminActionDeps,
} from '../actions';
import { AGENTS, PROVIDERS } from '../agents-registry';
import { ReasonRequiredError, recordAdminAction, type RequestMeta } from '../audit';
import type { PlayerActionType } from '../consequences';
import {
  getAgentHealth,
  getMoney,
  getOverview,
  getPlayerDetail,
  getTrust,
  listAdminAudit,
  listAlerts,
  listPlayers,
} from '../queries';
import type { Staff } from '../staff-auth';
import { ConfirmationError, ConfirmationTokens } from './confirmation';

// The admin MCP server's tools (build plan step 5.0, TECH-ARCHITECTURE.md
// 3a, PRD-13 AD-3 to AD-5). Each tool is a thin wrapper over the same
// console functions apps/admin reaches through admin/routes.ts, under the
// same rules:
// - staff identity: every call arrives with a Staff resolved from a
//   console-issued MCP token (mcp-tokens.ts);
// - role: a tool belongs to a console area and, for some, a minimum role.
//   tools/list shows a role only its own tools (AD-2), and a call to any
//   other tool is refused here regardless of what the client sends;
// - two-step (AD-3): an action tool first returns its consequence sentence
//   and a confirmation token, and only runs when called again with it;
// - reason (AD-5): delete, comp and the provider kill switch are refused
//   without a written reason, which is stored verbatim;
// - audit (AD-4): every call writes one admin_actions row with via 'mcp'
//   (shown as mcp:<admin name>). A confirmed action writes the same row the
//   console would; a read, a preview or a refusal writes an mcp_read,
//   mcp_preview or mcp_refused row with no player_id, so a staff lookup
//   never lands in a player's own Data and safety log (PRD-13 section 3:
//   opening a player record isn't a logged event for the player);
// - side effects: only through the console's own action functions, which
//   send email through packages/actions' admin-action gate. Nothing here
//   imports a vendor client.
// Reads run as the console database role, so AD-6 (no notes, audio, moods
// or photos) holds for MCP exactly as it does for the console.

export interface AdminMcpDeps extends AdminActionDeps {
  /** Ingestion (AD-21) uses the platform's service client, as the console's ingestion routes do. */
  ingestion?: {
    db: SupabaseClient<Database>;
    rerunShortlists?: (tournamentId: string) => Promise<number>;
  };
  confirmations: ConfirmationTokens;
}

export interface ToolContext {
  deps: AdminMcpDeps;
  staff: Staff;
  meta: RequestMeta;
  now: Date;
}

type Shape = z.ZodRawShape;

interface ToolBase<S extends Shape> {
  name: string;
  title: string;
  description: string;
  area: AdminArea;
  minRole?: AdminRole;
  input: S;
}

interface ReadTool<S extends Shape> extends ToolBase<S> {
  kind: 'read';
  /** A short phrase for the audit row: "looked up players matching x". */
  summary: (args: z.infer<z.ZodObject<S>>) => string;
  run: (ctx: ToolContext, args: z.infer<z.ZodObject<S>>) => Promise<unknown>;
}

interface ActionTool<S extends Shape> extends ToolBase<S> {
  kind: 'action';
  destructive?: boolean;
  /** AD-5: refused without a written reason. */
  reasonRequired?: boolean;
  preview: (ctx: ToolContext, args: z.infer<z.ZodObject<S>>) => Promise<string>;
  run: (ctx: ToolContext, args: z.infer<z.ZodObject<S>>) => Promise<unknown>;
}

// Stored with a loose shape so one array can hold every tool; each tool's
// own callbacks are checked against its own schema where it is defined.
type AnyTool = ReadTool<Shape> | ActionTool<Shape>;

function read<S extends Shape>(tool: Omit<ReadTool<S>, 'kind'>): AnyTool {
  return { kind: 'read', ...tool } as unknown as AnyTool;
}
function action<S extends Shape>(tool: Omit<ActionTool<S>, 'kind'>): AnyTool {
  return { kind: 'action', ...tool } as unknown as AnyTool;
}

const playerId = z.string().uuid().describe('The player id (from find_players).');
const reason = z
  .string()
  .max(2000)
  .optional()
  .describe(
    'Why. Stored verbatim in the audit log and shown to the player where it concerns them.',
  );
const requiredReason = z
  .string()
  .max(2000)
  .optional()
  .describe(
    "Required (AD-5): why, in the staff member's own words. Stored verbatim and shown to the player.",
  );

function playerAction(
  name: string,
  action_: PlayerActionType,
  title: string,
  description: string,
  options: { minRole?: AdminRole; reasonRequired?: boolean; destructive?: boolean } = {},
): AnyTool {
  const input = {
    playerId,
    ...(options.reasonRequired ? { reason: requiredReason } : { reason }),
  };
  return action({
    name,
    title,
    description,
    area: 'players',
    input,
    ...options,
    preview: async (ctx, args) =>
      (await previewPlayerAction(ctx.deps, ctx.staff, args.playerId, action_, {})).consequence,
    run: (ctx, args) =>
      runPlayerAction(ctx.deps, ctx.staff, ctx.meta, args.playerId, action_, {
        reason: args.reason ?? null,
      }),
  });
}

function requireIngestion(ctx: ToolContext) {
  if (!ctx.deps.ingestion) {
    throw new AdminActionError(409, 'Ingestion is not configured in this environment.');
  }
  return ctx.deps.ingestion;
}

export const ADMIN_TOOLS: readonly AnyTool[] = [
  // --- Reads.
  read({
    name: 'whoami',
    title: 'Who am I',
    description:
      'The staff member this token acts for, their role, and the console areas that role holds.',
    area: 'overview',
    input: {},
    summary: () => 'checked their own identity and role',
    run: async (ctx) => ({
      name: ctx.staff.name,
      email: ctx.staff.email,
      role: ctx.staff.role,
      tools: visibleTools(ctx.staff.actingRole).map((t) => t.name),
    }),
  }),
  read({
    name: 'get_overview',
    title: 'Overview',
    description:
      'The console Overview: players by tier, what needs attention today, recent activity.',
    area: 'overview',
    input: {},
    summary: () => 'read the Overview',
    run: (ctx) => ctx.deps.consoleDb.read((q) => getOverview(q, ctx.staff.actingRole, ctx.now)),
  }),
  read({
    name: 'find_players',
    title: 'Find players',
    description:
      'Search players by name, email, country, ATP/WTA or ITF number, or rank; filter by tier (free, pro, elite) and status. Returns up to 200, newest first.',
    area: 'players',
    input: {
      query: z
        .string()
        .max(200)
        .optional()
        .describe('Name, email, country, player number or rank.'),
      tier: z.enum(['free', 'pro', 'elite']).optional(),
      status: z
        .string()
        .max(40)
        .optional()
        .describe('A status as the console shows it, for example Active, Trial, Dormant.'),
    },
    summary: (args) =>
      `looked up players${args.query ? ` matching "${args.query}"` : ''}${args.tier ? `, tier ${args.tier}` : ''}${args.status ? `, status ${args.status}` : ''}`,
    run: (ctx, args) =>
      ctx.deps.consoleDb.read((q) =>
        listPlayers(
          q,
          {
            ...(args.query ? { q: args.query } : {}),
            ...(args.tier ? { tier: args.tier } : {}),
            ...(args.status ? { status: args.status } : {}),
          },
          ctx.now,
        ),
      ),
  }),
  read({
    name: 'get_player',
    title: 'Player detail',
    description:
      "One player's detail panel (AD-8): tier, plan, verification, stage, share links, agent schedules, model spend this month and their audit log. Never notes, audio, moods or photos.",
    area: 'players',
    input: { playerId },
    summary: (args) => `opened player ${args.playerId}`,
    run: async (ctx, args) => {
      const detail = await ctx.deps.consoleDb.read((q) =>
        getPlayerDetail(q, args.playerId, ctx.now),
      );
      if (!detail) throw new AdminActionError(404, 'No such player.');
      return detail;
    },
  }),
  read({
    name: 'list_alerts',
    title: 'Alerts',
    description: 'Platform alerts for this role, newest first, needs-action and FYI.',
    area: 'overview',
    input: {},
    summary: () => 'read the alerts',
    run: (ctx) => ctx.deps.consoleDb.read((q) => listAlerts(q, ctx.staff.actingRole)),
  }),
  read({
    name: 'get_agent_health',
    title: 'Agent health',
    description:
      'Per agent: seven-day runs, success rate, p50 latency, cost per run, approval and dismiss rates (AD-13); failed runs with their error and attempt count (AD-14); pauses and provider switches.',
    area: 'agents',
    input: {},
    summary: () => 'read Agent health',
    run: (ctx) => ctx.deps.consoleDb.read((q) => getAgentHealth(q, ctx.staff.actingRole, ctx.now)),
  }),
  read({
    name: 'get_feed_status',
    title: 'Feed status',
    description:
      'Every ingestion feed with its cadence, last and next run, row count and issues, and whether it is overdue (AD-17).',
    area: 'ingestion',
    input: {},
    summary: () => 'read feed status',
    run: (ctx) =>
      ctx.deps.consoleDb.read(async (q) => {
        const { rows } = await q.query<{ next_expected_at: string }>(
          `select * from public.feed_status order by feed`,
        );
        return rows.map((f) => ({
          ...f,
          overdue: new Date(f.next_expected_at).getTime() < ctx.now.getTime(),
        }));
      }),
  }),
  read({
    name: 'list_missing_deadlines',
    title: 'Events without a deadline',
    description:
      'Calendar events with no published entry deadline, each with how many players shortlisted it (AD-21).',
    area: 'ingestion',
    input: {},
    summary: () => 'listed events without a deadline',
    run: (ctx) => listMissingDeadlines(requireIngestion(ctx).db),
  }),
  read({
    name: 'list_cases',
    title: 'Trust and safety cases',
    description:
      'Open and recent cases, oldest first, with only the tripping sentence or report text (AD-24, AD-6).',
    area: 'trust',
    input: {},
    summary: () => 'read Trust and safety',
    run: (ctx) => ctx.deps.consoleDb.read((q) => getTrust(q, ctx.now)),
  }),
  read({
    name: 'get_spend',
    title: 'Money and spend',
    description:
      'Owner only. Model and API spend per paying player against the 15 percent cap (AD-19), MRR by tier, platform fees, held payouts (AD-22).',
    area: 'money',
    minRole: 'owner',
    input: {},
    summary: () => 'read Money and spend',
    run: (ctx) => ctx.deps.consoleDb.read((q) => getMoney(q, ctx.now)),
  }),
  read({
    name: 'get_audit_log',
    title: 'Admin audit log',
    description:
      "The admin audit log, newest first (AD-28): your own entries, or for the owner every admin's (optionally one admin's by id).",
    area: 'audit',
    input: { adminId: z.string().uuid().optional() },
    summary: (args) => `read the admin audit log${args.adminId ? ` for ${args.adminId}` : ''}`,
    run: (ctx, args) =>
      ctx.deps.consoleDb.read((q) =>
        listAdminAudit(q, ctx.staff.id, ctx.staff.actingRole, args.adminId),
      ),
  }),

  // --- Player actions (AD-9, AD-11, AD-23).
  playerAction(
    'send_sign_in_link',
    'magic_link',
    'Send a sign-in link',
    'Emails the player one sign-in link. Two-step: call once to preview, again with the confirmation token.',
  ),
  playerAction(
    'reverify_ranking',
    'reverify',
    'Re-run ranking verification',
    "Re-checks the player's ranking against the current directory; the player is told only if the result changes. Two-step.",
  ),
  playerAction(
    'extend_trial',
    'trial_extend',
    'Extend trial 14 days',
    "Moves the player's Pro trial end 14 days out and notifies them. Two-step.",
  ),
  playerAction(
    'pause_player_agents',
    'pause_agents',
    "Pause a player's agents",
    'Stops new proposals for this player until resumed; nothing approved is undone; the player is notified. Two-step.',
  ),
  playerAction(
    'resume_player_agents',
    'resume_agents',
    "Resume a player's agents",
    "Resumes this player's agents from their next run and notifies them. Two-step.",
  ),
  playerAction(
    'send_data_export',
    'export_data',
    'Email the player their export',
    "Emails the player's full data export to their own address. Staff never see it. Two-step.",
    { destructive: true },
  ),
  playerAction(
    'cancel_deletion',
    'cancel_deletion',
    'Cancel a scheduled deletion',
    "At the player's request, cancels the deletion in its 14-day cooling-off. Two-step.",
  ),
  playerAction(
    'delete_account',
    'delete_account',
    'Delete account (14-day cooling-off)',
    "Owner only. Starts the same 14-day cooling-off as the player's own request and emails them at once (AD-11). Refused without a reason (AD-5). Two-step.",
    { minRole: 'owner', reasonRequired: true, destructive: true },
  ),
  playerAction(
    'comp_elite',
    'comp',
    'Comp Elite for 30 days',
    'Owner only. Gives the player Elite free for 30 days. Refused without a reason (AD-5). Two-step.',
    { minRole: 'owner', reasonRequired: true },
  ),
  playerAction(
    'offer_elite',
    'offer_elite',
    'Send an Elite offer',
    'Owner only. Sends a player at the Pro patron cap one in-app offer to move to Elite (AD-23). Two-step.',
    { minRole: 'owner' },
  ),
  action({
    name: 'revoke_share_link',
    title: 'Revoke a share link',
    description:
      "Revokes one of the player's coach or manager links (ids from get_player). Two-step.",
    area: 'players',
    destructive: true,
    input: { playerId, linkId: z.string().uuid(), reason },
    preview: async (ctx, args) =>
      (
        await previewPlayerAction(ctx.deps, ctx.staff, args.playerId, 'revoke_share_link', {
          linkId: args.linkId,
        })
      ).consequence,
    run: (ctx, args) =>
      runPlayerAction(ctx.deps, ctx.staff, ctx.meta, args.playerId, 'revoke_share_link', {
        reason: args.reason ?? null,
        linkId: args.linkId,
      }),
  }),

  // --- Agent health (AD-14 to AD-16).
  action({
    name: 'retry_failed_run',
    title: 'Retry a failed run',
    description:
      'Ops or owner. Re-queues a failed agent run (id from get_agent_health) with the attempt count reset. Two-step.',
    area: 'agents',
    minRole: 'ops',
    input: { failureId: z.string().uuid() },
    preview: (ctx, args) => previewRetryFailedRun(ctx.deps, args.failureId),
    run: (ctx, args) => retryFailedRun(ctx.deps, ctx.staff, ctx.meta, args.failureId),
  }),
  action({
    name: 'dismiss_failed_run',
    title: 'Dismiss a failed run',
    description:
      'Ops or owner. Removes a failed run from the list without re-running it. Needs a reason (AD-14). Two-step.',
    area: 'agents',
    minRole: 'ops',
    reasonRequired: true,
    input: { failureId: z.string().uuid(), reason: requiredReason },
    preview: async () => DISMISS_RUN_CONSEQUENCE,
    run: (ctx, args) =>
      dismissFailedRun(ctx.deps, ctx.staff, ctx.meta, args.failureId, args.reason ?? null),
  }),
  action({
    name: 'set_agent_paused',
    title: 'Pause or resume an agent for everyone',
    description:
      'Ops or owner. Pauses or resumes one agent for every player (AD-15). Pausing stops proposals only. Two-step.',
    area: 'agents',
    minRole: 'ops',
    input: {
      agent: z.enum(AGENTS.filter((a) => a.queued).map((a) => a.name) as [string, ...string[]]),
      paused: z.boolean(),
      reason,
    },
    preview: async (_ctx, args) => agentPauseConsequence(args.agent, args.paused),
    run: (ctx, args) =>
      setAgentPaused(ctx.deps, ctx.staff, ctx.meta, args.agent, args.paused, args.reason ?? null),
  }),
  action({
    name: 'set_provider_switch',
    title: 'Provider kill switch',
    description:
      'Owner only. Turns a provider off or on (AD-16); every dependent agent pauses while off. Refused without a reason (AD-5). Two-step.',
    area: 'agents',
    minRole: 'owner',
    reasonRequired: true,
    destructive: true,
    input: {
      provider: z.enum(PROVIDERS.map((p) => p.key) as [string, ...string[]]),
      state: z.enum(['on', 'off']),
      reason: requiredReason,
    },
    preview: async (_ctx, args) => providerSwitchConsequence(args.provider, args.state),
    run: (ctx, args) =>
      setProviderState(
        ctx.deps,
        ctx.staff,
        ctx.meta,
        args.provider,
        args.state,
        args.reason ?? null,
      ),
  }),

  // --- Trust and safety (AD-24, AD-25).
  action({
    name: 'resolve_case',
    title: 'Resolve a case',
    description:
      'Resolves a case (id from list_cases). A distress case closes only with card_confirmed; dismissing needs a reason. Two-step.',
    area: 'trust',
    input: {
      caseId: z.string().uuid(),
      outcome: z.enum(['card_confirmed', 'answer_withdrawn', 'dismissed']),
      reason,
    },
    preview: (ctx, args) =>
      previewResolveCase(ctx.deps, args.caseId, args.outcome, args.reason ?? null),
    run: (ctx, args) =>
      resolveCase(ctx.deps, ctx.staff, ctx.meta, args.caseId, args.outcome, args.reason ?? null),
  }),

  // --- Ingestion (AD-21).
  action({
    name: 'set_entry_deadline',
    title: 'Set an entry deadline',
    description:
      "Ops or owner. Sets an event's entry deadline (id from list_missing_deadlines); countdowns start and every shortlist that includes it re-runs. Two-step.",
    area: 'ingestion',
    minRole: 'ops',
    input: {
      tournamentId: z.string().uuid(),
      entryDeadline: z.string().describe('YYYY-MM-DD'),
    },
    preview: (ctx, args) =>
      previewEntryDeadline(requireIngestion(ctx).db, args.tournamentId, args.entryDeadline),
    run: async (ctx, args) => {
      const ingestion = requireIngestion(ctx);
      const consequence = await previewEntryDeadline(
        ingestion.db,
        args.tournamentId,
        args.entryDeadline,
      );
      const rerun = await setEntryDeadline(
        ingestion.db,
        ingestion.rerunShortlists,
        args.tournamentId,
        args.entryDeadline,
      );
      await ctx.deps.consoleDb.tx((q) =>
        recordAdminAction(q, ctx.staff, ctx.meta, {
          playerId: null,
          actionType: 'deadline_set',
          target: { tournamentId: args.tournamentId, entryDeadline: args.entryDeadline },
          consequence,
        }),
      );
      return { rerun };
    },
  }),
];

export function canUseTool(role: AdminRole, tool: AnyTool): boolean {
  return canAccessArea(role, tool.area) && (!tool.minRole || roleAtLeast(role, tool.minRole));
}

export function visibleTools(role: AdminRole): AnyTool[] {
  return ADMIN_TOOLS.filter((t) => canUseTool(role, t));
}

function inputSchema(tool: AnyTool): z.ZodObject<Shape> {
  const shape: Shape =
    tool.kind === 'action'
      ? {
          ...tool.input,
          confirmationToken: z
            .string()
            .optional()
            .describe(
              'Leave out to preview. After the staff member has read the consequence and agreed, call again with the token the preview returned.',
            ),
        }
      : tool.input;
  return z.object(shape).strict();
}

/** tools/list for a role (AD-2: tools outside the role are absent, not disabled). */
export function listToolsFor(role: AdminRole) {
  return visibleTools(role).map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: zodToJsonSchema(inputSchema(tool), { $refStrategy: 'none' }) as {
      type: 'object';
      [key: string]: unknown;
    },
    annotations: {
      title: tool.title,
      readOnlyHint: tool.kind === 'read',
      destructiveHint: tool.kind === 'action' ? Boolean(tool.destructive) : false,
      openWorldHint: false,
    },
  }));
}

export interface ToolResult {
  isError: boolean;
  content: Array<{ type: 'text'; text: string }>;
  [key: string]: unknown;
}

function ok(value: unknown): ToolResult {
  return { isError: false, content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

/** Arguments as stored in an audit row: never the confirmation token. */
function auditArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== 'object') return {};
  const rest = { ...(args as Record<string, unknown>) };
  delete rest.confirmationToken;
  return rest;
}

async function audit(
  ctx: ToolContext,
  actionType: 'mcp_read' | 'mcp_preview' | 'mcp_refused' | 'mcp_failed',
  tool: string,
  args: unknown,
  consequence: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await ctx.deps.consoleDb.tx((q) =>
    recordAdminAction(q, ctx.staff, ctx.meta, {
      playerId: null,
      actionType,
      target: { tool, args: auditArgs(args), ...extra },
      consequence,
    }),
  );
}

async function refuse(
  ctx: ToolContext,
  tool: string,
  args: unknown,
  message: string,
): Promise<ToolResult> {
  await audit(ctx, 'mcp_refused', tool, args, `Refused ${tool}: ${message} Nothing changed.`, {
    error: message,
  });
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function refusalMessage(error: unknown): string | null {
  if (error instanceof AdminActionError) return error.message;
  if (error instanceof ReasonRequiredError) return error.message;
  if (error instanceof ConfirmationError) return error.message;
  if (error instanceof DeadlineError && error.status !== 500) return error.message;
  return null;
}

/** tools/call: the one entry point for every MCP tool call. */
export async function callAdminTool(
  ctx: ToolContext,
  name: string,
  rawArgs: unknown,
): Promise<ToolResult> {
  const tool = ADMIN_TOOLS.find((t) => t.name === name);
  if (!tool) return refuse(ctx, name, rawArgs, `There is no tool called ${name}.`);
  if (!canUseTool(ctx.staff.actingRole, tool)) {
    return refuse(
      ctx,
      name,
      rawArgs,
      `The ${ctx.staff.actingRole} role can't use ${name}${tool.minRole ? `; it needs ${tool.minRole}` : ''}.`,
    );
  }
  const parsed = inputSchema(tool).safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.') || 'arguments'}: ${i.message}`)
      .join('; ');
    return refuse(ctx, name, rawArgs, `Invalid arguments (${detail}).`);
  }
  const { confirmationToken, ...args } = parsed.data as Record<string, unknown> & {
    confirmationToken?: string;
  };

  try {
    if (tool.kind === 'read') {
      const result = await tool.run(ctx, args);
      await audit(
        ctx,
        'mcp_read',
        name,
        args,
        `Read only: ${tool.summary(args)}. Nothing changed.`,
      );
      return ok(result);
    }

    // AD-5: the reason comes first, before even the preview.
    if (tool.reasonRequired && !(args.reason as string | undefined)?.trim()) {
      return refuse(
        ctx,
        name,
        args,
        'Write a reason before this action. It is stored verbatim and shown to the player.',
      );
    }
    const consequence = await tool.preview(ctx, args);
    const subject = { staffId: ctx.staff.id, tool: name, args, consequence };

    if (!confirmationToken) {
      const issued = ctx.deps.confirmations.issue(subject, ctx.now);
      await audit(
        ctx,
        'mcp_preview',
        name,
        args,
        `Preview only, nothing changed. If confirmed: ${consequence}`,
      );
      return ok({
        status: 'needs_confirmation',
        consequence,
        confirmationToken: issued.token,
        expiresAt: issued.expiresAt,
        next: 'Show this consequence to the staff member word for word. Only if they agree, call the same tool again with the same arguments plus this confirmationToken.',
      });
    }

    ctx.deps.confirmations.consume(confirmationToken, subject, ctx.now);
    // The action writes its own admin_actions row (via 'mcp'), in the same
    // transaction as the change, exactly as a console confirm does.
    const result = await tool.run(ctx, args);
    return ok({ status: 'done', consequence, result });
  } catch (error) {
    const message = refusalMessage(error);
    if (message) return refuse(ctx, name, args, message);
    // Unexpected: still one audit row, so the call is never invisible. A
    // console action commits its own row with its change, so if this
    // failed after a commit both rows exist and the log shows what landed.
    await audit(
      ctx,
      'mcp_failed',
      name,
      args,
      `Failed ${name} with an internal error. Check the player's audit log for anything that changed before retrying.`,
      { error: error instanceof Error ? error.message : String(error) },
    ).catch(() => undefined);
    throw error;
  }
}
