import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';
import type { AgentRunInsert, AgentRunsDb } from '@procircuit/actions';
import { createInvalidExtractionClient, createMockExtractionClient } from '@procircuit/agents';
import { FakeDb, makeNote } from '../test-support/fake-db';
import { collectTagVocabulary, runExtraction } from './extraction';

function asDb(fake: FakeDb): SupabaseClient<Database> {
  return fake as unknown as SupabaseClient<Database>;
}

function fakeAgentRunsDb() {
  const rows: AgentRunInsert[] = [];
  const db: AgentRunsDb = {
    async insertAgentRun(row) {
      rows.push(row);
    },
  };
  return { db, rows };
}

describe('collectTagVocabulary', () => {
  it('unions the starter vocabulary with tags the player has already used', async () => {
    const fake = new FakeDb({
      notes: [
        makeNote({ id: 'note-1', player_id: 'player-1', tags: ['Second serve', 'Doubles'] }),
        makeNote({ id: 'note-2', player_id: 'player-1', tags: ['Doubles'] }),
        makeNote({ id: 'note-3', player_id: 'someone-else', tags: ['Nutrition'] }),
      ],
    });

    const vocabulary = await collectTagVocabulary(asDb(fake), 'player-1');

    expect(vocabulary).toContain('Second serve'); // starter set
    expect(vocabulary).toContain('Doubles'); // player's own addition
    expect(vocabulary).not.toContain('Nutrition'); // another player's addition
  });

  it('excludes deleted notes', async () => {
    const fake = new FakeDb({
      notes: [makeNote({ player_id: 'player-1', status: 'deleted', tags: ['Ice bath'] })],
    });

    const vocabulary = await collectTagVocabulary(asDb(fake), 'player-1');

    expect(vocabulary).not.toContain('Ice bath');
  });
});

describe('runExtraction', () => {
  it('writes exactly one agent_runs row and merges the proposal onto the note on success', async () => {
    const fake = new FakeDb({
      notes: [makeNote({ status: 'transcribing', transcript: 'Lost in a breaker again.' })],
    });
    const { db: agentRuns, rows } = fakeAgentRunsDb();

    await runExtraction(
      { db: asDb(fake), extractionClient: createMockExtractionClient(), agentRuns },
      'note-1',
    );

    const [note] = fake.tables.notes!;
    expect(note!.status).toBe('review');
    expect(note!.result).toBe('L 6-4 3-6 6-7(5)');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ agentName: 'match-scribe-extract', status: 'succeeded' });
  });

  it('marks failed_extraction and still writes one failed_validation agent_runs row when the model never validates', async () => {
    const fake = new FakeDb({
      notes: [makeNote({ status: 'transcribing', transcript: 'A short note.' })],
    });
    const { db: agentRuns, rows } = fakeAgentRunsDb();

    await runExtraction(
      { db: asDb(fake), extractionClient: createInvalidExtractionClient(), agentRuns },
      'note-1',
    );

    const [note] = fake.tables.notes!;
    expect(note!.status).toBe('failed_extraction');
    expect(note!.extraction).toMatchObject({ valid: false });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      agentName: 'match-scribe-extract',
      status: 'failed_validation',
    });
  });

  it('never rethrows on failure (S-19: the note row is the outcome, not a queue retry)', async () => {
    const fake = new FakeDb({
      notes: [makeNote({ status: 'transcribing', transcript: 'A short note.' })],
    });
    const { db: agentRuns } = fakeAgentRunsDb();

    await expect(
      runExtraction(
        {
          db: asDb(fake),
          extractionClient: createInvalidExtractionClient(),
          agentRuns,
          logger: { error: () => undefined },
        },
        'note-1',
      ),
    ).resolves.toBeUndefined();
  });
});
