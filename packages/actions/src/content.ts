import type { Database } from '@deucex/db';
import { contentPublishPayload } from '@deucex/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assertApprovalMatches, runGatedAction, type ApprovalGateDb } from './gate';
import type { EmailClient } from './resend-client';

// The Content Agent's one side effect (PRD-05 section 3's approval gate):
// emailing a patron update to the patrons in the selected tiers. Same shape
// and discipline as fans.ts: who receives it, their addresses, and the text
// that goes out all come from the server's own rows at send time; the
// approval payload is rebuilt from the patron_updates row and must hash the
// same as what the player approved, so an edit after approval can never go
// out under it.
//
//   content_publish  publishUpdateNow      one email per patron, now (C-14)
//   content_publish  scheduleUpdate        verifies the approval, claims nothing
//   content_publish  sendScheduledUpdate   claims it at the send time (C-AC-7)
//
// A scheduled update's recipient count is recomputed at send time (PRD-05
// section 7), and a cancelled schedule never consumes its approval.

/** Patrons who receive updates: active, or payment retrying; never paused or left. */
export const RECEIVING_PATRON_STATUSES = ['active', 'past_due'] as const;

/** Locker Room (position 2) and above get the practice-notes section (C-9). */
const PRACTICE_SECTION_MIN_POSITION = 2;

export interface ContentUpdateRow {
  id: string;
  playerId: string;
  status: string;
  subject: string;
  body: string;
  practiceSection: string | null;
  tierIds: string[];
  sendAt: string | null;
  teaser: boolean;
  approvalId: string | null;
}

export interface ContentRecipient {
  patronId: string;
  tierId: string;
  tierPosition: number;
  email: string;
}

export interface ContentSender {
  name: string;
  email: string;
  slug: string | null;
}

export interface ContentActionsDb {
  getUpdate(playerId: string, updateId: string): Promise<ContentUpdateRow | null>;
  getSender(playerId: string): Promise<ContentSender | null>;
  /** Receiving patrons with an email on file, in the given tiers, at this moment. */
  listRecipients(playerId: string, tierIds: readonly string[]): Promise<ContentRecipient[]>;
  /** Patrons this update already reached, so a retry after a failure never sends twice. */
  listSentPatronIds(updateId: string): Promise<string[]>;
  recordSend(input: {
    updateId: string;
    playerId: string;
    patronId: string;
    tierId: string;
    status: 'sent' | 'failed';
    emailId: string | null;
    error: string | null;
  }): Promise<void>;
  setStatus(
    updateId: string,
    patch: {
      status: string;
      approvalId?: string | null;
      approvedAt?: string | null;
      sentAt?: string | null;
      recipientCount?: number | null;
      deliveredCount?: number | null;
      sendError?: string | null;
    },
  ): Promise<void>;
}

export class UpdateNotFoundError extends Error {
  constructor(readonly updateId: string) {
    super(`No patron update ${updateId} for this player`);
    this.name = 'UpdateNotFoundError';
  }
}

export class UpdateNotPublishableError extends Error {
  constructor(
    readonly updateId: string,
    readonly status: string,
  ) {
    super(`Patron update ${updateId} can't be published from status ${status}`);
    this.name = 'UpdateNotPublishableError';
  }
}

export class NoRecipientsError extends Error {
  constructor() {
    super('No patrons in the selected tiers can receive this update');
    this.name = 'NoRecipientsError';
  }
}

export class InvalidSendTimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSendTimeError';
  }
}

