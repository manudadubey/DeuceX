import { AgentValidationError } from '@deucex/actions';
import { describe, expect, it } from 'vitest';
import { extractReceipt } from './extract-receipt';
import {
  FARMACIA_CENTRALE_FIXTURE,
  createInvalidReceiptExtractionClient,
  createMockReceiptExtractionClient,
} from './receipt-mock-client';
import type { ReceiptExtractionModelClient } from './receipt-model-client';

const IMAGE = { imageDataUrl: 'data:image/jpeg;base64,AAAA' };

function sequenceClient(...responses: Array<{ raw: unknown }>): ReceiptExtractionModelClient {
  let call = 0;
  return {
    async complete() {
      const response = responses[Math.min(call, responses.length - 1)]!;
      call += 1;
      return { raw: response.raw, usage: { inputTokens: 400, outputTokens: 60 } };
    },
  };
}

// The build plan's own step 2.2 "Done when": "a receipt fixture extracts
// merchant, amount, currency and locked rate." The "locked rate" part is
// ledger.ts's job at Save time (fx_rate_date = the receipt's own date,
// never today's) — this proves the extraction half produces the fields that
// feed it.
describe('extractReceipt', () => {
  it('extracts merchant, amount, currency and date from the Trattoria da Gino fixture (F-AC-5)', async () => {
    const client = createMockReceiptExtractionClient();

    const result = await extractReceipt(client, IMAGE);

    expect(result.output).toMatchObject({
      merchant: 'Trattoria da Gino · Genova',
      amount: 38.5,
      currency: 'EUR',
      date: '2026-09-10',
      category: 'food',
    });
    expect(result.output.unsureFields).toHaveLength(0);
  });

  it('flags a low-confidence field with a Check badge but still succeeds (F-AC-6)', async () => {
    const client = createMockReceiptExtractionClient(FARMACIA_CENTRALE_FIXTURE);

    const result = await extractReceipt(client, IMAGE);

    expect(result.output.unsureFields).toEqual(['category']);
    expect(result.output.merchant).toBe('Farmacia Centrale');
  });

  it('retries once with the validation error appended, then succeeds', async () => {
    const client = sequenceClient(
      { raw: { merchant: 'A cafe' } }, // missing required fields
      {
        raw: {
          merchant: 'A cafe',
          amount: 12,
          currency: 'eur',
          date: '2026-09-11',
          category: 'food',
          tournamentLabel: null,
          confidence: { merchant: 0.9, amount: 0.9, currency: 0.9, date: 0.9, category: 0.9 },
        },
      },
    );

    const result = await extractReceipt(client, IMAGE);

    expect(result.output.currency).toBe('EUR'); // uppercased by the schema
    expect(result.usage).toEqual({ inputTokens: 800, outputTokens: 120 });
  });

  it('fails cleanly with AgentValidationError after a second invalid response', async () => {
    const client = createInvalidReceiptExtractionClient();

    await expect(extractReceipt(client, IMAGE)).rejects.toThrow(AgentValidationError);
  });
});
