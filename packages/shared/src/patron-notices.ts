// Step 4.1b. PRD-04 P-18 / M-TIER-2: "emails each patron a notice the player has seen
// first." The exact text is built here, as a pure function, so the confirm
// step in Settings and the email packages/actions sends print the same words.

export interface PatronNoticeInput {
  playerName: string;
}

export interface PatronNotice {
  subject: string;
  /** Plain paragraphs; the email adds the manage link after them. */
  paragraphs: string[];
}

function first(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function billingPauseNotice(input: PatronNoticeInput): PatronNotice {
  const f = first(input.playerName);
  return {
    subject: `${f} has paused their patron page`,
    paragraphs: [
      `${input.playerName} has paused their patron page for now. Your membership is paused too: you won't be charged again while it stays paused, and nothing you've already paid is affected.`,
      `If ${f} restarts it, your membership resumes at the same price without signing up again, and you'll get an email first.`,
      `You don't need to do anything. If you'd rather end it now, use the link below.`,
    ],
  };
}

export function billingResumeNotice(input: PatronNoticeInput): PatronNotice {
  const f = first(input.playerName);
  return {
    subject: `${f}'s patron page is back`,
    paragraphs: [
      `${input.playerName} has restarted their patron page. Your membership resumes at the same price you had before, from your next billing date.`,
      `If you'd rather not continue, you can cancel or change tier with the link below before then.`,
    ],
  };
}

export function manageLinkNotice(input: PatronNoticeInput): PatronNotice {
  const f = first(input.playerName);
  return {
    subject: `Manage your membership with ${f}`,
    paragraphs: [
      `Here's the link you asked for. It opens Stripe's own page, where you can change tier, update your card or cancel. It works for one hour.`,
      `Didn't ask for this? Ignore it and nothing changes.`,
    ],
  };
}

/** Stripe's cancellation feedback codes, in plain words for the leave event (P-17). */
const FEEDBACK_TEXT: Record<string, string> = {
  too_expensive: 'Too expensive',
  missing_features: 'Missing something they wanted',
  switched_service: 'Switched to something else',
  unused: "Wasn't using it",
  customer_service: 'Service',
  too_complex: 'Too complicated',
  low_quality: 'Quality',
  other: 'Other',
};

export function cancellationReason(comment: string | null, feedback: string | null): string | null {
  const text = comment?.trim();
  if (text) return text;
  return feedback ? (FEEDBACK_TEXT[feedback] ?? null) : null;
}
