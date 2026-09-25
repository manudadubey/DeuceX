import type { SendTimeOption } from '@deucex/agents';

// PRD-05's consequence sentences (M-GATE-2), in one place so the agent page's
// two-step confirm and the dashboard card's one tap (worksheet 8) always say
// the same thing: how many patrons, who, when, and that it can't be recalled.

export function patrons(n: number): string {
  return `${n} ${n === 1 ? 'patron' : 'patrons'}`;
}

/** "tomorrow at 07:00 your time", "Thursday at 07:00, before the Poznań deadline". */
export function whenPhrase(option: SendTimeOption): string {
  if (option.kind === 'tomorrow') return 'tomorrow at 07:00 your time';
  if (option.kind === 'deadline') {
    const [day, rest] = option.label.split(' · ');
    return `${day} at 07:00, ${rest}`;
  }
  return 'now';
}

/** C-AC-5: "Send to 11 patrons now?" / "Schedule for 11 patrons · tomorrow at 07:00 your time?" */
export function confirmTitle(n: number, option: SendTimeOption): string {
  return option.kind === 'now'
    ? `Send to ${patrons(n)} now?`
    : `Schedule for ${patrons(n)} · ${whenPhrase(option)}?`;
}

/** C-AC-5: "Emails can't be unsent. The teaser goes on your public profile too." */
export function confirmDetail(teaser: boolean, scheduled: boolean): string {
  const teaserLine = teaser
    ? 'The teaser goes on your public profile too.'
    : 'The teaser stays off your profile.';
  return scheduled
    ? `You can cancel until then; once sent, emails can't be unsent. ${teaserLine}`
    : `Emails can't be unsent. ${teaserLine}`;
}

/** Worksheet 8: printed on the dashboard card next to its one-tap Approve & publish. */
export function dashboardConsequence(n: number): string {
  return `Sends to ${patrons(n)} now, in your name. It cannot be recalled once sent.`;
}

export const SKIP_REASONS = ['nothing to say yet', 'too soon', "I'll write it myself"] as const;

/** The Free tier's dimmed sample (C-AC-12, M-TIER-1): real layout, no real data. */
export const SAMPLE_UPDATE = {
  subject: 'Three set points, one lesson',
  body: `I lost 6-4 3-6 6-7(5) to Kovalenko yesterday and I'm oddly fine with it.

Not because losing is fine. It isn't, and a Q2 loss is a week of costs for a first-round cheque. But I had three set points in the second and took the third one by playing the point I'd practised all week.

The tiebreak is the part I'm keeping. I rushed two second serves at 5-5, and my coach and I already know what next week looks like because of it.

Thank you for being here for the weeks that don't make a highlight reel.`,
};
