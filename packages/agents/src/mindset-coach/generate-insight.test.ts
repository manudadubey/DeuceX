import { AgentValidationError } from '@procircuit/actions';
import { describe, expect, it } from 'vitest';
import { generateInsight, type GenerateInsightInput } from './generate-insight';
import {
  createClinicalLanguageInsightClient,
  createInvalidInsightClient,
  createMockInsightClient,
} from './mock-client';
import type { InsightModelClient } from './model-client';
import type { MindsetNote } from './types';

const NOW = new Date('2026-09-21T20:00:00Z');

function note(overrides: Partial<MindsetNote> & { id: string }): MindsetNote {
  return {
    recordedAt: '2026-09-15T10:00:00Z',
    ctx: 'match',
    result: null,
    mood: null,
    tags: [],
    transcript: null,
    summary: 'A note.',
    cond: null,
    ...overrides,
  };
}

function baseInput(overrides: Partial<GenerateInsightInput> = {}): GenerateInsightInput {
  return {
    lang: 'en',
    timezone: 'Australia/Sydney',
    notes: [
      note({ id: '1', recordedAt: '2026-09-18T10:00:00Z' }),
      note({ id: '2', recordedAt: '2026-09-19T10:00:00Z' }),
      note({ id: '3', recordedAt: '2026-09-20T10:00:00Z' }),
      note({ id: '4', recordedAt: '2026-09-21T09:00:00Z' }),
    ],
    checkins: [{ date: '2026-09-20', value: 4, sentence: null }],
    existingPatterns: [],
    quietMatchMornings: true,
    hasMatchToday: false,
    notTodayCountLast7Days: 0,
    recentFocuses: [],
    now: NOW,
    ...overrides,
  };
}

describe('generateInsight', () => {
  it('MC-AC-1-style: delivers from the mock client with the right provenance counts', async () => {
    const result = await generateInsight(createMockInsightClient(), baseInput());
    expect(result.delivery).toBe('delivered');
    expect(result.provenance.notes).toBe(4);
    expect(result.provenance.checkins).toBe(1);
    expect(result.provenance.rankingDelta).toBeNull();
    expect(result.body).not.toBeNull();
    expect(result.focus).not.toBeNull();
    expect(result.notify).toBe(true);
    expect(result.notificationBody).toBe(result.body![0]);
  });

  it('M-PRIV-3: a fired distress signal pre-empts the model entirely', async () => {
    let called = false;
    const client: InsightModelClient = {
      async complete() {
        called = true;
        return { raw: { body: ['x'], focus: null }, usage: { inputTokens: 1, outputTokens: 1 } };
      },
    };

    const result = await generateInsight(
      client,
      baseInput({
        notes: [note({ id: '1', transcript: "I don't want to be here anymore" })],
      }),
    );

    expect(called).toBe(false);
    expect(result.delivery).toBe('distress');
    expect(result.distress?.fired).toBe(true);
    expect(result.body).toBeNull();
    expect(result.notify).toBe(true);
    expect(result.notificationBody).toBe('Something for you this morning');
  });

  it('MC-14/AC-8: a match morning with quietMatchMornings on withholds delivery, no model call', async () => {
    let called = false;
    const client: InsightModelClient = {
      async complete() {
        called = true;
        return { raw: { body: ['x'], focus: null }, usage: { inputTokens: 1, outputTokens: 1 } };
      },
    };

    const result = await generateInsight(
      client,
      baseInput({ hasMatchToday: true, quietMatchMornings: true }),
    );

    expect(called).toBe(false);
    expect(result.delivery).toBe('quiet');
    expect(result.notify).toBe(false);
  });

  it('AC-11: tone-check failure regenerates once, then withholds if still failing', async () => {
    const result = await generateInsight(createClinicalLanguageInsightClient(), baseInput());
    expect(result.delivery).toBe('withheld');
    expect(result.body).toBeNull();
    expect(result.notify).toBe(false);
    expect(result.toneCheck?.passed).toBe(false);
  });

  it('fails cleanly with AgentValidationError after two invalid schema responses', async () => {
    await expect(generateInsight(createInvalidInsightClient(), baseInput())).rejects.toThrow(
      AgentValidationError,
    );
  });

  it('MC-AC-3: flags a pattern that is new this run', async () => {
    const tiebreakNotes: MindsetNote[] = [
      note({ id: 'a', result: 'L 6-4 3-6 6-7(5)', tags: ['Second serve'] }),
      note({ id: 'b', result: 'L 7-6(4) 4-6 6-7(2)', tags: ['Second serve'] }),
      note({ id: 'c', result: 'L 3-6 7-6(9)', tags: ['Second serve'] }),
      note({ id: 'd', result: 'L 6-7(3) 5-7', tags: [] }),
    ];
    const result = await generateInsight(
      createMockInsightClient(),
      baseInput({ notes: tiebreakNotes }),
    );
    expect(result.patternFlagRuleKey).toBe('tiebreak_loss_second_serve');
    const update = result.patternUpdates.find((p) => p.ruleKey === 'tiebreak_loss_second_serve');
    expect(update?.confidence).toBe('strong');
    expect(update?.isNewOrStrengthened).toBe(true);
  });

  it('MC-9-AC-6: a dismissed pattern does not re-flag below the re-raise threshold', async () => {
    const tiebreakNotes: MindsetNote[] = [
      note({ id: 'a', result: 'L 6-4 3-6 6-7(5)', tags: ['Second serve'] }),
      note({ id: 'b', result: 'L 7-6(4) 4-6 6-7(2)', tags: ['Second serve'] }),
      note({ id: 'c', result: 'L 3-6 7-6(9)', tags: ['Second serve'] }),
    ];
    const result = await generateInsight(
      createMockInsightClient(),
      baseInput({
        notes: tiebreakNotes,
        existingPatterns: [
          {
            id: 'p1',
            ruleKey: 'tiebreak_loss_second_serve',
            statement: 'x',
            explanation: 'y',
            evidence: [
              { noteId: 'a', hit: true },
              { noteId: 'b', hit: true },
              { noteId: 'c', hit: true },
            ],
            confidence: 'strong',
            dismissed: true,
            recurSince: 0,
          },
        ],
      }),
    );
    expect(result.patternFlagRuleKey).toBeNull();
  });
});
