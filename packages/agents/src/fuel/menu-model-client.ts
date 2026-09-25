import type { TokenUsage } from '@deucex/actions';
import type { MenuExtractionPrompt } from './menu-prompt';
import { CONTAINS_TAGS, DISH_TRAITS } from './types';

// Same shape as financial/receipt-model-client.ts, with several images: a
// plain fetch against the vendor's REST API, not an SDK. All pages of one
// scan go in one call (PRD-07 section 3: "multi-page scans batched into one
// call").
export interface MenuExtractionModelClient {
  complete(prompt: MenuExtractionPrompt): Promise<{ raw: unknown; usage: TokenUsage }>;
}

export class MenuExtractionModelCallError extends Error {}

// PRD-07 section 3's cost target (under A$0.05 per scan) and
// TECH-ARCHITECTURE section 5's model tiering (Fuel's menu translation is
// named as small-model work) both point at the same vision-capable model
// receipts already use, on the same OpenAI account.
export const MENU_EXTRACTION_MODEL = 'gpt-4o-mini';

const RESPONSE_SCHEMA_NAME = 'menu_extraction';
// Fourteen dishes with a why sentence and asks each run to roughly 1,500
// output tokens; the cap leaves room for a long menu without letting a
// runaway answer set the cost.
const MAX_OUTPUT_TOKENS = 4000;

const MENU_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    readable: { type: 'boolean' },
    venueName: { type: ['string', 'null'] },
    venueType: { type: 'string', enum: ['restaurant', 'room-service', 'shop', 'other'] },
    languages: { type: 'array', items: { type: 'string' } },
    menuCurrency: { type: ['string', 'null'] },
    dishes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          original: { type: 'string' },
          english: { type: 'string' },
          gloss: { type: 'string' },
          price: { type: ['number', 'null'] },
          ingredientsReadable: { type: 'boolean' },
          contains: { type: 'array', items: { type: 'string', enum: [...CONTAINS_TAGS] } },
          traits: { type: 'array', items: { type: 'string', enum: [...DISH_TRAITS] } },
          why: { type: 'string' },
          asks: { type: 'array', items: { type: 'string' } },
        },
        required: [
          'original',
          'english',
          'gloss',
          'price',
          'ingredientsReadable',
          'contains',
          'traits',
          'why',
          'asks',
        ],
      },
    },
  },
  required: ['readable', 'venueName', 'venueType', 'languages', 'menuCurrency', 'dishes'],
} as const;

interface OpenAIChatCompletionResponse {
  choices: Array<{ message: { content: string | null } }>;
  usage: { prompt_tokens: number; completion_tokens: number };
}

export interface OpenAIMenuExtractionClientConfig {
  apiKey: string;
  model: string;
}

export function createOpenAIMenuExtractionClient(
  config: OpenAIMenuExtractionClientConfig,
): MenuExtractionModelClient {
  return {
    async complete({ system, user, imageDataUrls }) {
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
                ...imageDataUrls.map((url) => ({ type: 'image_url', image_url: { url } })),
              ],
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: RESPONSE_SCHEMA_NAME, strict: true, schema: MENU_JSON_SCHEMA },
          },
        }),
      });

      if (!response.ok) {
        throw new MenuExtractionModelCallError(
          `Menu extraction model call failed: ${response.status} ${await response.text()}`,
        );
      }

      const body = (await response.json()) as OpenAIChatCompletionResponse;
      const content = body.choices[0]?.message.content;
      if (!content) {
        throw new MenuExtractionModelCallError('Menu extraction model response had no content');
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
