import type { TokenUsage } from '@deucex/actions';
import type { FinancialActionPrompt } from './prompt';

// Same shape as mindset-coach/model-client.ts: a plain fetch against the
// vendor's REST API, not an SDK.
export interface FinancialActionModelClient {
  complete(prompt: FinancialActionPrompt): Promise<{ raw: unknown; usage: TokenUsage }>;
}

export class FinancialActionModelCallError extends Error {}

// packages/actions/src/pricing.ts already has a gpt-4o-mini row (step 1.2);
// agent_runs.model and recordRun()'s cost lookup both key off this string.
// TECH-ARCHITECTURE.md section 5's own cost target for this agent ("one
// short generation; the rest is arithmetic," under A$0.10/run) has ample
// room under this model's rate for one short sentence plus an optional
// second.
export const FINANCIAL_ACTION_MODEL = 'gpt-4o-mini';

const RESPONSE_SCHEMA_NAME = 'financial_agent_action';
const MAX_OUTPUT_TOKENS = 200;

const ACTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    text: { type: 'string' },
    secondSentence: { type: ['string', 'null'] },
  },
  required: ['text', 'secondSentence'],
} as const;

interface OpenAIChatCompletionResponse {
  choices: Array<{ message: { content: string | null } }>;
  usage: { prompt_tokens: number; completion_tokens: number };
}

export interface OpenAIFinancialActionClientConfig {
  apiKey: string;
  model: string;
}

export function createOpenAIFinancialActionClient(
  config: OpenAIFinancialActionClientConfig,
): FinancialActionModelClient {
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
              name: RESPONSE_SCHEMA_NAME,
              strict: true,
              schema: ACTION_JSON_SCHEMA,
            },
          },
        }),
      });

      if (!response.ok) {
        throw new FinancialActionModelCallError(
          `Financial action model call failed: ${response.status} ${await response.text()}`,
        );
      }

      const body = (await response.json()) as OpenAIChatCompletionResponse;
      const content = body.choices[0]?.message.content;
      if (!content) {
        throw new FinancialActionModelCallError('Financial action model response had no content');
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
