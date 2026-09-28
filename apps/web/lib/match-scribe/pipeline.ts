// "What happens to your note" (PRD-02 section 4.3, S-19): the real status of
// each downstream step for the player's latest note, derived from rows that
// actually exist, never assumed. Two departures from the prototype, both
// because this build works differently: there is no separate 02:00 UTC
// overnight analysis (mood and result are read right after transcription,
// step 1.2), and the Mindset Coach runs in the 07:00 local morning run
// (step 5.2). Copy names no vendor or model (CLAUDE.md conventions).

export type StepState = 'done' | 'now' | 'next' | 'failed';

export interface PipelineStep {
  key: 'uploaded' | 'transcribed' | 'read' | 'mindset' | 'content';
  state: StepState;
  title: string;
  detail: string;
  badge: string;
  href?: string;
}

export interface PipelineNote {
  status: string;
  ctx: string;
  audio_uploaded_at: string | null;
  transcript_confirmed_at: string | null;
  lang: string | null;
  mood: string | null;
  extraction: unknown;
}

export interface PipelineContentDraft {
  status: string;
  subject: string;
}

export interface PipelineInsight {
  date: string;
  pattern_flag: string | null;
}

const CONTENT_WAITING = new Set(['draft', 'scheduled']);
const CONTENT_WORKING = new Set(['queued', 'drafting']);

function extractionValid(extraction: unknown): boolean | null {
  if (!extraction || typeof extraction !== 'object') return null;
  const valid = (extraction as { valid?: unknown }).valid;
  return typeof valid === 'boolean' ? valid : null;
}

function localDay(at: Date): string {
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
}

export function pipelineSteps(
  note: PipelineNote,
  content: PipelineContentDraft | null,
  insight: PipelineInsight | null,
  now: Date = new Date(),
): PipelineStep[] {
  const saved = note.status === 'saved';
  const transcribing = note.status === 'transcribing' || note.status === 'uploaded';
  const failedTranscription = note.status === 'failed_transcription';

  const uploaded: PipelineStep = note.audio_uploaded_at
    ? {
        key: 'uploaded',
        state: 'done',
        title: 'Uploaded',
        detail: 'Stored privately, only you can reach it',
        badge: 'Done',
      }
    : {
        key: 'uploaded',
        state: 'now',
        title: 'Uploading',
        detail: 'Waiting for signal',
        badge: 'Now',
      };

  const transcribed: PipelineStep = transcribing
    ? {
        key: 'transcribed',
        state: 'now',
        title: 'Transcribing',
        detail: 'Usually under 20 seconds',
        badge: 'Now',
      }
    : failedTranscription
      ? {
          key: 'transcribed',
          state: 'failed',
          title: "Transcription didn't finish",
          detail: 'Type the note yourself, or Retry on the recorder',
          badge: 'Retry',
        }
      : {
          key: 'transcribed',
          state: 'done',
          title: 'Transcribed',
          detail: note.lang ? `Language: ${note.lang}` : 'Transcript ready',
          badge: 'Done',
        };

  const valid = extractionValid(note.extraction);
  const read: PipelineStep =
    note.status === 'failed_extraction' || valid === false
      ? {
          key: 'read',
          state: 'failed',
          title: "Couldn't read a result",
          detail: 'Saved with the transcript and context only',
          badge: 'Check',
        }
      : valid === true
        ? {
            key: 'read',
            state: 'done',
            title: 'Read for result and mood',
            detail: note.mood ? `Mood: ${note.mood}` : 'No mood proposed',
            badge: 'Done',
          }
        : saved
          ? {
              key: 'read',
              state: 'done',
              title: 'Read for result and mood',
              detail: 'Skipped: you typed this one, so the fields are yours',
              badge: 'Skipped',
            }
          : {
              key: 'read',
              state: transcribing ? 'next' : 'now',
              title: 'Read for result and mood',
              detail: 'Right after the transcript',
              badge: transcribing ? 'Next' : 'Now',
            };

  const savedDate = note.transcript_confirmed_at?.slice(0, 10) ?? null;
  const mindset: PipelineStep =
    saved && insight && savedDate && insight.date >= savedDate
      ? {
          key: 'mindset',
          state: 'done',
          title: 'Mindset Coach insight',
          detail: insight.pattern_flag
            ? `Delivered ${insight.date} · pattern flag: ${insight.pattern_flag}`
            : `Delivered ${insight.date}`,
          badge: 'Done',
          href: '/agent/mindset',
        }
      : !saved
        ? {
            key: 'mindset',
            state: 'next',
            title: 'Mindset Coach insight',
            detail: 'After you save',
            badge: 'Later',
          }
        : savedDate && savedDate < localDay(now)
          ? {
              key: 'mindset',
              state: 'next',
              title: 'Mindset Coach insight',
              detail: 'No insight delivered since this note',
              badge: 'None',
              href: '/agent/mindset',
            }
          : {
              key: 'mindset',
              state: 'next',
              title: 'Mindset Coach insight',
              detail: '07:00 your time',
              badge: 'Tomorrow',
            };

  let contentStep: PipelineStep;
  if (content && CONTENT_WAITING.has(content.status)) {
    contentStep = {
      key: 'content',
      state: 'now',
      title: 'Content Agent draft',
      detail: `"${content.subject}" · waiting for you`,
      badge: 'Approve',
      href: '/agent/content',
    };
  } else if (content && content.status === 'published') {
    contentStep = {
      key: 'content',
      state: 'done',
      title: 'Content Agent draft',
      detail: `"${content.subject}" · sent to your patrons`,
      badge: 'Done',
      href: '/agent/content',
    };
  } else if (content && (content.status === 'skipped' || content.status === 'superseded')) {
    contentStep = {
      key: 'content',
      state: 'done',
      title: 'Content Agent draft',
      detail: content.status === 'skipped' ? 'You skipped this one' : 'Replaced by a newer draft',
      badge: 'Done',
    };
  } else if (content && CONTENT_WORKING.has(content.status)) {
    contentStep = {
      key: 'content',
      state: 'next',
      title: 'Content Agent draft',
      detail: 'Within 30 minutes · you approve before it goes out',
      badge: 'Soon',
    };
  } else {
    const minutesSinceSave = note.transcript_confirmed_at
      ? (now.getTime() - new Date(note.transcript_confirmed_at).getTime()) / 60_000
      : 0;
    contentStep = {
      key: 'content',
      state: 'next',
      title: 'Content Agent draft',
      detail: !saved
        ? 'After you save'
        : minutesSinceSave <= 45
          ? 'Within 30 minutes · you approve before it goes out'
          : 'No draft from this note',
      badge: saved && minutesSinceSave <= 45 ? 'Soon' : saved ? 'None' : 'Later',
    };
  }

  return [uploaded, transcribed, read, mindset, contentStep];
}

/** Which agents have demonstrably read a note, for "Used by" in Past notes (S-12). */
export function usedBy(
  note: { transcript_confirmed_at: string | null },
  hasContentDraft: boolean,
  latestDeliveredInsightDate: string | null,
): string[] {
  const used: string[] = [];
  const savedDate = note.transcript_confirmed_at?.slice(0, 10);
  if (savedDate && latestDeliveredInsightDate && latestDeliveredInsightDate >= savedDate) {
    used.push('Mindset');
  }
  if (hasContentDraft) used.push('Content draft');
  return used;
}
