import { AgentValidationError } from '@deucex/actions';
import { describe, expect, it } from 'vitest';
import { extractMatchNote } from './extract';
import { createInvalidExtractionClient, createMockExtractionClient } from './mock-client';
import type { ExtractionModelClient } from './model-client';

const TRANSCRIPT =
  'Lost to Kovalenko in a third-set breaker, six-four, three-six, six-seven. The second serve again, I was rushing it.';

const VOCABULARY = ['Second serve', 'Tiebreak', 'Clay'];

function sequenceClient(...responses: Array<{ raw: unknown }>): ExtractionModelClient {
  let call = 0;
  return {
    async complete() {
      const response = responses[Math.min(call, responses.length - 1)]!;
      call += 1;
      return { raw: response.raw, usage: { inputTokens: 100, outputTokens: 50 } };
    },
  };
}

describe('extractMatchNote', () => {
  it('produces a valid extraction from a recorded mock response (build plan step 1.2 "Done when")', async () => {
    const client = createMockExtractionClient();

    const result = await extractMatchNote(client, {
      ctx: 'match',
      transcript: TRANSCRIPT,
      tagVocabulary: VOCABULARY,
    });

    expect(result.output).toMatchObject({
      result: 'L 6-4 3-6 6-7(5)',
      opponent: 'Kovalenko',
      tags: ['Second serve', 'Tiebreak'],
      mood: 'frustrated',
    });
    expect(result.usage).toEqual({ inputTokens: 400, outputTokens: 120 });
  });

  it('retries once with the validation error appended, then succeeds', async () => {
    const client = sequenceClient(
      { raw: { ctx: 'match' } }, // missing required fields
      {
        raw: {
          ctx: 'match',
          result: 'W 6-3 6-2',
          opponent: 'A. Petrova',
          round: null,
          surface: null,
          tags: ['Tiebreak'],
          mood: 'energised',
          moodConfidence: 0.7,
          summary: 'Straight-sets win.',
        },
      },
    );

    const result = await extractMatchNote(client, {
      ctx: 'match',
      transcript: 'Won in two comfortable sets.',
      tagVocabulary: VOCABULARY,
    });

    expect(result.output.result).toBe('W 6-3 6-2');
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 100 });
  });

  it('fails cleanly with AgentValidationError after a second invalid response', async () => {
    const client = createInvalidExtractionClient();

    await expect(
      extractMatchNote(client, {
        ctx: 'match',
        transcript: TRANSCRIPT,
        tagVocabulary: VOCABULARY,
      }),
    ).rejects.toThrow(AgentValidationError);
  });

  it('fails validation when the model proposes a tag outside the vocabulary', async () => {
    const client = sequenceClient(
      {
        raw: {
          ctx: 'match',
          result: null,
          opponent: null,
          round: null,
          surface: null,
          tags: ['Nutrition'],
          mood: 'flat',
          moodConfidence: 0.5,
          summary: 'A short note.',
        },
      },
      {
        raw: {
          ctx: 'match',
          result: null,
          opponent: null,
          round: null,
          surface: null,
          tags: ['Nutrition'],
          mood: 'flat',
          moodConfidence: 0.5,
          summary: 'A short note.',
        },
      },
    );

    await expect(
      extractMatchNote(client, {
        ctx: 'match',
        transcript: 'Talked about diet today.',
        tagVocabulary: VOCABULARY,
      }),
    ).rejects.toThrow(AgentValidationError);
  });
});
