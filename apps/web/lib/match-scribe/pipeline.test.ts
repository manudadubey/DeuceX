import { describe, expect, it } from 'vitest';
import { pipelineSteps, usedBy, type PipelineNote } from './pipeline';

const base: PipelineNote = {
  status: 'saved',
  ctx: 'match',
  audio_uploaded_at: '2026-09-11T08:42:00Z',
  transcript_confirmed_at: '2026-09-11T08:44:00Z',
  lang: 'en',
  mood: 'confident',
  extraction: { valid: true },
};
const at = (iso: string) => new Date(iso);

describe('pipelineSteps (PRD-02 S-19)', () => {
  it('shows transcription in progress and nothing downstream done while transcribing', () => {
    const steps = pipelineSteps(
      {
        ...base,
        status: 'transcribing',
        transcript_confirmed_at: null,
        extraction: null,
        mood: null,
      },
      null,
      null,
    );
    expect(steps.map((s) => s.state)).toEqual(['done', 'now', 'next', 'next', 'next']);
    expect(steps[1]!.title).toBe('Transcribing');
  });

  it('marks transcription and extraction failures as distinct states', () => {
    expect(pipelineSteps({ ...base, status: 'failed_transcription' }, null, null)[1]!.state).toBe(
      'failed',
    );
    const failedRead = pipelineSteps(
      { ...base, status: 'failed_extraction', extraction: { valid: false } },
      null,
      null,
    );
    expect(failedRead[1]!.state).toBe('done');
    expect(failedRead[2]!.state).toBe('failed');
  });

  it('reads Soon for the content draft just after a save, and Tomorrow for the insight', () => {
    const steps = pipelineSteps(base, null, null, at('2026-09-11T08:50:00Z'));
    expect(steps[3]!.badge).toBe('Tomorrow');
    expect(steps[4]!.badge).toBe('Soon');
  });

  it('does not promise tomorrow for a note saved days ago with no insight since', () => {
    const step = pipelineSteps(base, null, null, at('2026-09-14T08:00:00Z'))[3]!;
    expect(step).toMatchObject({ badge: 'None', detail: 'No insight delivered since this note' });
  });

  it('asks for approval once a draft is waiting, linking to the Content Agent', () => {
    const steps = pipelineSteps(base, { status: 'draft', subject: 'Three set points' }, null);
    expect(steps[4]).toMatchObject({ state: 'now', badge: 'Approve', href: '/agent/content' });
  });

  it('only credits a Mindset insight delivered on or after the save date', () => {
    expect(pipelineSteps(base, null, { date: '2026-09-10', pattern_flag: null })[3]!.state).toBe(
      'next',
    );
    expect(
      pipelineSteps(base, null, { date: '2026-09-12', pattern_flag: 'second serve' })[3],
    ).toMatchObject({ state: 'done', detail: 'Delivered 2026-09-12 · pattern flag: second serve' });
  });

  it('marks the read step skipped for a saved note that was typed by hand', () => {
    const step = pipelineSteps({ ...base, extraction: null }, null, null)[2]!;
    expect(step).toMatchObject({ state: 'done', badge: 'Skipped' });
  });

  it('names no vendor or model in any step', () => {
    const text = JSON.stringify(pipelineSteps(base, null, null));
    expect(text).not.toMatch(/whisper|openai|gpt|cloudflare|r2\b/i);
  });
});

describe('usedBy', () => {
  it('lists only agents that demonstrably read the note', () => {
    expect(usedBy(base, false, null)).toEqual([]);
    expect(usedBy(base, true, '2026-09-12')).toEqual(['Mindset', 'Content draft']);
    expect(usedBy(base, false, '2026-09-10')).toEqual([]);
  });
});
