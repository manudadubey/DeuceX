// Step 4.2: the content_publish approval payload. apps/web builds it from the
// draft the player is looking at when they confirm; packages/actions builds
// it again from the server's own patron_updates row at send time, and
// runGatedAction compares the two hashes. So an edit made after the approval
// (or a row changed any other way) can never go out under that approval.
// The text itself is in the payload on purpose: the approval row is the
// audit record of exactly what the player approved (M-GATE-4).

export interface ContentPublishPayloadInput {
  updateId: string;
  subject: string;
  body: string;
  practiceSection: string | null;
  tierIds: readonly string[];
  /** Null for Send now. */
  sendAt: string | null;
  teaser: boolean;
}

export interface ContentPublishPayload {
  [key: string]: string | boolean | null | string[];
  updateId: string;
  subject: string;
  body: string;
  practiceSection: string | null;
  tierIds: string[];
  sendAt: string | null;
  teaser: boolean;
}

export function contentPublishPayload(input: ContentPublishPayloadInput): ContentPublishPayload {
  return {
    updateId: input.updateId,
    subject: input.subject,
    body: input.body,
    practiceSection: input.practiceSection,
    tierIds: [...input.tierIds].sort(),
    sendAt: input.sendAt ? new Date(input.sendAt).toISOString() : null,
    teaser: input.teaser,
  };
}
