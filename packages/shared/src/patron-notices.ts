// Step 4.1b. PRD-04 P-18 / M-TIER-2: "emails each patron a notice the player has seen
// first." The exact text is built here, as a pure function, so the confirm
// step in Settings and the email packages/actions sends print the same words.

export interface PatronNoticeInput {
  playerName: string;
}

/** How long a paused membership waits for the player before it ends (owner decision, 25 Sep 2026). */
export const PAUSED_MEMBERSHIP_DAYS = 90;

/** "24 December 2026": the date a membership paused on `pausedAt` ends. */
export function pausedMembershipEndDate(pausedAt: Date): string {
  const end = new Date(pausedAt.getTime() + PAUSED_MEMBERSHIP_DAYS * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(end);
}

export interface PatronNotice {
  subject: string;
  /** Plain paragraphs; the email adds the manage link after them. */
  paragraphs: string[];
}

function first(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function billingPauseNotice(input: PatronNoticeInput & { endsOn: string }): PatronNotice {
  const f = first(input.playerName);
  return {
    subject: `${f} has paused their patron page`,
    paragraphs: [
      `${input.playerName} has paused their patron page for now. Your membership is paused too: you won't be charged again while it stays paused, and nothing you've already paid is affected.`,
      `If ${f} restarts it by ${input.endsOn}, your membership resumes at the same price without signing up again, and you'll get an email first. If not, it ends on ${input.endsOn} and nothing more is ever charged.`,
      `You don't need to do anything. If you'd rather end it now, use the link below.`,
    ],
  };
}

/** The goodbye when a membership paused for 90 days ends (owner decision, 25 Sep 2026). */
export function membershipEndedNotice(input: PatronNoticeInput): PatronNotice {
  const f = first(input.playerName);
  return {
    subject: `Your membership with ${f} has ended`,
    paragraphs: [
      `${input.playerName}'s patron page has been paused for ${PAUSED_MEMBERSHIP_DAYS} days, so your membership has now ended. Nothing more will be charged, and there's nothing you need to do.`,
      `Thank you for backing ${f}. If the page opens again, you're welcome back any time.`,
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
