import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@deucex/db';
import type { NamedPerson, UpdateCheck } from '@deucex/agents';

// Everything apps/api's Content Agent reads and writes, behind one interface
// (the same split as fans/store.ts), so the service is tested against an
// in-memory store and the Supabase queries live in one place.

export type UpdateStatus =
  | 'queued'
  | 'drafting'
  | 'draft'
  | 'scheduled'
  | 'sending'
  | 'published'
  | 'send_failed'
  | 'skipped'
  | 'superseded';

export type UpdateTrigger = 'note' | 'result' | 'manual' | 'fans_pass' | 'rebuild';

export interface StoredCheck extends UpdateCheck {
  fixApplied: boolean;
}

export interface BuiltFromItem {
  kind: 'note' | 'result' | 'voice' | 'mood' | 'notes';
  label: string;
  /** The note id for kind note, the update id for kind voice. */
  ref: string | null;
}

export interface UpdateRecord {
  id: string;
  playerId: string;
  trigger: UpdateTrigger;
  noteId: string | null;
  status: UpdateStatus;
  dueAt: string | null;
  lang: string;
  subject: string;
  altSubjects: string[];
  body: string;
  practiceSection: string | null;
  generatedSubject: string | null;
  generatedBody: string | null;
  draftFailed: boolean;
  draftedAt: string | null;
  checks: StoredCheck[];
  overrides: string[];
  builtFrom: BuiltFromItem[];
  people: NamedPerson[];
  tierIds: string[];
  tierReasons: Record<string, string>;
  sendAt: string | null;
  teaser: boolean;
  teaserRemovedAt: string | null;
  rebuildNoteId: string | null;
  /** The draft run whose proposal this update is; the publish approval records it (PRD-13 AD-13). */
  agentRunId: string | null;
  approvalId: string | null;
  sentAt: string | null;
  recipientCount: number | null;
  deliveredCount: number | null;
  skipReason: string | null;
  skippedAt: string | null;
  sendError: string | null;
  createdAt: string;
}

export type UpdatePatch = Partial<Omit<UpdateRecord, 'id' | 'playerId' | 'createdAt'>>;

export interface ContentPlayer {
  id: string;
  name: string;
  email: string;
  tier: string | null;
  timezone: string;
  patronLanguage: string;
  contentWindow: 'thirty_minutes' | 'next_morning' | 'manual';
  privateNames: string[];
  profileTeaser: boolean;
}

export interface ContentNote {
  id: string;
  ctx: string;
  recordedAt: string;
  durSeconds: number;
  transcript: string;
  result: string | null;
  opponent: string | null;
  round: string | null;
  surface: string | null;
  mood: string | null;
  tags: string[];
}

export interface ContentTier {
  id: string;
  position: number;
  name: string;
  activeCount: number;
}

export interface SendStats {
  updateId: string;
  delivered: number;
  opened: number;
}

export interface SendToPoll {
  id: string;
  emailId: string;
  patronId: string;
}

