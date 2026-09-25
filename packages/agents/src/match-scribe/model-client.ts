import type { TokenUsage } from '@deucex/actions';
import type { ExtractionPrompt } from './prompt';

// A plain fetch against the vendor's REST API, the same style as
// apps/api/src/transcription/whisper-adapter.ts (also OpenAI, same
// OPENAI_API_KEY — one vendor account for both), rather than an SDK
// dependency — TECH-ARCHITECTURE.md section 3a: this is the agent itself
// making its one schema-constrained call, not a restricted vendor client
// (that restriction is Stripe/Resend/ICS/entry, packages/actions' alone).
export interface ExtractionModelClient {
  complete(prompt: ExtractionPrompt): Promise<{ raw: unknown; usage: TokenUsage }>;
}

export class ExtractionModelCallError extends Error {}

const EXTRACTION_RESPONSE_SCHEMA_NAME = 'match_note_extraction';
const MAX_OUTPUT_TOKENS = 1024;

// Hand-written rather than derived from schema.ts's Zod schema (no
// zod-to-json-schema dependency for one small, stable shape): forces the
// model to answer through OpenAI's strict Structured Outputs mode, which
// requires every property listed in `required` (no optional fields) and
// `additionalProperties: false`. schema.ts's Zod schema is still the
// authority validating what comes back — this only shapes what the model is
// asked for.
const EXTRACTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ctx: { type: 'string', enum: ['match', 'practice', 'travel', 'other'] },
    result: { type: ['string', 'null'] },
    opponent: { type: ['string', 'null'] },
    round: {
      type: ['string', 'null'],
      enum: ['Q1', 'Q2', 'Q3', 'R1', 'R2', 'R3', 'QF', 'SF', 'F', null],
    },
    surface: { type: ['string', 'null'] },
    tags: { type: 'array', items: { type: 'string' } },
    mood: { type: 'string', enum: ['frustrated', 'flat', 'confident', 'energised'] },
    moodConfidence: { type: 'number', minimum: 0, maximum: 1 },
    summary: { type: 'string', maxLength: 220 },
  },
  required: [
    'ctx',
    'result',
    'opponent',
    'round',
    'surface',
    'tags',
    'mood',
    'moodConfidence',
    'summary',
  ],
} as const;

interface OpenAIChatCompletionResponse {
  choices: Array<{ message: { content: string | null } }>;
  usage: { prompt_tokens: number; completion_tokens: number };
}

export interface OpenAIExtractionClientConfig {
  apiKey: string;
  model: string;
}

export function createOpenAIExtractionClient(
  config: OpenAIExtractionClientConfig,
): ExtractionModelClient {
  return {
    async complete({ system, user }): Promise<{ raw: unknown; usage: TokenUsage }> {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: MAX_OUTPUT_TOKENS,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: EXTRACTION_RESPONSE_SCHEMA_NAME,
              strict: true,
              schema: EXTRACTION_JSON_SCHEMA,
            },
          },
        }),
      });

      if (!response.ok) {
        throw new ExtractionModelCallError(
          `Extraction model call failed: ${response.status} ${await response.text()}`,
        );
      }

      const body = (await response.json()) as OpenAIChatCompletionResponse;
      const content = body.choices[0]?.message.content;
      if (!content) {
        throw new ExtractionModelCallError('Extraction model response had no content');
      }

      return {
        raw: JSON.parse(content),
        usage: {
          inputTokens: body.usage.prompt_tokens,
          outputTokens: body.usage.completion_tokens,
        },
      };
    },
  };
}
