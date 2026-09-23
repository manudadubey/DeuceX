import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@procircuit/db';
import { recordRun, type AgentRunsDb } from '@procircuit/actions';
import {
  RECEIPT_EXTRACTION_MODEL,
  RECEIPT_EXTRACTION_PROMPT_VERSION,
  RECEIPT_EXTRACTION_SCHEMA_VERSION,
  extractReceipt,
  type ReceiptExtractionModelClient,
  type ReceiptProposal,
} from '@procircuit/agents';

export interface ScanReceiptDeps {
  db: SupabaseClient<Database>;
  extractionClient: ReceiptExtractionModelClient;
  agentRuns: AgentRunsDb;
}

export interface ScanReceiptInput {
  playerId: string;
  imageBuffer: Buffer;
  contentType: string;
}

export interface ScanReceiptResult {
  proposal: ReceiptProposal;
}

function inputsHash(input: { playerId: string; imageDigest: string }): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

// PRD-03 F-12 to F-15: the photo is held in memory for exactly one
// extraction call and never written to any storage at all — a stricter
// reading of M-PRIV-1's "read once and deleted after extraction" than
// audio's own lifecycle (step 1.1), which does persist a copy briefly. This
// step deliberately skips generating the ledger's receipt-thumbnail
// rendition and the card-number redaction F-15 also asks for: neither is
// safe to fake without a real image-processing dependency, and storing an
// unredacted photo under a "rendition" label would be worse than not
// storing one at all. Flagged in docs/BUILD-LOG.md as a real gap, not
// silently dropped — a scanned ledger line's receipt button (F-12) has
// nothing to expand to until that pipeline exists.
//
// No Save has happened yet when this returns: the caller (apps/web) reviews
// the proposal and only then calls packages/db's insertLedgerLine directly
// (plain CRUD against ledger_lines, no vendor call left at that point) with
// receipt_ref left null.
export async function scanReceipt(
  deps: ScanReceiptDeps,
  input: ScanReceiptInput,
): Promise<ScanReceiptResult> {
  const imageDigest = createHash('sha256').update(input.imageBuffer).digest('hex');
  const imageDataUrl = `data:${input.contentType};base64,${input.imageBuffer.toString('base64')}`;

  const { output } = await recordRun(
    deps.agentRuns,
    {
      agentName: 'financial-receipt-extract',
      playerId: input.playerId,
      triggerType: 'event',
      inputsHash: inputsHash({ playerId: input.playerId, imageDigest }),
      model: RECEIPT_EXTRACTION_MODEL,
      promptVersion: RECEIPT_EXTRACTION_PROMPT_VERSION,
      schemaVersion: RECEIPT_EXTRACTION_SCHEMA_VERSION,
    },
    async () => {
      const result = await extractReceipt(deps.extractionClient, { imageDataUrl });
      return { output: result.output as unknown as Json, usage: result.usage };
    },
  );

  return { proposal: output as unknown as ReceiptProposal };
}
