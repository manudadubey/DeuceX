import { toneSummary } from './checks';
import type { VoiceExample } from './draft';

// PRD-05 section 3 Inputs and section 6: the voice profile is the three
// best-opened past updates (the profile bio joins them once PRD-11's profile
// editor exists; there is no bio column yet). Before any update has an open
// rate, the most recent published updates stand in.

export interface PastUpdate {
  id: string;
  subject: string;
  body: string;
  sentAt: string;
  /** Whole percent, null until the first open event. */
  openRate: number | null;
}

export const VOICE_EXAMPLE_COUNT = 3;

export function pickVoiceExamples(updates: readonly PastUpdate[]): PastUpdate[] {
  return [...updates]
    .sort((a, b) => {
      const ra = a.openRate ?? -1;
      const rb = b.openRate ?? -1;
      if (rb !== ra) return rb - ra;
      return b.sentAt.localeCompare(a.sentAt);
    })
    .slice(0, VOICE_EXAMPLE_COUNT);
}

export function toVoiceExamples(updates: readonly PastUpdate[]): VoiceExample[] {
  return updates.map((u) => ({ subject: u.subject, body: u.body }));
}

/** The Voice profile control's line: "3 example updates, tone: direct, short sentences, no exclamation marks". */
export function voiceProfileLine(examples: readonly PastUpdate[]): string {
  if (examples.length === 0) {
    return 'No published updates yet · drafting from how you talk in your notes';
  }
  const n = examples.length;
  return `${n} example ${n === 1 ? 'update' : 'updates'}, tone: ${toneSummary(examples.map((e) => e.body))}`;
}
