import { z } from 'zod';

export const RECEIPT_EXTRACTION_SCHEMA_VERSION = 'v1';

// Mirrors ledger.ts's LedgerCategory exactly (packages/db/src/ledger.ts):
// the extractor must propose one of the same eight categories the ledger
// itself enforces.
const CATEGORY_VALUES = [
  'travel',
  'accommodation',
  'coaching',
  'equipment',
  'food',
  'physio',
  'entry_fees',
  'other',
] as const;

// PRD-03 section 12: "the 0.8 confidence threshold for the Check badge is a
// placeholder pending real receipts" — the same status match-scribe's own
// MOOD_PROPOSAL_CONFIDENCE_THRESHOLD (0.6) carries for its own placeholder.
export const RECEIPT_FIELD_CONFIDENCE_THRESHOLD = 0.8;

export const receiptModelOutputSchema = z.object({
  merchant: z.string().min(1),
  amount: z.number().positive(),
  currency: z
    .string()
    .length(3)
    .transform((c) => c.toUpperCase()),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  category: z.enum(CATEGORY_VALUES),
  // No tournament list to select from yet (no Entered/shortlisted events
  // until step 3.2): a free-text guess only, matched against the player's
  // own budget_estimates labels at review time, never trusted as an id.
  tournamentLabel: z.string().min(1).nullable(),
  confidence: z.object({
    merchant: z.number().min(0).max(1),
    amount: z.number().min(0).max(1),
    currency: z.number().min(0).max(1),
    date: z.number().min(0).max(1),
    category: z.number().min(0).max(1),
  }),
});

export type ReceiptModelOutput = z.infer<typeof receiptModelOutputSchema>;
export type ReceiptField = keyof ReceiptModelOutput['confidence'];

export interface ReceiptProposal {
  merchant: string;
  amount: number;
  currency: string;
  date: string;
  category: (typeof CATEGORY_VALUES)[number];
  tournamentLabel: string | null;
  /** Field names whose confidence fell under the threshold (F-13's "Check" badge). */
  unsureFields: ReceiptField[];
}

// F-13: "fields below the confidence threshold carry a Check badge... a
// flagged field does not block Save."
export function buildReceiptProposal(output: ReceiptModelOutput): ReceiptProposal {
  const unsureFields = (Object.keys(output.confidence) as ReceiptField[]).filter(
    (field) => output.confidence[field] < RECEIPT_FIELD_CONFIDENCE_THRESHOLD,
  );
  return {
    merchant: output.merchant,
    amount: output.amount,
    currency: output.currency,
    date: output.date,
    category: output.category,
    tournamentLabel: output.tournamentLabel,
    unsureFields,
  };
}