function payloadFor(row: ContentUpdateRow) {
  return contentPublishPayload({
    updateId: row.id,
    subject: row.subject,
    body: row.body,
    practiceSection: row.practiceSection,
    tierIds: row.tierIds,
    sendAt: row.sendAt,
    teaser: row.teaser,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function htmlParagraphs(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

/**
 * The email one patron receives. Locker Room and above get the practice-notes
 * section (C-9); every email carries the manage link step 4.1 left for this
 * step (PRD-04 P-17), since patrons have no login of their own.
 */
export function renderUpdateEmail(input: {
  body: string;
  practiceSection: string | null;
  tierPosition: number;
  playerName: string;
  manageUrl: string | null;
}): string {
  const firstName = input.playerName.trim().split(/\s+/)[0] ?? input.playerName;
  const parts = [htmlParagraphs(input.body)];
  if (input.practiceSection && input.tierPosition >= PRACTICE_SECTION_MIN_POSITION) {
    parts.push(`<h3>Practice notes</h3>\n${htmlParagraphs(input.practiceSection)}`);
  }
  parts.push('<hr>');
  parts.push(
    input.manageUrl
      ? `<p style="color:#666;font-size:13px">You're receiving this because you back ${escapeHtml(firstName)}'s season. Reply to write to ${escapeHtml(firstName)} directly. <a href="${escapeHtml(input.manageUrl)}">Manage your membership</a>.</p>`
      : `<p style="color:#666;font-size:13px">You're receiving this because you back ${escapeHtml(firstName)}'s season. Reply to write to ${escapeHtml(firstName)} directly.</p>`,
  );
  return parts.join('\n');
}

export interface DeliveryResult {
  recipientCount: number;
  deliveredCount: number;
  sentAt: string;
}

async function deliver(
  db: ContentActionsDb,
  email: EmailClient,
  row: ContentUpdateRow,
  recipients: readonly ContentRecipient[],
  approvalId: string,
  appBaseUrl: string,
): Promise<DeliveryResult> {
  const sender = await db.getSender(row.playerId);
  if (!sender) throw new UpdateNotFoundError(row.id);
  const manageUrl = sender.slug ? `${appBaseUrl.replace(/\/$/, '')}/p/${sender.slug}/manage` : null;

  await db.setStatus(row.id, { status: 'sending', approvalId });
  const already = new Set(await db.listSentPatronIds(row.id));
  let delivered = already.size;
  let lastError: string | null = null;

  for (const r of recipients) {
    if (already.has(r.patronId)) continue;
    try {
      const sent = await email.sendEmail({
        to: r.email,
        fromName: sender.name,
        replyTo: sender.email,
        subject: row.subject,
        html: renderUpdateEmail({
          body: row.body,
          practiceSection: row.practiceSection,
          tierPosition: r.tierPosition,
          playerName: sender.name,
          manageUrl,
        }),
      });
      await db.recordSend({
        updateId: row.id,
        playerId: row.playerId,
        patronId: r.patronId,
        tierId: r.tierId,
        status: 'sent',
        emailId: sent?.id ?? null,
        error: null,
      });
      delivered += 1;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      await db.recordSend({
        updateId: row.id,
        playerId: row.playerId,
        patronId: r.patronId,
        tierId: r.tierId,
        status: 'failed',
        emailId: null,
        error: lastError,
      });
    }
  }

  const sentAt = new Date().toISOString();
  const recipientCount = new Set([...already, ...recipients.map((r) => r.patronId)]).size;
  if (delivered === 0) {
    // PRD-05 section 3: "Send failed · Nothing reached patrons."
    await db.setStatus(row.id, {
      status: 'send_failed',
      recipientCount,
      deliveredCount: 0,
      sendError: lastError ?? 'Nothing was delivered',
    });
  } else {
    await db.setStatus(row.id, {
      status: 'published',
      sentAt,
      recipientCount,
      deliveredCount: delivered,
      sendError: lastError,
    });
  }
  return { recipientCount, deliveredCount: delivered, sentAt };
}

async function requireRow(db: ContentActionsDb, playerId: string, updateId: string) {
  const row = await db.getUpdate(playerId, updateId);
  if (!row) throw new UpdateNotFoundError(updateId);
  return row;
}

export interface PublishUpdateInput {
  approvalId: string;
  playerId: string;
  updateId: string;
  appBaseUrl: string;
}

/** Send now (C-14): claims the approval, then one email per receiving patron. */
export async function publishUpdateNow(
  gateDb: ApprovalGateDb,
  db: ContentActionsDb,
  email: EmailClient,
  input: PublishUpdateInput,
): Promise<DeliveryResult> {
  const row = await requireRow(db, input.playerId, input.updateId);
  if (!['draft', 'send_failed'].includes(row.status) || row.sendAt) {
    throw new UpdateNotPublishableError(row.id, row.status);
  }
  const recipients = await db.listRecipients(row.playerId, row.tierIds);
  if (recipients.length === 0) throw new NoRecipientsError();

  return runGatedAction(
    gateDb,
    {
      approvalId: input.approvalId,
      playerId: input.playerId,
      actionType: 'content_publish',
      payload: payloadFor(row),
    },
    async () => {
      await db.setStatus(row.id, { status: 'sending', approvedAt: new Date().toISOString() });
      return deliver(db, email, row, recipients, input.approvalId, input.appBaseUrl);
    },
  );
}

/**
 * Schedule (C-12): verifies the approval matches the draft as it stands and
 * records it on the row, without claiming it. Nothing is sent here.
 */
export async function scheduleUpdate(
  gateDb: ApprovalGateDb,
  db: ContentActionsDb,
  input: { approvalId: string; playerId: string; updateId: string; now?: Date },
): Promise<{ sendAt: string }> {
  const row = await requireRow(db, input.playerId, input.updateId);
  if (row.status !== 'draft') throw new UpdateNotPublishableError(row.id, row.status);
  if (!row.sendAt) throw new InvalidSendTimeError('A scheduled update needs a send time');
  if (new Date(row.sendAt).getTime() <= (input.now ?? new Date()).getTime()) {
    throw new InvalidSendTimeError('That send time has already passed');
  }
  await assertApprovalMatches(gateDb, {
    approvalId: input.approvalId,
    playerId: input.playerId,
    actionType: 'content_publish',
    payload: payloadFor(row),
  });
  await db.setStatus(row.id, {
    status: 'scheduled',
    approvalId: input.approvalId,
    approvedAt: new Date().toISOString(),
  });
  return { sendAt: row.sendAt };
}

/**
 * The send-time half of a schedule (C-AC-7), run by apps/api's tick: the
 * approval recorded at schedule time is claimed now, and the recipients are
 * whoever is receiving at this moment. With nobody left to receive it, the
 * update becomes Send failed and the approval is not consumed.
 */
export async function sendScheduledUpdate(
  gateDb: ApprovalGateDb,
  db: ContentActionsDb,
  email: EmailClient,
  input: { playerId: string; updateId: string; appBaseUrl: string },
): Promise<DeliveryResult | null> {
  const row = await requireRow(db, input.playerId, input.updateId);
  if (row.status !== 'scheduled' || !row.approvalId) return null;
  const recipients = await db.listRecipients(row.playerId, row.tierIds);
  if (recipients.length === 0) {
    await db.setStatus(row.id, {
      status: 'send_failed',
      recipientCount: 0,
      deliveredCount: 0,
      sendError: 'No patrons in the selected tiers at the send time',
    });
    return null;
  }
  const approvalId = row.approvalId;
  return runGatedAction(
    gateDb,
    {
      approvalId,
      playerId: input.playerId,
      actionType: 'content_publish',
      payload: payloadFor(row),
    },
    () => deliver(db, email, row, recipients, approvalId, input.appBaseUrl),
  );
}

// ---------------------------------------------------------------------------
// Supabase implementation (service role, apps/api only)
// ---------------------------------------------------------------------------

export class SupabaseContentActionsDb implements ContentActionsDb {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async getUpdate(playerId: string, updateId: string): Promise<ContentUpdateRow | null> {
    const { data, error } = await this.db
      .from('patron_updates')
      .select(
        'id, player_id, status, subject, body, practice_section, tier_ids, send_at, teaser, approval_id',
      )
      .eq('id', updateId)
      .eq('player_id', playerId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id,
      playerId: data.player_id,
      status: data.status,
      subject: data.subject,
      body: data.body,
      practiceSection: data.practice_section,
      tierIds: data.tier_ids,
      sendAt: data.send_at,
      teaser: data.teaser,
      approvalId: data.approval_id,
    };
  }

  async getSender(playerId: string): Promise<ContentSender | null> {
    const [{ data: player, error: pErr }, { data: programme, error: gErr }] = await Promise.all([
      this.db.from('players').select('name, email').eq('id', playerId).maybeSingle(),
      this.db.from('patron_programmes').select('slug').eq('player_id', playerId).maybeSingle(),
    ]);
    if (pErr) throw pErr;
    if (gErr) throw gErr;
    if (!player) return null;
    return { name: player.name, email: player.email, slug: programme?.slug ?? null };
  }

  async listRecipients(playerId: string, tierIds: readonly string[]): Promise<ContentRecipient[]> {
    if (tierIds.length === 0) return [];
    const { data, error } = await this.db
      .from('patrons')
      .select('id, email, tier_id, patron_tiers!inner(position)')
      .eq('player_id', playerId)
      .in('status', [...RECEIVING_PATRON_STATUSES])
      .in('tier_id', [...tierIds])
      .not('email', 'is', null);
    if (error) throw error;
    return (data ?? []).map((p) => ({
      patronId: p.id,
      tierId: p.tier_id,
      tierPosition: (p.patron_tiers as unknown as { position: number }).position,
      email: p.email as string,
    }));
  }

  async listSentPatronIds(updateId: string): Promise<string[]> {
    const { data, error } = await this.db
      .from('patron_update_sends')
      .select('patron_id')
      .eq('update_id', updateId)
      .eq('status', 'sent');
    if (error) throw error;
    return (data ?? []).map((r) => r.patron_id);
  }

  async recordSend(input: Parameters<ContentActionsDb['recordSend']>[0]): Promise<void> {
    const { error } = await this.db.from('patron_update_sends').upsert(
      {
        update_id: input.updateId,
        player_id: input.playerId,
        patron_id: input.patronId,
        tier_id: input.tierId,
        status: input.status,
        email_id: input.emailId,
        error: input.error,
        sent_at: new Date().toISOString(),
      },
      { onConflict: 'update_id,patron_id' },
    );
    if (error) throw error;
  }

  async setStatus(updateId: string, patch: Parameters<ContentActionsDb['setStatus']>[1]) {
    const row: Database['public']['Tables']['patron_updates']['Update'] = { status: patch.status };
    if (patch.approvalId !== undefined) row.approval_id = patch.approvalId;
    if (patch.approvedAt !== undefined) row.approved_at = patch.approvedAt;
    if (patch.sentAt !== undefined) row.sent_at = patch.sentAt;
    if (patch.recipientCount !== undefined) row.recipient_count = patch.recipientCount;
    if (patch.deliveredCount !== undefined) row.delivered_count = patch.deliveredCount;
    if (patch.sendError !== undefined) row.send_error = patch.sendError;
    const { error } = await this.db.from('patron_updates').update(row).eq('id', updateId);
    if (error) throw error;
  }
}