export interface ContentStore {
  getPlayer(playerId: string): Promise<ContentPlayer | null>;
  isAgentPaused(playerId: string): Promise<boolean>;
  getUpdate(playerId: string, updateId: string): Promise<UpdateRecord | null>;
  getOpenDraft(playerId: string): Promise<UpdateRecord | null>;
  /** Newest first, superseded rows left out. */
  listUpdates(playerId: string, limit: number): Promise<UpdateRecord[]>;
  insertUpdate(
    row: Pick<UpdateRecord, 'playerId' | 'trigger' | 'noteId' | 'status' | 'dueAt' | 'lang'>,
  ): Promise<UpdateRecord>;
  patchUpdate(updateId: string, patch: UpdatePatch): Promise<void>;
  /** queued -> drafting, only if still queued. False when another tick got there first. */
  claimQueued(updateId: string): Promise<boolean>;
  listDueQueued(now: Date): Promise<UpdateRecord[]>;
  listDueScheduled(now: Date): Promise<UpdateRecord[]>;
  getNote(noteId: string): Promise<ContentNote | null>;
  /** Saved notes recorded before `beforeIso`, newest first. */
  listNotesBefore(playerId: string, beforeIso: string, limit: number): Promise<ContentNote[]>;
  listTiers(playerId: string): Promise<ContentTier[]>;
  sendStats(updateIds: readonly string[]): Promise<SendStats[]>;
  /** When each current or past patron started, for join attribution. */
  listPatronStarts(playerId: string): Promise<string[]>;
  nextDeadline(
    playerId: string,
    now: Date,
  ): Promise<{ tournamentName: string; deadlineAt: string } | null>;
  insertNotification(input: {
    playerId: string;
    category: 'for_you' | 'fyi';
    title: string;
    body: string;
    actionHref: string | null;
  }): Promise<void>;
  listSendsToPoll(now: Date, limit: number): Promise<SendToPoll[]>;
  recordSendEvent(
    sendId: string,
    lastEvent: string | null,
    openedAt: string | null,
    checkedAt: string,
  ): Promise<void>;
  /** Rebuilds patrons.opens (the last six delivered updates, oldest first) for these patrons. */
  refreshPatronOpens(patronIds: readonly string[]): Promise<void>;
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

type UpdateRow = Database['public']['Tables']['patron_updates']['Row'];
type NoteRow = Database['public']['Tables']['notes']['Row'];

function toRecord(r: UpdateRow): UpdateRecord {
  return {
    id: r.id,
    playerId: r.player_id,
    trigger: r.trigger as UpdateTrigger,
    noteId: r.note_id,
    status: r.status as UpdateStatus,
    dueAt: r.due_at,
    lang: r.lang,
    subject: r.subject,
    altSubjects: r.alt_subjects,
    body: r.body,
    practiceSection: r.practice_section,
    generatedSubject: r.generated_subject,
    generatedBody: r.generated_body,
    draftFailed: r.draft_failed,
    draftedAt: r.drafted_at,
    checks: (Array.isArray(r.checks) ? r.checks : []) as unknown as StoredCheck[],
    overrides: r.overrides,
    builtFrom: (Array.isArray(r.built_from) ? r.built_from : []) as unknown as BuiltFromItem[],
    people: (Array.isArray(r.people) ? r.people : []) as unknown as NamedPerson[],
    tierIds: r.tier_ids,
    tierReasons: (r.tier_reasons ?? {}) as Record<string, string>,
    sendAt: r.send_at,
    teaser: r.teaser,
    teaserRemovedAt: r.teaser_removed_at,
    rebuildNoteId: r.rebuild_note_id,
    agentRunId: r.agent_run_id,
    approvalId: r.approval_id,
    sentAt: r.sent_at,
    recipientCount: r.recipient_count,
    deliveredCount: r.delivered_count,
    skipReason: r.skip_reason,
    skippedAt: r.skipped_at,
    sendError: r.send_error,
    createdAt: r.created_at,
  };
}

const PATCH_COLUMNS: Record<keyof UpdatePatch, keyof UpdateRow> = {
  trigger: 'trigger',
  noteId: 'note_id',
  status: 'status',
  dueAt: 'due_at',
  lang: 'lang',
  subject: 'subject',
  altSubjects: 'alt_subjects',
  body: 'body',
  practiceSection: 'practice_section',
  generatedSubject: 'generated_subject',
  generatedBody: 'generated_body',
  draftFailed: 'draft_failed',
  draftedAt: 'drafted_at',
  checks: 'checks',
  overrides: 'overrides',
  builtFrom: 'built_from',
  people: 'people',
  tierIds: 'tier_ids',
  tierReasons: 'tier_reasons',
  sendAt: 'send_at',
  teaser: 'teaser',
  teaserRemovedAt: 'teaser_removed_at',
  rebuildNoteId: 'rebuild_note_id',
  agentRunId: 'agent_run_id',
  approvalId: 'approval_id',
  sentAt: 'sent_at',
  recipientCount: 'recipient_count',
  deliveredCount: 'delivered_count',
  skipReason: 'skip_reason',
  skippedAt: 'skipped_at',
  sendError: 'send_error',
};

function toNote(n: NoteRow): ContentNote {
  return {
    id: n.id,
    ctx: n.ctx,
    recordedAt: n.recorded_at,
    durSeconds: n.dur_seconds,
    transcript: n.transcript ?? '',
    result: n.result,
    opponent: n.opponent,
    round: n.round,
    surface: n.surface,
    mood: n.mood,
    tags: Array.isArray(n.tags) ? (n.tags as string[]) : [],
  };
}

const RECEIVING = ['active', 'past_due'];

export class SupabaseContentStore implements ContentStore {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async getPlayer(playerId: string): Promise<ContentPlayer | null> {
    const { data, error } = await this.db
      .from('players')
      .select(
        'id, name, email, tier, timezone, patron_language, app_language, content_window, content_private_names, profile_teaser',
      )
      .eq('id', playerId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id,
      name: data.name,
      email: data.email,
      tier: data.tier,
      timezone: data.timezone,
      patronLanguage: (data.patron_language ?? data.app_language ?? 'en').trim(),
      contentWindow: data.content_window as ContentPlayer['contentWindow'],
      privateNames: data.content_private_names,
      profileTeaser: data.profile_teaser,
    };
  }

