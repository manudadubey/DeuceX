export const RECEIPT_EXTRACTION_PROMPT_VERSION = 'v1';

const SYSTEM_PROMPT = `You read a photo of a receipt for a professional tennis player's expense ledger (PRD-03).
Extract merchant, amount, currency (ISO 4217), date (YYYY-MM-DD), one category from: travel, accommodation, coaching, equipment, food, physio, entry_fees, other.
tournamentLabel: only if the receipt itself names a tournament or event; otherwise null. Never guess one.
Report your own confidence (0 to 1) per field: merchant, amount, currency, date, category.
Never invent a value you cannot read; if a currency symbol is ambiguous, use the country of the merchant to infer the ISO code.
Respond only by calling the recording tool with your answer.`;

export interface ReceiptExtractionPrompt {
  system: string;
  user: string;
  /** data: URI, e.g. "data:image/jpeg;base64,...". */
  imageDataUrl: string;
}

export interface ReceiptExtractionInput {
  imageDataUrl: string;
}

export function buildReceiptExtractionPrompt(
  input: ReceiptExtractionInput,
): ReceiptExtractionPrompt {
  return {
    system: SYSTEM_PROMPT,
    user: 'Extract the fields from this receipt photo.',
    imageDataUrl: input.imageDataUrl,
  };
}

export function buildCorrectiveReceiptExtractionPrompt(
  input: ReceiptExtractionInput,
  validationError: string,
): ReceiptExtractionPrompt {
  const base = buildReceiptExtractionPrompt(input);
  return {
    ...base,
    user: `${base.user}\n\nYour previous answer did not match the required schema: ${validationError}\nCall the tool again, correcting the problem.`,
  };
}
