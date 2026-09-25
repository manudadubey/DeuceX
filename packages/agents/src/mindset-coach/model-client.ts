import type { TokenUsage } from '@deucex/actions';
import type { InsightPrompt } from './prompt';

// Same shape as match-scribe/model-client.ts: a plain fetch against the
// vendor's REST API, not an SDK.
export interface InsightModelClient {
  complete(prompt: InsightPrompt): Promise<{ raw: unknown; usage: TokenUsage }>;
}

export class InsightModelCallError extends Error {}

// packages/actions/src/pricing.ts already has a gpt-4o-mini row from step
// 1.2; agent_runs.model and recordRun()'s cost lookup both key off this.
export const INSIGHT_MODEL = 'gpt-4o-mini';

const INSIGHT_RESPONSE_SCHEMA_NAME = 'mindset_coach_insight';
const MAX_OUTPUT_TOKENS = 400;

const INSIGHT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    body: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 },
    focus: { type: ['string', 'null'] },
  },
  required: ['body', 'focus'],
} as const;

interface OpenAIChatCompletionResponse {
  choices: Array<{ message: { content: string | null } }>;
  usage: { prompt_tokens: number; completion_tokens: number };
}

export interface OpenAIInsightClientConfig {
  apiKey: string;
  model: string;
}

// gpt-4o-mini, the same OpenAI account already paying for Whisper and
// match-scribe/extract (step 1.2's own follow-up rationale): a daily prose
// generation over a small, curated input bundle is not a heavier task than
// extraction, and PRD-06's own cost target (under A$0.08/insight) has ample
// room under this model's rate. The prototype's UI badge names "Claude
// Sonnet" specifically, but CLAUDE.md's "no model provider names in the
// interface" rule supersedes that literal copy — see the Mindset page's own
// badge text, which is generic.
export function createOpenAIInsightClient(config: OpenAIInsightClientConfig): InsightModelClient {
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
              name: INSIGHT_RESPONSE_SCHEMA_NAME,
              strict: true,
              schema: INSIGHT_JSON_SCHEMA,
            },
          },
        }),
      });

      if (!response.ok) {
        throw new InsightModelCallError(
          `Insight model call failed: ${response.status} ${await response.text()}`,
        );
      }

      const body = (await response.json()) as OpenAIChatCompletionResponse;
      const content = body.choices[0]?.message.content;
      if (!content) {
        throw new InsightModelCallError('Insight model response had no content');
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