  async isAgentPaused(playerId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from('agent_schedules')
      .select('paused')
      .eq('player_id', playerId)
      .eq('agent_name', 'content')
      .maybeSingle();
    if (error) throw error;
    return data?.paused ?? false;
  }

  async getUpdate(playerId: string, updateId: string) {
    const { data, error } = await this.db
      .from('patron_updates')
      .select('*')
      .eq('id', updateId)
      .eq('player_id', playerId)
      .maybeSingle();
    if (error) throw error;
    return data ? toRecord(data) : null;
  }

  async getOpenDraft(playerId: string) {
    const { data, error } = await this.db
      .from('patron_updates')
      .select('*')
      .eq('player_id', playerId)
      .in('status', ['queued', 'drafting', 'draft'])
      .maybeSingle();
    if (error) throw error;
    return data ? toRecord(data) : null;
  }

  async listUpdates(playerId: string, limit: number) {
    const { data, error } = await this.db
      .from('patron_updates')
      .select('*')
      .eq('player_id', playerId)
      .neq('status', 'superseded')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(toRecord);
  }

  async insertUpdate(row: Parameters<ContentStore['insertUpdate']>[0]) {
    const { data, error } = await this.db
      .from('patron_updates')
      .insert({
        player_id: row.playerId,
        trigger: row.trigger,
        note_id: row.noteId,
        status: row.status,
        due_at: row.dueAt,
        lang: row.lang,
      })
      .select('*')
      .single();
    if (error) throw error;
    return toRecord(data);
  }

  async patchUpdate(updateId: string, patch: UpdatePatch) {
    const row: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      row[PATCH_COLUMNS[key as keyof UpdatePatch]] = value as Json;
    }
    const { error } = await this.db
      .from('patron_updates')
      .update(row as Database['public']['Tables']['patron_updates']['Update'])
      .eq('id', updateId);
    if (error) throw error;
  }

  async claimQueued(updateId: string) {
    const { data, error } = await this.db
      .from('patron_updates')
      .update({ status: 'drafting' })
      .eq('id', updateId)
      .eq('status', 'queued')
      .select('id');
    if (error) throw error;
    return (data ?? []).length === 1;
  }

  async listDueQueued(now: Date) {
    const { data, error } = await this.db
      .from('patron_updates')
      .select('*')
      .eq('status', 'queued')
      .lte('due_at', now.toISOString())
      .limit(25);
    if (error) throw error;
    return (data ?? []).map(toRecord);
  }

  async listDueScheduled(now: Date) {
    const { data, error } = await this.db
      .from('patron_updates')
      .select('*')
      .eq('status', 'scheduled')
      .lte('send_at', now.toISOString())
      .limit(25);
    if (error) throw error;
    return (data ?? []).map(toRecord);
  }

  async getNote(noteId: string) {
    const { data, error } = await this.db.from('notes').select('*').eq('id', noteId).maybeSingle();
    if (error) throw error;
    return data && !data.deleted_at ? toNote(data) : null;
  }

