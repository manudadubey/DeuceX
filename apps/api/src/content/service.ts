import { createHash } from 'node:crypto';
import {
  AgentValidationError,
  recordRun,
  type AgentRunsDb,
  type ApprovalGateDb,
} from '@deucex/actions';
import type { EmailClient, EmailStatusClient } from '@deucex/actions/account';
import {
  publishUpdateNow,
  renderUpdateEmail,
  scheduleUpdate,
  sendScheduledUpdate,
  type ContentActionsDb,
} from '@deucex/actions/content';
import {
  applyFix,
  attributedUpdate,
  CONTENT_DRAFT_MODEL,
  CONTENT_DRAFT_PROMPT_VERSION,
  CONTENT_DRAFT_SCHEMA_VERSION,
  CONTENT_REWRITE_MODEL,
  CONTENT_REWRITE_PROMPT_VERSION,
  draftDueAt,
  generateContentDraft,
  localDate,
  pickVoiceExamples,
  proposeRecipients,
  rewriteContent,
  runChecks,
  sendTimeOptions,
  voiceProfileLine,
  warnKinds,
  wordCount,
  type CheckContext,
  type CheckKind,
  type ContentDraftInput,
  type ContentDraftModelClient,
  type DraftNote,
  type PastUpdate,
  type RewriteVariant,
  type SendTimeOption,
  type ValidatedDraft,
} from '@deucex/agents';
import type { Json } from '@deucex/db';
import type {
  BuiltFromItem,
  ContentNote,
  ContentPlayer,
  ContentStore,
  ContentTier,
  StoredCheck,
  UpdatePatch,
  UpdateRecord,
} from './store';

// PRD-05's Content Agent inside apps/api: the trigger on a saved match note,
// the drafting run, every editor operation, publish and schedule through
// packages/actions' gated content_publish, and the five-minute tick (due
// drafts, due scheduled sends, the Resend open poll). Nothing here sends a
// patron email except through publishUpdateNow / sendScheduledUpdate, which
// refuse without the player's approval row (M-GATE-1, C-18).

export interface ContentDeps {
  store: ContentStore;
  draftClient: ContentDraftModelClient;
  rewriteClient: ContentDraftModelClient;
  agentRuns: AgentRunsDb;
  email: EmailClient;
  /** Null when RESEND_API_KEY is unset: open rates stay blank. */
  statusClient: EmailStatusClient | null;
  gateDb: ApprovalGateDb;
  actionsDb: ContentActionsDb;
  appBaseUrl: string;
  now?: () => Date;
  logger?: { error(...args: unknown[]): void };
}

export class ContentPlanError extends Error {
  constructor() {
    super('The Content Agent is part of Pro');
    this.name = 'ContentPlanError';
  }
}

export class UpdateNotFound extends Error {
  constructor() {
    super('No such update');
    this.name = 'UpdateNotFound';
  }
}

export class UpdateStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpdateStateError';
  }
}

export class InvalidUpdateInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidUpdateInputError';
  }
}

const EDITABLE: readonly string[] = ['draft', 'send_failed'];

function clock(deps: ContentDeps): Date {
  return deps.now ? deps.now() : new Date();
}

export function isPaidPlan(tier: string | null): boolean {
  return tier === 'pro' || tier === 'elite';
}

