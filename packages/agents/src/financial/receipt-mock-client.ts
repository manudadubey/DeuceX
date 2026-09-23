import type { ReceiptExtractionModelClient } from './receipt-model-client';
import type { ReceiptModelOutput } from './receipt-schema';

// F-AC-5's own fixture: "Amount is 64, What is 'Trattoria da Gino ·
// Genova', Category Food... no Check badge shows" — amount here is the
// original EUR amount (38.50); the A$64 home-currency figure is
// ledger.ts's convertAtRate applied at review/save time, not this agent's
// job.
export const TRATTORIA_DA_GINO_FIXTURE: ReceiptModelOutput = {
  merchant: 'Trattoria da Gino · Genova',
  amount: 38.5,
  currency: 'EUR',
  date: '2026-09-10',
  category: 'food',
  tournamentLabel: 'Genoa',
  confidence: { merchant: 0.97, amount: 0.98, currency: 0.95, date: 0.96, category: 0.93 },
};

// F-AC-6's own fixture: "Category carries a Check badge... 1 field to
// check."
export const FARMACIA_CENTRALE_FIXTURE: ReceiptModelOutput = {
  merchant: 'Farmacia Centrale',
  amount: 14.2,
  currency: 'EUR',
  date: '2026-09-11',
  category: 'physio',
  tournamentLabel: null,
  confidence: { merchant: 0.94, amount: 0.95, currency: 0.9, date: 0.9, category: 0.55 },
};

// Mirrors match-scribe/mock-client.ts's shape: a fixed fixture for tests and
// apps/api's dev-only fallback when OPENAI_API_KEY is unset.
export function createMockReceiptExtractionClient(
  fixture: ReceiptModelOutput = TRATTORIA_DA_GINO_FIXTURE,
): ReceiptExtractionModelClient {
  return {
    async complete() {
      return { raw: { ...fixture }, usage: { inputTokens: 400, outputTokens: 60 } };
    },
  };
}

export function createInvalidReceiptExtractionClient(): ReceiptExtractionModelClient {
  return {
    async complete() {
      return { raw: { merchant: '' }, usage: { inputTokens: 400, outputTokens: 10 } };
    },
  };
}
