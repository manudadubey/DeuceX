import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  FREE_TIER_MONTHLY_NOTE_LIMIT,
  type Database,
  type Json,
  type Note,
  type NoteCtx,
} from '@deucex/db';
import type { AgentRunsDb } from '@deucex/actions';
import type { ExtractionModelClient } from '@deucex/agents';
import type { StorageAdapter } from '../storage/adapter';
import type { TranscriptionAdapter } from '../transcription/adapter';
import { computeNoteStamp } from '../conditions/stamp';
import type { WeatherAdapter } from '../conditions/adapter';
import { runExtraction, type ExtractionLogger } from './extraction';

export class QuotaExceededError extends Error {
  constructor() {
    super('Free-tier monthly note quota reached');
  }
}

export class NoteNotFoundError extends Error {
  constructor(noteId: string) {
    super(`No note ${noteId} for this player`);
  }
}

export class InvalidNoteStateError extends Error {}

// A player is on the Free tier's quota (S-16) unless their tier is
// explicitly pro or elite. `players.tier` has no CHECK constraint yet
// (deferred to the billing step, per the step 0.2 migration's own design
// notes), so a null or unrecognised value is treated as Free rather than
// trusted as unlimited.
function isUnlimitedTier(tier: string | null): boolean {
  return tier === 'pro' || tier === 'elite';
}

export interface NotesServiceDeps {
  /** The service-role client: every write here is either audio/vendor-touching or a status transition apps/api owns. */
  db: SupabaseClient<Database>;
  storage: StorageAdapter;
  transcription: TranscriptionAdapter;
  /** The match-scribe/extract agent's model call (step 1.2) and its agent_runs sink. */
  extraction: ExtractionModelClient;
  agentRuns: AgentRunsDb;
  /** CE-11's condition stamp, attached at save time (step 3.3). */
  weatherAdapter: WeatherAdapter;
  enqueueTranscription: (noteId: string) => Promise<void>;
  enqueueExtraction: (noteId: string) => Promise<void>;
  /** Step 4.2: queues the Content Agent's draft (PRD-05 C-1). Best-effort, never fails a save. */
  onNoteSaved?: (input: { playerId: string; noteId: string }) => Promise<void>;
  /** Injected for tests; defaults to the real clock. */
  now?: () => Date;
  logger?: ExtractionLogger;
}

function clockNow(deps: Pick<NotesServiceDeps, 'now'>): Date {
  return deps.now ? deps.now() : new Date();
}

