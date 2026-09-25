import { AgentValidationError, type TokenUsage } from '@deucex/actions';
import {
  buildCorrectiveReceiptExtractionPrompt,
  buildReceiptExtractionPrompt,
  type ReceiptExtractionInput,
} from './receipt-prompt';
import {
  buildReceiptProposal,
  receiptModelOutputSchema,
  type ReceiptProposal,
} from './receipt-schema';
import type { ReceiptExtractionModelClient } from './receipt-model-client';

export interface ExtractReceiptResult {
  output: ReceiptProposal;
  usage: TokenUsage;
}

function sumUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

// The receipt-scanning half of the Financial Agent (PRD-03 F-12 to F-15):
// one schema-constrained vision call with exactly one corrective retry, the
// same shape as match-scribe/extract.ts. Event-triggered per photo, not on
// the scheduled AGENT_RUN_QUEUE — apps/api/src/financial/receipts.ts wraps
// this in recordRun() and deletes the photo immediately after (M-PRIV-1),
// success or failure.
export async function extractReceipt(
  client: ReceiptExtractionModelClient,
  input: ReceiptExtractionInput,
): Promise<ExtractReceiptResult> {
  const first = await client.complete(buildReceiptExtractionPrompt(input));
  const firstParsed = receiptModelOutputSchema.safeParse(first.raw);
  if (firstParsed.success) {
    return { output: buildReceiptProposal(firstParsed.data), usage: first.usage };
  }

  const second = await client.complete(
    buildCorrectiveReceiptExtractionPrompt(input, firstParsed.error.message),
  );
  const usage = sumUsage(first.usage, second.usage);
  const secondParsed = receiptModelOutputSchema.safeParse(second.raw);
  if (secondParsed.success) {
    return { output: buildReceiptProposal(secondParsed.data), usage };
  }

  throw new AgentValidationError(
    `financial/extract-receipt: model output failed schema validation twice: ${secondParsed.error.message}`,
  );
}
