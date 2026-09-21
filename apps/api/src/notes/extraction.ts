import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { INITIAL_TAG_VOCABULARY, type Database, type Json, type NoteCtx } from '@procircuit/db';
import { recordRun, type AgentRunsDb } from '@procircuit/actions';
import {
  EXTRACTION_MODEL,
  EXTRACTION_PROMPT_VERSION,
  EXTRACTION_SCHEMA_VERSION,
  extractMatchNote,
  type ExtractionModelClient,
  type MatchScribeProposal,
} from '@procircuit/agents';

export interface ExtractionLogger {
  error(...args: unknown[]): void;
}

export interface ExtractionDeps {
  db: SupabaseClient<Database>;
  extractionClient: ExtractionModelClient;
  agentRuns: AgentRunsDb;
  logger?: ExtractionLogger | undefined;
}

function inputsHash(input: {
  ctx: NoteCtx;
  transcript: string;
  tagVocabulary: readonly string[];
}): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

// The player's own tag vocabulary (PRD-02 S-10): the starter set plus every
// tag they have used on any of their own notes so far. There is no separate
// vocabulary table yet — packages/db/src/notes.ts's search already treats
// "tags the player has used" as the extension point beyond the starter set,
// so this reads the same way.
export async function collectTagVocabulary(
  db: SupabaseClient<Database>,
  playerId: string,
): Promise<string[]> {
  const { data, error } = await db
    .from('notes')
    .select('tags')
    .eq('player_id', playerId)
    .neq('status', 'deleted');
  if (error) throw error;

  const vocabulary = new Set<string>(INITIAL_TAG_VOCABULARY);
  for (const row of data ?? []) {
    const tags = Array.isArray(row.tags) ? (row.tags as string[]) : [];
    for (const tag of tags) vocabulary.add(tag);
  }
  return [...vocabulary];
}

function extractionColumn(
  model: string,
  promptVersion: string,
  schemaVersion: string,
  valid: boolean,
) {
  return { model, promptVersion, schemaVersion, valid } satisfies Record<string, Json>;
}

// The match-scribe/extract agent (build plan step 1.2), run right after a
// note's transcript is confirmed. Never re-transcribes: this only reads the
// already-durable transcript, so it is safe to call again from retryNote
// (S-19) without touching audio or spending another Whisper call.
export async function runExtraction(deps: ExtractionDeps, noteId: string): Promise<void> {
  const logger = deps.logger ?? console;
  const { data: note, error } = await deps.db.from('notes').select('*').eq('id', noteId).single();
  if (error) throw error;
  if (!note.transcript) throw new Error(`Note ${noteId} has no transcript to extract from`);

  const ctx = note.ctx as NoteCtx;
  const tagVocabulary = await collectTagVocabulary(deps.db, note.player_id);
  const input = { ctx, transcript: note.transcript, tagVocabulary };

  try {
    const { output } = await recordRun(
      deps.agentRuns,
      {
        agentName: 'match-scribe-extract',
        playerId: note.player_id,
        triggerType: 'event',
        inputsHash: inputsHash(input),
        model: EXTRACTION_MODEL,
        promptVersion: EXTRACTION_PROMPT_VERSION,
        schemaVersion: EXTRACTION_SCHEMA_VERSION,
      },
      async () => {
        const result = await extractMatchNote(deps.extractionClient, input);
        return { output: result.output as unknown as Json, usage: result.usage };
      },
    );

    const proposal = output as unknown as MatchScribeProposal;
    const { error: updateError } = await deps.db
      .from('notes')
      .update({
        result: proposal.result,
        opponent: proposal.opponent,
        round: proposal.round,
        surface: proposal.surface,
        tags: proposal.tags,
        mood: proposal.mood,
        summary: proposal.summary,
        extraction: extractionColumn(
          EXTRACTION_MODEL,
          EXTRACTION_PROMPT_VERSION,
          EXTRACTION_SCHEMA_VERSION,
          true,
        ),
        status: 'review',
      })
      .eq('id', noteId);
    if (updateError) throw updateError;
  } catch (err) {
    // PRD-02 S-7: "a payload that fails validation is rejected and logged,
    // and the note is saved with transcript and context only" — the same
    // fallback covers a non-validation (infra) failure here, since either
    // way the player still needs a note they can fill in and save (S-19).
    // Deliberately never rethrown: this runs both right after a successful
    // transcription (where a throw would misreport as a *transcription*
    // failure to the note-transcribe job's own log line) and from a
    // player-initiated retry — in both cases the note row above is already
    // the correct, complete outcome, and this log line is the failure's
    // record.
    logger.error(`[note-extract] failed for note ${noteId}:`, err);
    await deps.db
      .from('notes')
      .update({
        status: 'failed_extraction',
        extraction: extractionColumn(
          EXTRACTION_MODEL,
          EXTRACTION_PROMPT_VERSION,
          EXTRACTION_SCHEMA_VERSION,
          false,
        ),
      })
      .eq('id', noteId);
  }
}
