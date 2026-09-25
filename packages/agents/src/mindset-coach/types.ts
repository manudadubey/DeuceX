import type { NoteCtx, NoteMood } from '@deucex/db';

// Shared input shapes across rules.ts, distress.ts and generate-insight.ts —
// a trimmed, agent-facing view of the notes/check_ins columns (step 1.1),
// not the full DB row.

export interface MindsetConditionStamp {
  firstServePct: number;
  tempC: number;
  humidityPct: number;
}

export interface MindsetNote {
  id: string;
  recordedAt: string;
  ctx: NoteCtx;
  result: string | null;
  mood: NoteMood | null;
  tags: string[];
  transcript: string | null;
  summary: string | null;
  /** PRD-08's stamp (step 3.3); always null until that step ships — see rules.ts's detectConditionsFirstServe. */
  cond: MindsetConditionStamp | null;
}

export interface MindsetCheckIn {
  date: string;
  value: 1 | 2 | 3 | 4 | 5;
  sentence: string | null;
}
