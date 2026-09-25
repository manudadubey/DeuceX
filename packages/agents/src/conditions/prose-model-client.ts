import type { TokenUsage } from '@deucex/actions';
import type { ProsePrompt } from './prose-prompt';

// A plain fetch against the vendor's REST API, the same style as
// match-scribe/model-client.ts (also OpenAI, same OPENAI_API_KEY — one
// vendor account for every structured-extraction-shaped call in this
// codebase, matching the "no model provider names in the interface" and
// TECH-ARCHITECTURE.md section 3a conventions).
export interface ProseModelClient {
  complete(prompt: ProsePrompt): Promise<{ raw: unknown; usage: TokenUsage }>;
}

export class ProseModelCallError extends Error {}

const PROSE_RESPONSE_SCHEMA_NAME = 'conditions_brief_prose_batch';
const MAX_OUTPUT_TOKENS = 1024;

// Hand-written, mirroring match-scribe/model-client.ts's own
// EXTRACTION_JSON_SCHEMA: forces OpenAI's strict Structured Outputs mode.
// zod's own prose-schema.ts is still the validating authority; this only
// shapes what the model is asked for.
const PROSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    briefs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tournamentId: { type: 'string' },
          diff: { type: 'string' },
          practice: { type: 'string' },
        },
        required: ['tournamentId', 'diff', 'practice'],
      },
    },
  },
  required: ['briefs'],
} as const;

interface OpenAIChatCompletionResponse {
  choices: Array<{ message: { content: string | null } }>;
  usage: { prompt_tokens: number; completion_tokens: number };
}

export interface OpenAIProseClientConfig {
  apiKey: string;
  model: string;
}

export function createOpenAIProseClient(config: OpenAIProseClientConfig): ProseModelClient {
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
              name: PROSE_RESPONSE_SCHEMA_NAME,
              strict: true,
              schema: PROSE_JSON_SCHEMA,
            },
          },
        }),
      });

      if (!response.ok) {
        throw new ProseModelCallError(
          `Conditions prose model call failed: ${response.status} ${await response.text()}`,
        );
      }

      const body = (await response.json()) as OpenAIChatCompletionResponse;
      const content = body.choices[0]?.message.content;
      if (!content) {
        throw new ProseModelCallError('Conditions prose model response had no content');
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