function hashInputs(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function toDraftNote(n: ContentNote): DraftNote {
  return {
    id: n.id,
    ctx: n.ctx,
    recordedAt: n.recordedAt,
    transcript: n.transcript,
    result: n.result,
    opponent: n.opponent,
    round: n.round,
    surface: n.surface,
    mood: n.mood,
    tags: n.tags,
  };
}

async function requirePlayer(deps: ContentDeps, playerId: string): Promise<ContentPlayer> {
  const player = await deps.store.getPlayer(playerId);
  if (!player) throw new UpdateNotFound();
  return player;
}

async function requireUpdate(deps: ContentDeps, playerId: string, updateId: string) {
  const row = await deps.store.getUpdate(playerId, updateId);
  if (!row) throw new UpdateNotFound();
  return row;
}

// ---------------------------------------------------------------------------
// Past updates: voice examples, open rates, joins
// ---------------------------------------------------------------------------

async function pastUpdates(deps: ContentDeps, playerId: string): Promise<PastUpdate[]> {
  const published = (await deps.store.listUpdates(playerId, 100)).filter(
    (u) => u.status === 'published' && u.sentAt,
  );
  const stats = await deps.store.sendStats(published.map((u) => u.id));
  return published.map((u) => {
    const s = stats.find((x) => x.updateId === u.id);
    return {
      id: u.id,
      subject: u.subject,
      body: u.body,
      sentAt: u.sentAt!,
      // Section 7: blank until the first open event.
      openRate:
        s && s.delivered > 0 && s.opened > 0 ? Math.round((s.opened / s.delivered) * 100) : null,
    };
  });
}

async function checkContextFor(
  deps: ContentDeps,
  player: ContentPlayer,
  row: UpdateRecord,
  past?: PastUpdate[],
): Promise<CheckContext> {
  const all = past ?? (await pastUpdates(deps, player.id));
  const note = row.noteId ? await deps.store.getNote(row.noteId) : null;
  // A manual draft has no triggering note: it was built from the recent
  // notes, so the opponent check looks at the latest opponent among them
  // (found live in step 4.2: without this, a manual draft naming its
  // opponent read "No opponent named").
  const opponent =
    note?.opponent ??
    (row.noteId
      ? null
      : ((
          await deps.store.listNotesBefore(player.id, row.draftedAt ?? clock(deps).toISOString(), 3)
        ).find((n) => n.opponent)?.opponent ?? null));
  return {
    examples: pickVoiceExamples(all).map((u) => u.body),
    pastUpdates: all.map((u) => u.body),
    privateNames: player.privateNames,
    people: row.people,
    opponent,
  };
}

function checksFor(body: string, ctx: CheckContext, fixed: readonly CheckKind[]): StoredCheck[] {
  return runChecks(body, { ...ctx, fixedKinds: fixed }).map((c) => ({
    ...c,
    fixApplied: fixed.includes(c.kind) && c.state === 'pass',
  }));
}

function fixedKinds(row: UpdateRecord): CheckKind[] {
  return row.checks.filter((c) => c.fixApplied).map((c) => c.kind);
}

// ---------------------------------------------------------------------------
// Trigger (C-1): a saved match note with a result queues a draft
// ---------------------------------------------------------------------------

/**
 * Called from saveNote. Never throws into the save: the caller wraps it, the
 * same best-effort shape as the conditions stamp.
 */
export async function onNoteSaved(
  deps: ContentDeps,
  input: { playerId: string; noteId: string },
): Promise<void> {
  const note = await deps.store.getNote(input.noteId);
  if (!note || note.ctx !== 'match' || !note.result) return;
  const player = await deps.store.getPlayer(input.playerId);
  if (!player || !isPaidPlan(player.tier)) return; // C-AC-12: no drafts from a Free player's notes
  if (player.contentWindow === 'manual') return;
  if (await deps.store.isAgentPaused(player.id)) return;

  const now = clock(deps);
  const dueAt = draftDueAt(player.contentWindow, now, player.timezone)!;
  const open = await deps.store.getOpenDraft(player.id);
  if (open) {
    if (open.status === 'queued') {
      // Not drafted yet: the newer note simply replaces the older one.
      await deps.store.patchUpdate(open.id, { noteId: note.id, dueAt: dueAt.toISOString() });
    } else {
      // Section 3: one open draft at a time; offer "Rebuild from the new note".
      await deps.store.patchUpdate(open.id, { rebuildNoteId: note.id });
    }
    return;
  }
  try {
    await deps.store.insertUpdate({
      playerId: player.id,
      trigger: 'note',
      noteId: note.id,
      status: 'queued',
      dueAt: dueAt.toISOString(),
      lang: player.patronLanguage,
    });
  } catch (err) {
    // C-15: never a second draft from the same note (unique index).
    if ((err as { code?: string }).code === '23505') return;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// The drafting run
// ---------------------------------------------------------------------------

function noteLabel(note: ContentNote, timeZone: string): string {
  const at = new Date(note.recordedAt);
  const day = new Intl.DateTimeFormat('en-AU', { weekday: 'short', timeZone }).format(at);
  const time = new Intl.DateTimeFormat('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(at);
  const m = Math.floor(note.durSeconds / 60);
  const s = String(note.durSeconds % 60).padStart(2, '0');
  return `Match Scribe · ${day} ${time} · ${m}:${s}`;
}

function builtFrom(
  note: ContentNote | null,
  earlier: ContentNote[],
  examples: PastUpdate[],
  timeZone: string,
): BuiltFromItem[] {
  const items: BuiltFromItem[] = [];
  if (note) {
    items.push({ kind: 'note', label: noteLabel(note, timeZone), ref: note.id });
    if (note.result) {
      items.push({
        kind: 'result',
        label: `Result · ${note.result}${note.opponent ? ` vs ${note.opponent}` : ''}`,
        ref: null,
      });
    }
  } else if (earlier.length) {
    items.push({
      kind: 'notes',
      label: `${earlier.length} recent ${earlier.length === 1 ? 'note' : 'notes'}`,
      ref: null,
    });
  }
  for (const e of examples) {
    items.push({
      kind: 'voice',
      label: `Voice · "${e.subject}" · ${e.openRate === null ? 'no opens yet' : `${e.openRate}%`}`,
      ref: e.id,
    });
  }
  if (note?.mood) items.push({ kind: 'mood', label: `Mood · ${note.mood}`, ref: null });
  return items;
}

/** "last night's note", "today's note", "your Tuesday note", or "your recent notes". */
export function notePhrase(note: ContentNote | null, now: Date, timeZone: string): string {
  if (!note) return 'your recent notes';
  const a = localDate(new Date(note.recordedAt), timeZone);
  const b = localDate(now, timeZone);
  const days = Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000,
  );
  if (days <= 0) return "today's note";
  if (days === 1) return "last night's note";
  const weekday = new Intl.DateTimeFormat('en-AU', { weekday: 'long', timeZone }).format(
    new Date(note.recordedAt),
  );
  return `your ${weekday} note`;
}

function tierNames(tiers: readonly ContentTier[], ids: readonly string[]): string {
  const chosen = tiers.filter((t) => ids.includes(t.id)).sort((a, b) => a.position - b.position);
  return chosen.length ? chosen.map((t) => t.name).join(' + ') : 'No tiers selected yet';
}

/** Notes a published update was drafted from, so a new draft doesn't retell them. */
async function coveredNotes(deps: ContentDeps, playerId: string): Promise<string[]> {
  return (await deps.store.listUpdates(playerId, 100))
    .filter((u) => u.status === 'published' && u.noteId)
    .map((u) => u.noteId!);
}

/** Drafts one claimed (status drafting) row. One For-you notification per run (C-17). */
export async function runDraft(deps: ContentDeps, row: UpdateRecord): Promise<UpdateRecord> {
  const player = await requirePlayer(deps, row.playerId);
  const now = clock(deps);
  const tiers = await deps.store.listTiers(player.id);
  const note = row.noteId ? await deps.store.getNote(row.noteId) : null;
  const earlier = await deps.store.listNotesBefore(
    player.id,
    note ? note.recordedAt : now.toISOString(),
    note ? 2 : 3,
  );
  const past = await pastUpdates(deps, player.id);
  const examples = pickVoiceExamples(past);
  const deadline = await deps.store.nextDeadline(player.id, now);
  const wantsPracticeSection = tiers.some((t) => t.position >= 2 && t.activeCount > 0);

  const input: ContentDraftInput = {
    lang: row.lang,
    playerFirstName: player.name.trim().split(/\s+/)[0] ?? player.name,
    note: note ? toDraftNote(note) : null,
    earlierNotes: earlier.map(toDraftNote),
    examples: examples.map((e) => ({ subject: e.subject, body: e.body })),
    wantsPracticeSection,
    privateNames: player.privateNames,
    nextDeadline: deadline
      ? `${deadline.tournamentName}, ${deadline.deadlineAt.slice(0, 10)}`
      : null,
    coveredNoteIds: await coveredNotes(deps, player.id),
  };
  const from = builtFrom(note, note ? [] : earlier, examples, player.timezone);
  const phrase = notePhrase(note, now, player.timezone);

  let draft = null as ValidatedDraft | null;
  try {
    await recordRun(
      deps.agentRuns,
      {
        agentName: 'content',
        playerId: player.id,
        triggerType: row.trigger === 'note' ? 'event' : 'manual',
        inputsHash: hashInputs(input),
        model: CONTENT_DRAFT_MODEL,
        promptVersion: CONTENT_DRAFT_PROMPT_VERSION,
        schemaVersion: CONTENT_DRAFT_SCHEMA_VERSION,
      },
      async () => {
        const result = await generateContentDraft(deps.draftClient, input);
        draft = result.draft;
        return { output: result.draft as unknown as Json, usage: result.usage };
      },
    );
  } catch (err) {
    deps.logger?.error(`[content] draft failed for update ${row.id}:`, err);
  }

  const proposal = proposeRecipients(tiers, Boolean(draft?.practiceSection));
  const tierIds = proposal.filter((p) => p.selected).map((p) => p.tierId);
  const tierReasons = Object.fromEntries(proposal.map((p) => [p.tierId, p.reason]));

  if (!draft) {
    // C-AC-11 / section 3: the editor opens empty as "Write it yourself".
    const patch: UpdatePatch = {
      status: 'draft',
      draftFailed: true,
      subject: 'Write it yourself',
      altSubjects: [],
      body: '',
      practiceSection: null,
      generatedSubject: null,
      generatedBody: null,
      draftedAt: now.toISOString(),
      builtFrom: from,
      people: [],
      tierIds,
      tierReasons,
      checks: [],
      sendAt: null,
      teaser: true,
    };
    await deps.store.patchUpdate(row.id, patch);
    await deps.store.insertNotification({
      playerId: player.id,
      category: 'for_you',
      title: 'Draft needs you',
      body: `The agent couldn't draft this one from ${phrase}. Your note and result are attached, and nothing goes out until you approve.`,
      actionHref: '/agent/content',
    });
    return { ...row, ...patch } as UpdateRecord;
  }

  const d = draft;
  const withPeople: UpdateRecord = { ...row, people: d.people };
  const ctx = await checkContextFor(deps, player, withPeople, past);
  const patch: UpdatePatch = {
    status: 'draft',
    draftFailed: false,
    subject: d.subject,
    altSubjects: d.altSubjects,
    body: d.body,
    practiceSection: d.practiceSection,
    generatedSubject: d.subject,
    generatedBody: d.body,
    draftedAt: now.toISOString(),
    builtFrom: from,
    people: d.people,
    tierIds,
    tierReasons,
    checks: checksFor(d.body, ctx, []),
    sendAt: null,
    teaser: true,
  };
  await deps.store.patchUpdate(row.id, patch);
  await deps.store.insertNotification({
    playerId: player.id,
    category: 'for_you',
    title: `Draft ready: "${d.subject}"`,
    body: `${wordCount(d.body)} words from ${phrase}. ${tierNames(tiers, tierIds)}. Nothing goes out until you approve.`,
    actionHref: '/agent/content',
  });
  return { ...row, ...patch } as UpdateRecord;
}

/** C-20 / New update: a blank draft from the last three notes, drafted now. */
export async function startManualDraft(deps: ContentDeps, playerId: string): Promise<UpdateRecord> {
  const player = await requirePlayer(deps, playerId);
  if (!isPaidPlan(player.tier)) throw new ContentPlanError();
  const open = await deps.store.getOpenDraft(playerId);
  if (open && open.status !== 'queued') {
    throw new UpdateStateError('Finish, skip or rebuild the open draft first');
  }
  let row = open;
  if (!row) {
    row = await deps.store.insertUpdate({
      playerId,
      trigger: 'manual',
      noteId: null,
      status: 'queued',
      dueAt: clock(deps).toISOString(),
      lang: player.patronLanguage,
    });
  }
  if (!(await deps.store.claimQueued(row.id))) throw new UpdateStateError('Already drafting');
  return runDraft(deps, { ...row, status: 'drafting' });
}

/** "Rebuild from the new note" (section 3): the open draft is superseded by one from the newer note. */
export async function rebuildFromNewNote(
  deps: ContentDeps,
  playerId: string,
  updateId: string,
): Promise<UpdateRecord> {
  const player = await requirePlayer(deps, playerId);
  if (!isPaidPlan(player.tier)) throw new ContentPlanError();
  const row = await requireUpdate(deps, playerId, updateId);
  if (row.status !== 'draft' || !row.rebuildNoteId) {
    throw new UpdateStateError('There is no newer note to rebuild from');
  }
  await deps.store.patchUpdate(row.id, { status: 'superseded' });
  const next = await deps.store.insertUpdate({
    playerId,
    trigger: 'rebuild',
    noteId: row.rebuildNoteId,
    status: 'queued',
    dueAt: clock(deps).toISOString(),
    lang: player.patronLanguage,
  });
  await deps.store.claimQueued(next.id);
  return runDraft(deps, { ...next, status: 'drafting' });
}

// ---------------------------------------------------------------------------
// Editor operations (C-5, C-6, C-8, C-10, C-12, C-13, C-15)
// ---------------------------------------------------------------------------

async function editable(deps: ContentDeps, playerId: string, updateId: string) {
  const player = await requirePlayer(deps, playerId);
  if (!isPaidPlan(player.tier)) throw new ContentPlanError(); // M-TIER-2: open drafts can't be published after a downgrade
  const row = await requireUpdate(deps, playerId, updateId);
  if (!EDITABLE.includes(row.status)) {
    throw new UpdateStateError(
      `This update is ${row.status.replace('_', ' ')} and can't be edited`,
    );
  }
  return { player, row };
}

export interface DraftEdit {
  subject?: string;
  altSubjects?: string[];
  body?: string;
  practiceSection?: string | null;
  tierIds?: string[];
  sendAt?: string | null;
  teaser?: boolean;
}

export async function saveDraft(
  deps: ContentDeps,
  playerId: string,
  updateId: string,
  edit: DraftEdit,
): Promise<UpdateRecord> {
  const { player, row } = await editable(deps, playerId, updateId);
  const patch: UpdatePatch = {};
  if (edit.subject !== undefined) {
    if (edit.subject.length > 120) throw new InvalidUpdateInputError('Subject is too long');
    patch.subject = edit.subject;
  }
  if (edit.altSubjects !== undefined) patch.altSubjects = edit.altSubjects.slice(0, 2);
  if (edit.body !== undefined) {
    if (edit.body.length > 20_000) throw new InvalidUpdateInputError('Update is too long');
    patch.body = edit.body;
  }
  if (edit.practiceSection !== undefined) patch.practiceSection = edit.practiceSection || null;
  if (edit.tierIds !== undefined) {
    const known = new Set((await deps.store.listTiers(playerId)).map((t) => t.id));
    if (edit.tierIds.some((id) => !known.has(id)))
      throw new InvalidUpdateInputError('Unknown tier');
    patch.tierIds = [...new Set(edit.tierIds)];
  }
  if (edit.sendAt !== undefined) {
    if (edit.sendAt !== null && new Date(edit.sendAt).getTime() <= clock(deps).getTime()) {
      throw new InvalidUpdateInputError('That send time has already passed');
    }
    patch.sendAt = edit.sendAt;
  }
  if (edit.teaser !== undefined) patch.teaser = edit.teaser;
  if (patch.body !== undefined) {
    const ctx = await checkContextFor(deps, player, row);
    patch.checks = checksFor(patch.body, ctx, fixedKinds(row));
  }
  await deps.store.patchUpdate(row.id, patch);
  return { ...row, ...patch };
}

export async function fixCheck(
  deps: ContentDeps,
  playerId: string,
  updateId: string,
  kind: CheckKind,
): Promise<UpdateRecord> {
  const { player, row } = await editable(deps, playerId, updateId);
  const ctx = await checkContextFor(deps, player, row);
  const body = applyFix(kind, row.body, ctx);
  const checks = checksFor(body, ctx, [...new Set([...fixedKinds(row), kind])]);
  await deps.store.patchUpdate(row.id, { body, checks });
  return { ...row, body, checks };
}

export async function rewriteDraft(
  deps: ContentDeps,
  playerId: string,
  updateId: string,
  variant: RewriteVariant,
): Promise<UpdateRecord> {
  const { player, row } = await editable(deps, playerId, updateId);
  if (!row.body.trim()) throw new InvalidUpdateInputError('There is nothing to rewrite yet');
  const note = row.noteId ? await deps.store.getNote(row.noteId) : null;
  let body = '';
  await recordRun(
    deps.agentRuns,
    {
      agentName: 'content',
      playerId,
      triggerType: 'manual',
      inputsHash: hashInputs({ variant, body: row.body }),
      model: CONTENT_REWRITE_MODEL,
      promptVersion: CONTENT_REWRITE_PROMPT_VERSION,
      schemaVersion: CONTENT_DRAFT_SCHEMA_VERSION,
    },
    async () => {
      const result = await rewriteContent(deps.rewriteClient, {
        variant,
        lang: row.lang,
        body: row.body,
        result: note?.result ?? null,
      });
      body = result.body;
      return { output: { variant, body } as Json, usage: result.usage };
    },
  );
  const ctx = await checkContextFor(deps, player, row);
  const checks = checksFor(body, ctx, fixedKinds(row));
  await deps.store.patchUpdate(row.id, { body, checks });
  return { ...row, body, checks };
}

export async function restoreOriginal(
  deps: ContentDeps,
  playerId: string,
  updateId: string,
): Promise<UpdateRecord> {
  const { player, row } = await editable(deps, playerId, updateId);
  if (row.generatedBody === null)
    throw new UpdateStateError('There is no generated text to restore');
  const ctx = await checkContextFor(deps, player, row);
  const patch: UpdatePatch = {
    body: row.generatedBody,
    subject: row.generatedSubject ?? row.subject,
    checks: checksFor(row.generatedBody, ctx, []),
  };
  await deps.store.patchUpdate(row.id, patch);
  return { ...row, ...patch };
}

export const SKIP_REASONS = ['nothing to say yet', 'too soon', "I'll write it myself"] as const;

export async function skipDraft(
  deps: ContentDeps,
  playerId: string,
  updateId: string,
  reason: string,
): Promise<UpdateRecord> {
  const row = await requireUpdate(deps, playerId, updateId);
  if (row.status !== 'draft') throw new UpdateStateError('Only an open draft can be skipped');
  const trimmed = reason.trim();
  if (!trimmed) throw new InvalidUpdateInputError('Skipping needs a reason'); // C-15
  const patch: UpdatePatch = {
    status: 'skipped',
    skipReason: trimmed.slice(0, 200),
    skippedAt: clock(deps).toISOString(),
  };
  await deps.store.patchUpdate(row.id, patch);
  return { ...row, ...patch };
}

/** C-15: Undo restores the draft until the next trigger. */
export async function undoSkip(
  deps: ContentDeps,
  playerId: string,
  updateId: string,
): Promise<UpdateRecord> {
  const row = await requireUpdate(deps, playerId, updateId);
  if (row.status !== 'skipped') throw new UpdateStateError('This update was not skipped');
  const open = await deps.store.getOpenDraft(playerId);
  if (open) throw new UpdateStateError('A newer draft has arrived since you skipped this one');
  const patch: UpdatePatch = { status: 'draft', skipReason: null, skippedAt: null };
  await deps.store.patchUpdate(row.id, patch);
  return { ...row, ...patch };
}

// ---------------------------------------------------------------------------
// Publish, schedule, cancel, teaser, preview (C-12, C-13, C-14, C-19)
// ---------------------------------------------------------------------------

export async function publishDraft(
  deps: ContentDeps,
  playerId: string,
  updateId: string,
  approvalId: string,
): Promise<UpdateRecord> {
  const { row } = await editable(deps, playerId, updateId);
  if (row.tierIds.length === 0) throw new InvalidUpdateInputError('No one selected'); // C-8
  if (!row.body.trim() || !row.subject.trim()) {
    throw new InvalidUpdateInputError('The update needs a subject and some text');
  }
  // C-11: a warn never blocks publishing; publishing over one records an override.
  const overrides = warnKinds(row.checks);
  if (row.sendAt) {
    await scheduleUpdate(deps.gateDb, deps.actionsDb, {
      approvalId,
      playerId,
      updateId,
      now: clock(deps),
    });
  } else {
    const result = await publishUpdateNow(deps.gateDb, deps.actionsDb, deps.email, {
      approvalId,
      playerId,
      updateId,
      appBaseUrl: deps.appBaseUrl,
    });
    await deps.store.insertNotification({
      playerId,
      category: 'fyi',
      title:
        result.deliveredCount > 0
          ? `Sent to ${result.deliveredCount} ${result.deliveredCount === 1 ? 'patron' : 'patrons'}`
          : 'Send failed',
      body:
        result.deliveredCount > 0
          ? `"${row.subject}" went out through your patron emails.`
          : 'Nothing reached patrons. Try again or download the text.',
      actionHref: '/agent/content',
    });
  }
  await deps.store.patchUpdate(row.id, { overrides });
  return requireUpdate(deps, playerId, updateId);
}

export async function cancelSchedule(
  deps: ContentDeps,
  playerId: string,
  updateId: string,
): Promise<UpdateRecord> {
  const row = await requireUpdate(deps, playerId, updateId);
  if (row.status !== 'scheduled') throw new UpdateStateError('This update is not scheduled');
  const open = await deps.store.getOpenDraft(playerId);
  if (open) throw new UpdateStateError('Finish or skip the newer draft before reopening this one');
  const patch: UpdatePatch = { status: 'draft', approvalId: null };
  await deps.store.patchUpdate(row.id, patch);
  return { ...row, ...patch };
}

/** C-13: the teaser can be removed at any time without touching the sent email. */
export async function removeTeaser(
  deps: ContentDeps,
  playerId: string,
  updateId: string,
): Promise<UpdateRecord> {
  const row = await requireUpdate(deps, playerId, updateId);
  if (row.status !== 'published')
    throw new UpdateStateError('Only a published update has a teaser');
  const patch: UpdatePatch = { teaserRemovedAt: clock(deps).toISOString() };
  await deps.store.patchUpdate(row.id, patch);
  return { ...row, ...patch };
}

/** C-19: the current version to the player's own address, labelled Preview; never a publish. */
export async function sendPreview(
  deps: ContentDeps,
  playerId: string,
  updateId: string,
): Promise<{ to: string }> {
  const player = await requirePlayer(deps, playerId);
  const row = await requireUpdate(deps, playerId, updateId);
  if (!row.body.trim()) throw new InvalidUpdateInputError('There is nothing to preview yet');
  await deps.email.sendEmail({
    to: player.email,
    fromName: player.name,
    subject: `Preview: ${row.subject}`,
    html: `<p style="color:#666;font-size:13px">Preview · this is how Locker Room patrons will see it. Nothing was sent to patrons.</p>\n${renderUpdateEmail(
      {
        body: row.body,
        practiceSection: row.practiceSection,
        tierPosition: 3,
        playerName: player.name,
        manageUrl: null,
      },
    )}`,
  });
  return { to: player.email };
}

// ---------------------------------------------------------------------------
// The five-minute tick
// ---------------------------------------------------------------------------

export async function runDueDrafts(deps: ContentDeps): Promise<number> {
  let drafted = 0;
  for (const row of await deps.store.listDueQueued(clock(deps))) {
    try {
      if (!(await deps.store.claimQueued(row.id))) continue;
      await runDraft(deps, { ...row, status: 'drafting' });
      drafted += 1;
    } catch (err) {
      deps.logger?.error(`[content] draft run failed for ${row.id}:`, err);
    }
  }
  return drafted;
}

export async function sendDueScheduled(deps: ContentDeps): Promise<number> {
  let sent = 0;
  for (const row of await deps.store.listDueScheduled(clock(deps))) {
    try {
      const result = await sendScheduledUpdate(deps.gateDb, deps.actionsDb, deps.email, {
        playerId: row.playerId,
        updateId: row.id,
        appBaseUrl: deps.appBaseUrl,
      });
      const ok = Boolean(result && result.deliveredCount > 0);
      if (ok) sent += 1;
      await deps.store.insertNotification({
        playerId: row.playerId,
        category: 'fyi',
        title: ok ? 'Scheduled update sent' : 'Send failed',
        body: ok
          ? `"${row.subject}" went to ${result!.deliveredCount} ${result!.deliveredCount === 1 ? 'patron' : 'patrons'}.`
          : `"${row.subject}" didn't reach any patrons. Nothing was sent.`,
        actionHref: '/agent/content',
      });
    } catch (err) {
      deps.logger?.error(`[content] scheduled send failed for ${row.id}:`, err);
    }
  }
  return sent;
}

/** Owner decision (step 4.2): open events are polled from Resend. */
export async function pollOpens(deps: ContentDeps, limit = 100): Promise<number> {
  if (!deps.statusClient) return 0;
  const now = clock(deps);
  const sends = await deps.store.listSendsToPoll(now, limit);
  const touched: string[] = [];
  let opened = 0;
  for (const s of sends) {
    try {
      const event = await deps.statusClient.getLastEvent(s.emailId);
      const isOpen = event === 'opened' || event === 'clicked';
      await deps.store.recordSendEvent(
        s.id,
        event,
        isOpen ? now.toISOString() : null,
        now.toISOString(),
      );
      touched.push(s.patronId);
      if (isOpen) opened += 1;
    } catch (err) {
      deps.logger?.error(`[content] open poll failed for send ${s.id}:`, err);
    }
  }
  if (touched.length) await deps.store.refreshPatronOpens(touched);
  return opened;
}

export async function runContentTick(deps: ContentDeps): Promise<void> {
  await runDueDrafts(deps);
  await sendDueScheduled(deps);
  await pollOpens(deps);
}

// ---------------------------------------------------------------------------
// The page (#/agent/content)
// ---------------------------------------------------------------------------

export interface HistoryRow {
  id: string;
  subject: string;
  status: string;
  date: string;
  tiers: string;
  words: number;
  skipReason: string | null;
  recipientCount: number | null;
  deliveredCount: number | null;
  openRate: number | null;
  joins7d: number | null;
}

export interface ContentPageData {
  plan: 'free' | 'pro' | 'elite';
  paused: boolean;
  window: ContentPlayer['contentWindow'];
  timezone: string;
  current: UpdateRecord | null;
  tiers: ContentTier[];
  sendTimes: SendTimeOption[];
  voice: {
    line: string;
    examples: Array<{ id: string; subject: string; openRate: number | null }>;
  };
  checkContext: CheckContext;
  history: HistoryRow[];
}

export async function loadContentPage(
  deps: ContentDeps,
  playerId: string,
): Promise<ContentPageData> {
  const player = await requirePlayer(deps, playerId);
  const now = clock(deps);
  const [paused, tiers, updates, deadline, starts] = await Promise.all([
    deps.store.isAgentPaused(playerId),
    deps.store.listTiers(playerId),
    deps.store.listUpdates(playerId, 60),
    deps.store.nextDeadline(playerId, now),
    deps.store.listPatronStarts(playerId),
  ]);
  const past = await pastUpdates(deps, playerId);
  const examples = pickVoiceExamples(past);
  const current =
    updates.find((u) => ['queued', 'drafting', 'draft'].includes(u.status)) ?? updates[0] ?? null;
  const stats = await deps.store.sendStats(updates.map((u) => u.id));
  const published = past.map((p) => ({ id: p.id, title: p.subject, sentAt: p.sentAt }));

  const history: HistoryRow[] = updates
    .filter((u) => ['published', 'skipped', 'scheduled', 'send_failed'].includes(u.status))
    .map((u) => {
      const s = stats.find((x) => x.updateId === u.id);
      const joins =
        u.status === 'published'
          ? starts.filter((at) => attributedUpdate(published, at)?.id === u.id).length
          : null;
      return {
        id: u.id,
        subject: u.subject,
        status: u.status,
        date: u.sentAt ?? u.skippedAt ?? u.sendAt ?? u.createdAt,
        tiers: tierNames(tiers, u.tierIds),
        words: wordCount(u.body),
        skipReason: u.skipReason,
        recipientCount: u.recipientCount,
        deliveredCount: u.deliveredCount,
        openRate:
          s && s.delivered > 0 && s.opened > 0 ? Math.round((s.opened / s.delivered) * 100) : null,
        joins7d: joins,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    plan: player.tier === 'elite' ? 'elite' : player.tier === 'pro' ? 'pro' : 'free',
    paused,
    window: player.contentWindow,
    timezone: player.timezone,
    current,
    tiers,
    sendTimes: sendTimeOptions(now, player.timezone, deadline),
    voice: {
      line: voiceProfileLine(examples),
      examples: examples.map((e) => ({ id: e.id, subject: e.subject, openRate: e.openRate })),
    },
    checkContext: current
      ? await checkContextFor(deps, player, current, past)
      : {
          examples: examples.map((e) => e.body),
          pastUpdates: past.map((p) => p.body),
          privateNames: player.privateNames,
          people: [],
          opponent: null,
        },
    history,
  };
}

/** The public page's "Latest for patrons" (C-13), or null. */
export async function latestTeaser(
  deps: Pick<ContentDeps, 'store'>,
  playerId: string,
): Promise<{ text: string; sentAt: string } | null> {
  const player = await deps.store.getPlayer(playerId);
  if (!player?.profileTeaser) return null;
  const latest = (await deps.store.listUpdates(playerId, 20)).find(
    (u) => u.status === 'published' && u.sentAt,
  );
  if (!latest || !latest.teaser || latest.teaserRemovedAt) return null;
  const { teaserText } = await import('@deucex/agents');
  const text = teaserText(latest.body);
  return text ? { text, sentAt: latest.sentAt! } : null;
}

export { AgentValidationError };