async function requireNote(
  db: SupabaseClient<Database>,
  noteId: string,
  playerId: string,
): Promise<Note> {
  const { data, error } = await db
    .from('notes')
    .select('*')
    .eq('id', noteId)
    .eq('player_id', playerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NoteNotFoundError(noteId);
  return data;
}

async function checkQuota(db: SupabaseClient<Database>, playerId: string): Promise<void> {
  const { data: player, error: playerError } = await db
    .from('players')
    .select('tier')
    .eq('id', playerId)
    .single();
  if (playerError) throw playerError;
  if (isUnlimitedTier(player.tier)) return;

  const { data: savedCount, error: countError } = await db.rpc('notes_saved_this_month_for', {
    p_player_id: playerId,
  });
  if (countError) throw countError;
  if ((savedCount ?? 0) >= FREE_TIER_MONTHLY_NOTE_LIMIT) {
    throw new QuotaExceededError();
  }
}

export interface CreateNoteInput {
  playerId: string;
  ctx: NoteCtx;
  recordedAt: string;
  durSeconds: number;
  audio: Buffer;
  audioContentType: string;
  languagePreference?: string | undefined;
  device?: string | null | undefined;
}

// Upload (S-1 to S-5, S-18): the note only gets a row once its audio is
// already durably in R2, so a note never exists half-uploaded. Quota is
// checked here, before the R2 call, both to avoid uploading audio that
// can never be saved and to give the player the locked-state refusal the
// recorder card shows (S-16, S-AC-11) rather than a silent later failure.
export async function createNote(deps: NotesServiceDeps, input: CreateNoteInput): Promise<Note> {
  await checkQuota(deps.db, input.playerId);

  const noteId = randomUUID();
  const key = `notes/${input.playerId}/${noteId}`;
  await deps.storage.upload({ key, body: input.audio, contentType: input.audioContentType });

  const now = clockNow(deps);
  const languageFromPreference =
    input.languagePreference && input.languagePreference !== 'auto'
      ? input.languagePreference
      : null;

  const { data, error } = await deps.db
    .from('notes')
    .insert({
      id: noteId,
      player_id: input.playerId,
      ctx: input.ctx,
      recorded_at: input.recordedAt,
      dur_seconds: Math.min(60, Math.max(0, Math.round(input.durSeconds))),
      audio_ref: key,
      audio_uploaded_at: now.toISOString(),
      status: 'transcribing',
      device: input.device ?? null,
      lang: languageFromPreference,
      lang_source: languageFromPreference ? 'preference' : null,
    })
    .select('*')
    .single();

  if (error) {
    await deps.storage.delete(key).catch(() => undefined);
    throw error;
  }

  await deps.enqueueTranscription(noteId);
  return data;
}

// The transcription queue job (S-4). S-19: failure leaves the note in
// `failed_transcription` with the audio untouched, so Retry can run again
// without losing it. Extraction (step 1.2, S-7, S-8) runs immediately after
// a successful transcription, in the same job: both have to finish before
// the note is fit to show as Review, and running extraction as a second
// queue hop would mean re-downloading nothing new while adding a window
// where the note briefly reads "review" with no proposals filled in yet
// (see runExtraction's own comment on why it never re-throws here).
export async function transcribeNote(deps: NotesServiceDeps, noteId: string): Promise<void> {
  const { data: note, error } = await deps.db.from('notes').select('*').eq('id', noteId).single();
  if (error) throw error;
  if (!note.audio_ref) throw new Error(`Note ${noteId} has no audio to transcribe`);

  try {
    const audio = await deps.storage.download(note.audio_ref);
    const languageOverride = note.lang_source === 'preference' && note.lang ? note.lang : undefined;

    const result = await deps.transcription.transcribe({
      audio,
      contentType: 'audio/webm',
      ...(languageOverride ? { languageOverride } : {}),
    });

    const { error: updateError } = await deps.db
      .from('notes')
      .update({
        transcript_raw: result.transcript,
        transcript: result.transcript,
        lang: result.language,
        lang_conf: result.confidence,
        lang_source: note.lang_source ?? 'whisper',
        transcription: { model: result.model, cost: result.costUsd },
      })
      .eq('id', noteId);
    if (updateError) throw updateError;
  } catch (err) {
    await deps.db.from('notes').update({ status: 'failed_transcription' }).eq('id', noteId);
    throw err;
  }

  await runExtraction(
    {
      db: deps.db,
      extractionClient: deps.extraction,
      agentRuns: deps.agentRuns,
      logger: deps.logger,
    },
    noteId,
  );
}

export interface RetryTranscriptionInput {
  noteId: string;
  playerId: string;
}

// A single Retry action (S-19) covering both of Match Scribe's distinct
// failure states: re-enqueues transcription for `failed_transcription`
// (which itself re-runs extraction on success, above), or re-runs
// extraction alone for `failed_extraction` — the transcript is already
// durable, so there is nothing to re-download or re-transcribe.
export async function retryNote(
  deps: NotesServiceDeps,
  input: RetryTranscriptionInput,
): Promise<void> {
  const note = await requireNote(deps.db, input.noteId, input.playerId);

  if (note.status === 'failed_transcription') {
    await deps.db.from('notes').update({ status: 'transcribing' }).eq('id', input.noteId);
    await deps.enqueueTranscription(input.noteId);
    return;
  }

  if (note.status === 'failed_extraction') {
    await deps.db.from('notes').update({ status: 'transcribing' }).eq('id', input.noteId);
    await deps.enqueueExtraction(input.noteId);
    return;
  }

  throw new InvalidNoteStateError(`Cannot retry a note in status ${note.status}`);
}

export interface SaveNoteInput {
  noteId: string;
  playerId: string;
}

// Save (S-12, S-13, S-AC-6, S-AC-7): the transition to 'saved' is what
// "confirms" the transcript (section 7: a saved note, edited or not, counts
// as confirmed), which immediately deletes the audio — the sweep in
// audio-lifecycle.ts is only the 7-day backstop for notes that never reach
// this state. Quota is re-checked here too (belt and braces against a race
// with another tab's save landing between this note's upload and its save).
// failed_transcription is savable too: per the PRD's failure behaviour "the
// player can type the note instead," so a note whose Whisper call failed
// still reaches the review screen (with an empty transcript and Retry) and
// can be saved once the player has typed it by hand.
const SAVABLE_STATUSES = new Set(['review', 'failed_extraction', 'failed_transcription']);

export async function saveNote(deps: NotesServiceDeps, input: SaveNoteInput): Promise<Note> {
  const note = await requireNote(deps.db, input.noteId, input.playerId);
  if (!SAVABLE_STATUSES.has(note.status)) {
    throw new InvalidNoteStateError(`Cannot save a note in status ${note.status}`);
  }

  await checkQuota(deps.db, input.playerId);

  const now = clockNow(deps);
  const { error: updateError } = await deps.db
    .from('notes')
    .update({ status: 'saved', transcript_confirmed_at: now.toISOString() })
    .eq('id', input.noteId);
  if (updateError) throw updateError;

  if (note.audio_ref) {
    await deps.storage.delete(note.audio_ref).catch(() => undefined);
    await deps.db
      .from('notes')
      .update({
        audio_ref: null,
        audio_deleted_at: now.toISOString(),
        audio_delete_cause: 'confirmed',
      })
      .eq('id', input.noteId);
  }

  // PRD-08 CE-11/section 3: "at Match note save time to produce a stamp...
  // if a stamp cannot be produced at save the note saves without one and is
  // backfilled within 24 hours" — best-effort and never allowed to fail the
  // save itself, matching that failure behaviour exactly. Scoped to Match
  // notes (section 4.3's own "Match Scribe notes"), not Practice/Travel/Other.
  if (note.ctx === 'match') {
    try {
      const cond = await computeNoteStamp(
        { db: deps.db, weatherAdapter: deps.weatherAdapter },
        input.playerId,
        note.recorded_at,
      );
      if (cond) {
        await deps.db
          .from('notes')
          .update({ cond: cond as unknown as Json })
          .eq('id', input.noteId);
      }
    } catch (err) {
      deps.logger?.error(`[conditions] stamp failed for note ${input.noteId}:`, err);
    }
  }

  // PRD-05 C-1: a saved match note with a result queues a patron-update
  // draft. Best-effort like the stamp above: a failure here never fails the
  // save, and the player can still start a draft by hand.
  if (deps.onNoteSaved) {
    try {
      await deps.onNoteSaved({ playerId: input.playerId, noteId: input.noteId });
    } catch (err) {
      deps.logger?.error(`[content] queueing a draft failed for note ${input.noteId}:`, err);
    }
  }

  return requireNote(deps.db, input.noteId, input.playerId);
}

export interface DeleteNoteInput {
  noteId: string;
  playerId: string;
}

// Discard (never saved): nothing else depends on the note yet (S-16:
// "discarded ... notes do not count"), so it is a real row removal, audio
// included — the service role has the DELETE grant the player's own
// session was deliberately never given (see the step 1.1 migration).
async function discardNote(deps: NotesServiceDeps, note: Note): Promise<void> {
  if (note.audio_ref) {
    await deps.storage.delete(note.audio_ref).catch(() => undefined);
  }
  const { error } = await deps.db.from('notes').delete().eq('id', note.id);
  if (error) throw error;
}

// Delete (S-14, S-AC-9): a previously saved note is soft-deleted instead —
// audio_delete_cause needs the row to survive to carry 'player_delete', and
// every read path filters status = 'deleted' out, which is what "agents
// lose it too" requires (see the migration's design note for the full
// reasoning).
export async function deleteNote(deps: NotesServiceDeps, input: DeleteNoteInput): Promise<void> {
  const note = await requireNote(deps.db, input.noteId, input.playerId);

  if (note.status !== 'saved') {
    return discardNote(deps, note);
  }

  const now = clockNow(deps);
  if (note.audio_ref) {
    await deps.storage.delete(note.audio_ref).catch(() => undefined);
  }

  const { error } = await deps.db
    .from('notes')
    .update({
      status: 'deleted',
      deleted_at: now.toISOString(),
      transcript: null,
      transcript_raw: null,
      result: null,
      opponent: null,
      summary: null,
      cond: null,
      audio_ref: null,
      ...(note.audio_ref
        ? { audio_deleted_at: now.toISOString(), audio_delete_cause: 'player_delete' as const }
        : {}),
    })
    .eq('id', input.noteId);
  if (error) throw error;
}
