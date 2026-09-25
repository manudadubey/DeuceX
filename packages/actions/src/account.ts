import type { Database, Json } from '@deucex/db';
import type { SupabaseClient } from '@supabase/supabase-js';
import { type ApprovalGateDb, runGatedAction } from './gate';
import type { EmailClient } from './resend-client';
import { type AdminActionGateDb, runAdminGatedAction } from './admin';

// The two Settings writes with a real vendor side effect (PRD-12 section 3's
// approval gate, CLAUDE.md's own opening line: "nothing leaves the app...
// without a player-authored row in approvals"). Everything else Settings
// writes (preferences, notification toggles, agent pause, share-link
// create/revoke/renew, downgrade to Free, cancelling a pending deletion) is
// a plain RLS-scoped write, same split step 2.2 established for
// expense_save/balance_update — see packages/db/src/settings.ts.

export class MissingPlayerEmailError extends Error {
  constructor(readonly playerId: string) {
    super(`No email on file for player ${playerId}`);
    this.name = 'MissingPlayerEmailError';
  }
}

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Account deletion (PRD-12 section 3, ST-19; decisions worksheet 4's
// fourteen-day cooling-off).
// ---------------------------------------------------------------------------

export interface AccountDeletionDb {
  getPlayerEmail(playerId: string): Promise<string | null>;
  storeDeletionRequest(input: {
    playerId: string;
    token: string;
    requestedAt: string;
    sentAt: string;
  }): Promise<void>;
}

export interface RequestAccountDeletionInput {
  approvalId: string;
  playerId: string;
  /** e.g. https://app.deucex.ai — server-configured, never client-supplied, so the emailed link can't be pointed at an attacker's domain. */
  appBaseUrl: string;
}

// Player taps "Delete" in Data & safety. This only emails the confirmation
// link ("nothing happens until you click it") — deletion_effective_at is
// set by confirmAccountDeletion below, not here, matching decisions
// worksheet 4's "clicking the confirmation link starts" the window.
export async function requestAccountDeletion(
  gateDb: ApprovalGateDb,
  email: EmailClient,
  db: AccountDeletionDb,
  input: RequestAccountDeletionInput,
): Promise<{ token: string }> {
  const payload: Json = {};

  return runGatedAction(
    gateDb,
    {
      approvalId: input.approvalId,
      playerId: input.playerId,
      actionType: 'account_deletion_request',
      payload,
    },
    async () => {
      const playerEmail = await db.getPlayerEmail(input.playerId);
      if (!playerEmail) throw new MissingPlayerEmailError(input.playerId);

      const token = randomToken();
      const now = new Date().toISOString();
      await db.storeDeletionRequest({
        playerId: input.playerId,
        token,
        requestedAt: now,
        sentAt: now,
      });

      const confirmUrl = `${input.appBaseUrl}/account/delete/confirm?token=${token}`;
      await email.sendEmail({
        to: playerEmail,
        subject: 'Confirm your DeuceX account deletion',
        html: `<p>Someone (hopefully you) asked to delete your DeuceX account.</p>
<p>Nothing happens until you click this link. Once you do, your account enters a 14-day cooling-off period — plenty of time to change your mind.</p>
<p><a href="${confirmUrl}">Confirm account deletion</a></p>
<p>Didn't ask for this? Ignore this email and nothing will happen.</p>`,
      });

      return { token };
    },
  );
}

export interface AccountDb {
  findPlayerByDeletionToken(token: string): Promise<{ playerId: string } | null>;
  confirmDeletion(input: { playerId: string; effectiveAt: string }): Promise<void>;
  cancelDeletion(playerId: string): Promise<void>;
}

// Player clicks the emailed link. Not gated: no vendor call, no email
// leaves the app here — the token itself is the credential (same trust
// model as Supabase's own token_hash confirm flow apps/web/app/auth/confirm
// already uses), and this only ever runs via apps/api's service role, never
// a path apps/web could call directly.
export async function confirmAccountDeletion(
  db: AccountDb,
  token: string,
  now: Date = new Date(),
): Promise<{ playerId: string; effectiveAt: string } | null> {
  const found = await db.findPlayerByDeletionToken(token);
  if (!found) return null;

  const effectiveAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
  await db.confirmDeletion({ playerId: found.playerId, effectiveAt });
  return { playerId: found.playerId, effectiveAt };
}

export async function cancelAccountDeletion(db: AccountDb, playerId: string): Promise<void> {
  await db.cancelDeletion(playerId);
}

// ---------------------------------------------------------------------------
// Data export (PRD-12 section 3, ST-17).
// ---------------------------------------------------------------------------

export interface ExportNote {
  recordedAt: string;
  ctx: string;
  result: string | null;
  opponent: string | null;
  tags: unknown;
  mood: string | null;
  summary: string | null;
  transcript: string | null;
}

export interface ExportExpense {
  date: string;
  category: string;
  what: string;
  amountOriginal: number;
  currencyOriginal: string;
}

export interface ExportBundle {
  notes: ExportNote[];
  checkIns: Array<{ date: string; value: number; sentence: string | null }>;
  expenses: ExportExpense[];
  reserveEntries: Array<{ enteredAt: string; amount: number; currency: string; cause: string }>;
  budgetEstimates: Array<{
    label: string;
    estimateAmount: number;
    currency: string;
    estimatedAt: string;
  }>;
}

export interface DataExportDb extends AccountDeletionDb {
  getExportBundle(playerId: string): Promise<ExportBundle>;
  storeExportRequest(input: {
    playerId: string;
    requestedAt: string;
    deliveredAt: string;
  }): Promise<void>;
}

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Headers passed explicitly, not inferred from rows[0]: an empty-but-valid
// export (a brand new account with no expenses yet) still needs a non-empty
// file — Resend's own attachment validation refuses an attachment whose
// content is an empty string ("must have either a `content` or `path`"),
// found live, this session, the first time this ran against a real account
// with no ledger lines yet. A header-only CSV is honest either way: exactly
// the columns being exported, whether or not there are rows.
function toCsv(headers: readonly string[], rows: Array<Record<string, unknown>>): string {
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  return lines.join('\n');
}

export function buildExportJson(bundle: ExportBundle): string {
  return JSON.stringify(bundle, null, 2);
}

const EXPENSE_CSV_HEADERS = ['date', 'category', 'what', 'amount', 'currency'] as const;

export function buildExpensesCsv(bundle: ExportBundle): string {
  return toCsv(
    EXPENSE_CSV_HEADERS,
    bundle.expenses.map((e) => ({
      date: e.date,
      category: e.category,
      what: e.what,
      amount: e.amountOriginal,
      currency: e.currencyOriginal,
    })),
  );
}

const NOTES_CSV_HEADERS = [
  'recorded_at',
  'context',
  'result',
  'opponent',
  'mood',
  'summary',
] as const;

export function buildNotesCsv(bundle: ExportBundle): string {
  // Deliberately no transcript column here — transcripts get their own
  // plain-text file (buildTranscriptsText), same "notes.csv is metadata,
  // transcripts.txt is prose" split the build plan's own wording implies
  // ("the export job produces JSON, CSV and transcripts").
  return toCsv(
    NOTES_CSV_HEADERS,
    bundle.notes.map((n) => ({
      recorded_at: n.recordedAt,
      context: n.ctx,
      result: n.result,
      opponent: n.opponent,
      mood: n.mood,
      summary: n.summary,
    })),
  );
}

export function buildTranscriptsText(bundle: ExportBundle): string {
  const withTranscript = bundle.notes.filter((n) => n.transcript);
  if (withTranscript.length === 0) return 'No transcripts yet.';
  return withTranscript
    .map(
      (n) => `${n.recordedAt} · ${n.ctx}${n.opponent ? ` vs ${n.opponent}` : ''}\n${n.transcript}`,
    )
    .join('\n\n---\n\n');
}

function toBase64(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64');
}

export interface RequestDataExportInput {
  approvalId: string;
  playerId: string;
}

export async function requestDataExport(
  gateDb: ApprovalGateDb,
  email: EmailClient,
  db: DataExportDb,
  input: RequestDataExportInput,
): Promise<void> {
  const payload: Json = {};

  return runGatedAction(
    gateDb,
    {
      approvalId: input.approvalId,
      playerId: input.playerId,
      actionType: 'data_export_request',
      payload,
    },
    () => deliverDataExport(email, db, input.playerId),
  );
}

async function deliverDataExport(
  email: EmailClient,
  db: DataExportDb,
  playerId: string,
): Promise<void> {
  const playerEmail = await db.getPlayerEmail(playerId);
  if (!playerEmail) throw new MissingPlayerEmailError(playerId);

  const requestedAt = new Date().toISOString();
  const bundle = await db.getExportBundle(playerId);

  await email.sendEmail({
    to: playerEmail,
    subject: 'Your DeuceX export is ready',
    html: `<p>Attached: everything DeuceX has on file for you — notes, transcripts, expenses and check-ins — as JSON and CSV.</p>`,
    attachments: [
      { filename: 'data.json', content: toBase64(buildExportJson(bundle)) },
      { filename: 'expenses.csv', content: toBase64(buildExpensesCsv(bundle)) },
      { filename: 'notes.csv', content: toBase64(buildNotesCsv(bundle)) },
      { filename: 'transcripts.txt', content: toBase64(buildTranscriptsText(bundle)) },
    ],
  });

  const deliveredAt = new Date().toISOString();
  await db.storeExportRequest({ playerId, requestedAt, deliveredAt });
}

/**
 * PRD-13 AD-9: support triggers the same export the player can request,
 * behind the admin-action gate instead of a player approval. The bundle
 * goes to the player's own address on file, never to staff.
 */
export async function sendStaffDataExport(
  gateDb: AdminActionGateDb,
  email: EmailClient,
  db: DataExportDb,
  input: { adminActionId: string; playerId: string },
): Promise<void> {
  await runAdminGatedAction(
    gateDb,
    { adminActionId: input.adminActionId, playerId: input.playerId, actionType: 'export_data' },
    () => deliverDataExport(email, db, input.playerId),
  );
}

// ---------------------------------------------------------------------------
// Service-role Supabase implementations. Both interfaces above stay narrow
// so account.test.ts needs no live Postgres connection (same idiom
// receivables.ts's SupabaseReceivablesDb already establishes).
// ---------------------------------------------------------------------------

export class SupabaseAccountDb implements AccountDeletionDb, AccountDb, DataExportDb {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getPlayerEmail(playerId: string): Promise<string | null> {
    const { data, error } = await this.client
      .from('players')
      .select('email')
      .eq('id', playerId)
      .maybeSingle();
    if (error) throw error;
    return data?.email ?? null;
  }

  async storeDeletionRequest(input: {
    playerId: string;
    token: string;
    requestedAt: string;
    sentAt: string;
  }): Promise<void> {
    const { error } = await this.client
      .from('players')
      .update({
        deletion_requested_at: input.requestedAt,
        deletion_confirmation_token: input.token,
        deletion_confirmation_sent_at: input.sentAt,
      })
      .eq('id', input.playerId);
    if (error) throw error;
  }

  async findPlayerByDeletionToken(token: string): Promise<{ playerId: string } | null> {
    const { data, error } = await this.client
      .from('players')
      .select('id')
      .eq('deletion_confirmation_token', token)
      .maybeSingle();
    if (error) throw error;
    return data ? { playerId: data.id } : null;
  }

  async confirmDeletion(input: { playerId: string; effectiveAt: string }): Promise<void> {
    const { error } = await this.client
      .from('players')
      .update({
        deletion_effective_at: input.effectiveAt,
        deletion_cancelled_at: null,
        deletion_confirmation_token: null,
      })
      .eq('id', input.playerId);
    if (error) throw error;
  }

  async cancelDeletion(playerId: string): Promise<void> {
    const { error } = await this.client
      .from('players')
      .update({
        deletion_effective_at: null,
        deletion_cancelled_at: new Date().toISOString(),
      })
      .eq('id', playerId);
    if (error) throw error;
  }

  async storeExportRequest(input: {
    playerId: string;
    requestedAt: string;
    deliveredAt: string;
  }): Promise<void> {
    const { error } = await this.client
      .from('players')
      .update({ export_requested_at: input.requestedAt, export_delivered_at: input.deliveredAt })
      .eq('id', input.playerId);
    if (error) throw error;
  }

  async getExportBundle(playerId: string): Promise<ExportBundle> {
    const [notes, checkIns, expenses, reserveEntries, budgetEstimates] = await Promise.all([
      this.client
        .from('notes')
        .select('recorded_at, ctx, result, opponent, tags, mood, summary, transcript')
        .eq('player_id', playerId)
        .order('recorded_at', { ascending: false }),
      this.client
        .from('check_ins')
        .select('date, value, sentence')
        .eq('player_id', playerId)
        .order('date', { ascending: false }),
      this.client
        .from('ledger_lines')
        .select('date, category, what, amount_original, currency_original')
        .eq('player_id', playerId)
        .order('date', { ascending: false }),
      this.client
        .from('reserve_entries')
        .select('entered_at, amount, currency, cause')
        .eq('player_id', playerId)
        .order('entered_at', { ascending: false }),
      this.client
        .from('budget_estimates')
        .select('label, estimate_amount, currency, estimated_at')
        .eq('player_id', playerId)
        .order('estimated_at', { ascending: false }),
    ]);
    if (notes.error) throw notes.error;
    if (checkIns.error) throw checkIns.error;
    if (expenses.error) throw expenses.error;
    if (reserveEntries.error) throw reserveEntries.error;
    if (budgetEstimates.error) throw budgetEstimates.error;

    return {
      notes: (notes.data ?? []).map((n) => ({
        recordedAt: n.recorded_at,
        ctx: n.ctx,
        result: n.result,
        opponent: n.opponent,
        tags: n.tags,
        mood: n.mood,
        summary: n.summary,
        transcript: n.transcript,
      })),
      checkIns: (checkIns.data ?? []).map((c) => ({
        date: c.date,
        value: c.value,
        sentence: c.sentence,
      })),
      expenses: (expenses.data ?? []).map((e) => ({
        date: e.date,
        category: e.category,
        what: e.what,
        amountOriginal: e.amount_original,
        currencyOriginal: e.currency_original,
      })),
      reserveEntries: (reserveEntries.data ?? []).map((r) => ({
        enteredAt: r.entered_at,
        amount: r.amount,
        currency: r.currency,
        cause: r.cause,
      })),
      budgetEstimates: (budgetEstimates.data ?? []).map((b) => ({
        label: b.label,
        estimateAmount: b.estimate_amount,
        currency: b.currency,
        estimatedAt: b.estimated_at,
      })),
    };
  }
}