  async listNotesBefore(playerId: string, beforeIso: string, limit: number) {
    const { data, error } = await this.db
      .from('notes')
      .select('*')
      .eq('player_id', playerId)
      .eq('status', 'saved')
      .is('deleted_at', null)
      .lt('recorded_at', beforeIso)
      .order('recorded_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(toNote);
  }

  async listTiers(playerId: string) {
    const [{ data: tiers, error: tErr }, { data: patrons, error: pErr }] = await Promise.all([
      this.db
        .from('patron_tiers')
        .select('id, position, name')
        .eq('player_id', playerId)
        .order('position'),
      this.db.from('patrons').select('tier_id').eq('player_id', playerId).in('status', RECEIVING),
    ]);
    if (tErr) throw tErr;
    if (pErr) throw pErr;
    return (tiers ?? []).map((t) => ({
      id: t.id,
      position: t.position,
      name: t.name,
      activeCount: (patrons ?? []).filter((p) => p.tier_id === t.id).length,
    }));
  }

  async sendStats(updateIds: readonly string[]) {
    if (updateIds.length === 0) return [];
    const { data, error } = await this.db
      .from('patron_update_sends')
      .select('update_id, status, opened_at')
      .in('update_id', [...updateIds]);
    if (error) throw error;
    return updateIds.map((id) => {
      const rows = (data ?? []).filter((r) => r.update_id === id && r.status === 'sent');
      return {
        updateId: id,
        delivered: rows.length,
        opened: rows.filter((r) => r.opened_at).length,
      };
    });
  }

  async listPatronStarts(playerId: string) {
    const { data, error } = await this.db.from('patrons').select('since').eq('player_id', playerId);
    if (error) throw error;
    return (data ?? []).map((p) => p.since);
  }

  async nextDeadline(playerId: string, now: Date) {
    const { data, error } = await this.db
      .from('entry_decisions')
      .select('status, tournaments!inner(name, entry_deadline)')
      .eq('player_id', playerId)
      .in('status', ['none', 'entered']);
    if (error) throw error;
    const upcoming = (data ?? [])
      .map((d) => d.tournaments as unknown as { name: string; entry_deadline: string | null })
      .filter((t) => t.entry_deadline && new Date(t.entry_deadline).getTime() > now.getTime())
      .sort((a, b) => a.entry_deadline!.localeCompare(b.entry_deadline!));
    const first = upcoming[0];
    return first ? { tournamentName: first.name, deadlineAt: first.entry_deadline! } : null;
  }

  async insertNotification(input: Parameters<ContentStore['insertNotification']>[0]) {
    const { error } = await this.db.from('notifications').insert({
      player_id: input.playerId,
      agent: 'content',
      category: input.category,
      title: input.title,
      body: input.body,
      action_href: input.actionHref,
    });
    if (error) throw error;
  }

  async listSendsToPoll(now: Date, limit: number) {
    const since = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const staleBefore = new Date(now.getTime() - 55 * 60 * 1000).toISOString();
    const { data, error } = await this.db
      .from('patron_update_sends')
      .select('id, email_id, patron_id, last_checked_at')
      .eq('status', 'sent')
      .is('opened_at', null)
      .not('email_id', 'is', null)
      .gte('sent_at', since)
      .or(`last_checked_at.is.null,last_checked_at.lt.${staleBefore}`)
      .order('sent_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => ({ id: r.id, emailId: r.email_id!, patronId: r.patron_id }));
  }

  async recordSendEvent(
    sendId: string,
    lastEvent: string | null,
    openedAt: string | null,
    checkedAt: string,
  ) {
    const { error } = await this.db
      .from('patron_update_sends')
      .update({
        last_event: lastEvent,
        last_checked_at: checkedAt,
        ...(openedAt ? { opened_at: openedAt } : {}),
      })
      .eq('id', sendId);
    if (error) throw error;
  }

  async refreshPatronOpens(patronIds: readonly string[]) {
    for (const patronId of new Set(patronIds)) {
      const { data, error } = await this.db
        .from('patron_update_sends')
        .select('status, opened_at, sent_at')
        .eq('patron_id', patronId)
        .order('sent_at', { ascending: false })
        .limit(6);
      if (error) throw error;
      const opens = (data ?? [])
        .reverse()
        .map((s) => (s.status !== 'sent' ? null : s.opened_at ? 1 : 0));
      const { error: uErr } = await this.db.from('patrons').update({ opens }).eq('id', patronId);
      if (uErr) throw uErr;
    }
  }
}
