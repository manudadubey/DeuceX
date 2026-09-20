import type { TokenUsage } from '@procircuit/actions';
import type { ExtractionPrompt } from './prompt';

// A plain fetch against the vendor's REST API, the same style as
// apps/api/src/transcription/whisper-adapter.ts, rather than an SDK
// dependency — TECH-ARCHITECTURE.md section 3a: this is the agent itself
// making its one schema-constrained call, not a restricted vendor client
// (that restriction is Stripe/Resend/ICS/entry, packages/actions' alone).
export interface ExtractionModelClient {
  complete(prompt: ExtractionPrompt): Promise<{ raw: unknown; usage: TokenUsage }>;
}

export class ExtractionModelCallError extends Error {}

const ANTHROPIC_API_VERSION = '2023-06-01';
const EXTRACTION_TOOL_NAME = 'record_match_note_extraction';
const MAX_OUTPUT_TOKENS = 1024;

// Hand-written rather than derived from schema.ts's Zod schema (no
// zod-to-json-schema dependency for one small, stable shape): forces the
// model to answer through tool use instead of free-form JSON, which is
// Claude's structured-output mechanism. schema.ts's Zod schema is still the
// authority validating what comes back — this only shapes what the model is
// asked for.
const EXTRACTION_TOOL_INPUT_SCHEMA = {
  type: 'object',
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

interface AnthropicContentBlock {
  type: string;
  input?: unknown;
}

interface AnthropicMessageResponse {
  content: AnthropicContentBlock[];
  usage: { input_tokens: number; output_tokens: number };
}

export interface AnthropicExtractionClientConfig {
  apiKey: string;
  model: string;
}

export function createAnthropicExtractionClient(
  config: AnthropicExtractionClientConfig,
): ExtractionModelClient {
  return {
    async complete({ system, user }): Promise<{ raw: unknown; usage: TokenUsage }> {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': ANTHROPIC_API_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: MAX_OUTPUT_TOKENS,
          system,
          messages: [{ role: 'user', content: user }],
          tools: [
            {
              name: EXTRACTION_TOOL_NAME,
              description: 'Record the structured extraction of the match note.',
              input_schema: EXTRACTION_TOOL_INPUT_SCHEMA,
            },
          ],
          tool_choice: { type: 'tool', name: EXTRACTION_TOOL_NAME },
        }),
      });

      if (!response.ok) {
        throw new ExtractionModelCallError(
          `Extraction model call failed: ${response.status} ${await response.text()}`,
        );
      }

      const body = (await response.json()) as AnthropicMessageResponse;
      const toolUse = body.content.find((block) => block.type === 'tool_use');
      if (!toolUse) {
        throw new ExtractionModelCallError('Extraction model response had no tool_use block');
      }

      return {
        raw: toolUse.input,
        usage: {
          inputTokens: body.usage.input_tokens,
          outputTokens: body.usage.output_tokens,
        },
      };
    },
  };
}
