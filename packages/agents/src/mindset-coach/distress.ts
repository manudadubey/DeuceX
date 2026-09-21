import type { MindsetCheckIn, MindsetNote } from './types';

// M-PRIV-3 / MC-16 / PRD-06 section 7's distress rule. Evaluated on every
// run before anything else: if it fires, no insight, no pattern update, no
// coach-link content — only the someone-to-call card. Three independent
// signals; any one is enough.

// English only for release 1: PRD-06 section 12 lists "the distress
// lexicon needs review per language" as an open question for clinical
// review, not something to guess at per-language here. Deliberately narrow
// (self-harm, hopelessness, not wanting to continue) rather than broad
// negative-sentiment words, which would false-positive on ordinary
// frustration ("I want to quit this tournament") that the mood/tag system
// already captures without escalating to a safety response.
const DISTRESS_LEXICON_EN: readonly RegExp[] = [
  /\bkill myself\b/i,
  /\bend it all\b/i,
  /\bend my life\b/i,
  /\bsuicid\w*/i,
  /\bself[- ]harm/i,
  /\bcan'?t go on\b/i,
  /\bdon'?t want to (be here|continue|keep going|live)\b/i,
  /\bno point (in )?(going on|continuing|living)\b/i,
  /\bwant(ed)? to disappear\b/i,
  /\bhopeless\b/i,
];

export function matchesDistressLexicon(text: string): boolean {
  return DISTRESS_LEXICON_EN.some((pattern) => pattern.test(text));
}

export type DistressSignal =
  | 'lexicon_note'
  | 'lexicon_checkin'
  | 'three_consecutive_low_checkins'
  | 'frustrated_flat_with_sleep';

export interface DistressEvaluation {
  fired: boolean;
  signals: DistressSignal[];
}

// "three consecutive check-ins are 1": the three most recently dated
// check-ins, not necessarily on consecutive calendar days (a check-in isn't
// guaranteed daily) — "consecutive" reads as consecutive check-ins, the same
// way MC-13's "three notToday in seven days" counts events, not days.
function threeConsecutiveLowCheckIns(checkins: readonly MindsetCheckIn[]): boolean {
  const sorted = [...checkins].sort((a, b) => b.date.localeCompare(a.date));
  return sorted.length >= 3 && sorted.slice(0, 3).every((c) => c.value === 1);
}

// "five of the last seven notes are Frustrated or Flat with a Sleep tag on
// at least three."
function frustratedFlatWithSleep(notes: readonly MindsetNote[]): boolean {
  const sorted = [...notes].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  const lastSeven = sorted.slice(0, 7);
  if (lastSeven.length < 7) return false;
  const low = lastSeven.filter((n) => n.mood === 'frustrated' || n.mood === 'flat');
  const sleepTagged = low.filter((n) => n.tags.includes('Sleep'));
  return low.length >= 5 && sleepTagged.length >= 3;
}

export interface EvaluateDistressInput {
  notes: readonly MindsetNote[];
  checkins: readonly MindsetCheckIn[];
}

export function evaluateDistress(input: EvaluateDistressInput): DistressEvaluation {
  const signals: DistressSignal[] = [];

  if (input.notes.some((n) => n.transcript && matchesDistressLexicon(n.transcript))) {
    signals.push('lexicon_note');
  }
  if (input.checkins.some((c) => c.sentence && matchesDistressLexicon(c.sentence))) {
    signals.push('lexicon_checkin');
  }
  if (threeConsecutiveLowCheckIns(input.checkins)) {
    signals.push('three_consecutive_low_checkins');
  }
  if (frustratedFlatWithSleep(input.notes)) {
    signals.push('frustrated_flat_with_sleep');
  }

  return { fired: signals.length > 0, signals };
}
