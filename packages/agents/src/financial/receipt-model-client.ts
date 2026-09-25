import type { TokenUsage } from '@deucex/actions';
import type { ReceiptExtractionPrompt } from './receipt-prompt';

// Same shape as match-scribe/model-client.ts, extended with an image: a
// plain fetch against the vendor's REST API, not an SDK.
export interface ReceiptExtractionModelClient {
  complete(prompt: ReceiptExtractionPrompt): Promise<{ raw: unknown; usage: TokenUsage }>;
}

export class ReceiptExtractionModelCallError extends Error {}

// gpt-4o-mini supports image input; the same OpenAI account and model
// string as match-scribe/extract and mindset-coach (packages/actions/src/
// pricing.ts already prices it), matching PRD-03 line 37's own words:
// "GPT-4o mini · structured extraction · usually 2-3 seconds," under
// A$0.02/receipt.
export const RECEIPT_EXTRACTION_MODEL = 'gpt-4o-mini';

const RESPONSE_SCHEMA_NAME = 'receipt_extraction';
const MAX_OUTPUT_TOKENS = 400;

const RECEIPT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    merchant: { type: 'string' },
    amount: { type: 'number' },
    currency: { type: 'string' },
    date: { type: 'string' },
    category: {
      type: 'string',
      enum: [
        'travel',
        'accommodation',
        'coaching',
        'equipment',
        'food',
        'physio',
        'entry_fees',
        'other',
      ],
    },
    tournamentLabel: { type: ['string', 'null'] },
    confidence: {
      type: 'object',
      additionalProperties: false,
      properties: {
        merchant: { type: 'number' },
        amount: { type: 'number' },
        currency: { type: 'number' },
        date: { type: 'number' },
        category: { type: 'number' },
      },
      required: ['merchant', 'amount', 'currency', 'date', 'category'],
    },
  },
  required: ['merchant', 'amount', 'currency', 'date', 'category', 'tournamentLabel', 'confidence'],
} as const;

interface OpenAIChatCompletionResponse {
  choices: Array<{ message: { content: string | null } }>;
  usage: { prompt_tokens: number; completion_tokens: number };
}

export interface OpenAIReceiptExtractionClientConfig {
  apiKey: string;
  model: string;
}

export function createOpenAIReceiptExtractionClient(
  config: OpenAIReceiptExtractionClientConfig,
): ReceiptExtractionModelClient {
  return {
    async complete({ system, user, imageDataUrl }): Promise<{ raw: unknown; usage: TokenUsage }> {
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
            {
              role: 'user',
              content: [
                { type: 'text', text: user },
                { type: 'image_url', image_url: { url: imageDataUrl } },
              ],
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: RESPONSE_SCHEMA_NAME,
              strict: true,
              schema: RECEIPT_JSON_SCHEMA,
            },
          },
        }),
      });

      if (!response.ok) {
        throw new ReceiptExtractionModelCallError(
          `Receipt extraction model call failed: ${response.status} ${await response.text()}`,
        );
      }

      const body = (await response.json()) as OpenAIChatCompletionResponse;
      const content = body.choices[0]?.message.content;
      if (!content) {
        throw new ReceiptExtractionModelCallError(
          'Receipt extraction model response had no content',
        );
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
