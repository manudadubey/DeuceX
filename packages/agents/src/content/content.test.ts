import { describe, expect, it } from 'vitest';
import { AgentValidationError } from '@deucex/actions';
import {
  applyFix,
  countLine,
  createMockContentDraftClient,
  createMockContentRewriteClient,
  DRAFT_MAX_WORDS,
  DRAFT_MIN_WORDS,
  draftDueAt,
  generateContentDraft,
  pickVoiceExamples,
  proposeRecipients,
  readMinutes,
  recipientCount,
  recipientLine,
  rewriteContent,
  runChecks,
  sendTimeOptions,
  teaserText,
  voiceProfileLine,
  wordCount,
  type CheckContext,
  type ContentDraftInput,
  type ContentDraftModelClient,
  type DraftNote,
  type RecipientTier,
} from './index';

// Arya's note of 11 Sep at 18:42 (C-AC-1): L 6-4 3-6 6-7(5) vs Kovalenko, mood confident.
const KOVALENKO_NOTE: DraftNote = {
  id: 'note-1',
  ctx: 'match',
  recordedAt: '2026-09-11T16:42:00Z',
  transcript:
    'Lost to Kovalenko in the third set tiebreak. Had three set points in the second, took one. Marko and I think the second serve is the thing. Oddly fine with it.',
  result: 'L 6-4 3-6 6-7(5)',
  opponent: 'Kovalenko',
  round: 'Q2',
  surface: 'clay',
  mood: 'confident',
  tags: ['tiebreak', 'second serve'],
};

function input(overrides: Partial<ContentDraftInput> = {}): ContentDraftInput {
  return {
    lang: 'en',
    playerFirstName: 'Arya',
    note: KOVALENKO_NOTE,
    earlierNotes: [],
    examples: [],
    wantsPracticeSection: true,
    privateNames: [],
    nextDeadline: null,
    ...overrides,
  };
}

function ctx(overrides: Partial<CheckContext> = {}): CheckContext {
  return {
    examples: [],
    pastUpdates: [],
    privateNames: [],
    people: [],
    opponent: 'Kovalenko',
    ...overrides,
  };
}

/** A client returning a fixed sequence of raw outputs. */
function scripted(...outputs: unknown[]): ContentDraftModelClient & { calls: number } {
  const client = {
    calls: 0,
    async complete() {
      const raw = outputs[Math.min(client.calls, outputs.length - 1)];
      client.calls += 1;
      return { raw, usage: { inputTokens: 100, outputTokens: 50 } };
    },
  };
  return client;
}

describe('generateContentDraft', () => {
  it('turns the note fixture into a 150 to 250 word draft that passes all four checks (build plan: done when)', async () => {
    const { draft } = await generateContentDraft(createMockContentDraftClient(), input());
    const words = wordCount(draft.body);
    expect(words).toBeGreaterThanOrEqual(DRAFT_MIN_WORDS);
    expect(words).toBeLessThanOrEqual(DRAFT_MAX_WORDS);
    expect(draft.body.split('\n\n')[0]).toContain('6-4 3-6 6-7');
    expect(draft.altSubjects).toHaveLength(2);
    expect(draft.practiceSection).not.toBeNull();
    const checks = runChecks(draft.body, ctx({ people: draft.people }));
    expect(checks.map((c) => c.state)).toEqual(['pass', 'pass', 'pass', 'pass']);
  });

  it('retries once with the problem named, then succeeds', async () => {
    const good = (
      await createMockContentDraftClient().complete({
        system: '',
        user: 'Result: L 6-4 3-6 6-7(5)\nOpponent: Kovalenko',
      })
    ).raw as { paragraphs: string[] };
    const tooShort = { ...good, paragraphs: ['I lost 6-4 3-6 6-7(5). That is all.'] };
    const client = scripted(tooShort, good);
    const { draft } = await generateContentDraft(client, input());
    expect(client.calls).toBe(2);
    expect(wordCount(draft.body)).toBeGreaterThanOrEqual(DRAFT_MIN_WORDS);
  });

  it('fails after two unusable outputs, so the editor opens as "Write it yourself" (C-AC-11)', async () => {
    const client = scripted({ subject: 'x' }, { nonsense: true });
    await expect(generateContentDraft(client, input())).rejects.toBeInstanceOf(
      AgentValidationError,
    );
    expect(client.calls).toBe(2);
  });

  it('rejects an em dash, an exclamation mark, and a first paragraph without the score', async () => {
    const good = (
      await createMockContentDraftClient().complete({
        system: '',
        user: 'Result: L 6-4 3-6 6-7(5)\nOpponent: Kovalenko',
      })
    ).raw as { paragraphs: string[] };
    for (const bad of [
      {
        ...good,
        paragraphs: [good.paragraphs[0]! + ' It hurt — a lot.', ...good.paragraphs.slice(1)],
      },
      {
        ...good,
        paragraphs: [good.paragraphs[0]! + ' What a match!', ...good.paragraphs.slice(1)],
      },
      { ...good, paragraphs: ['I lost to Kovalenko yesterday.', ...good.paragraphs.slice(1)] },
    ]) {
      await expect(generateContentDraft(scripted(bad), input())).rejects.toBeInstanceOf(
        AgentValidationError,
      );
    }
  });

  it('drops the opponent from the people list', async () => {
    const good = (
      await createMockContentDraftClient().complete({
        system: '',
        user: 'Result: L 6-4 3-6 6-7(5)\nOpponent: Kovalenko',
      })
    ).raw as Record<string, unknown>;
    const withPeople = {
      ...good,
      people: [
        { name: 'Kovalenko', role: 'other' },
        { name: 'Marko', role: 'coach' },
      ],
    };
    const { draft } = await generateContentDraft(scripted(withPeople), input());
    expect(draft.people).toEqual([{ name: 'Marko', role: 'coach' }]);
  });
});

describe('checks', () => {
  it('C-AC-3: warns on "Marko", and Fix changes "Marko and I" to "My coach and I"', () => {
    const body =
      'I lost 6-4 3-6 6-7(5) to Kovalenko yesterday.\n\nMarko and I think the second serve is the thing.';
    const c = ctx({
      people: [{ name: 'Marko', role: 'coach' }],
      pastUpdates: ['I won. My coach was pleased.'],
    });
    const coach = runChecks(body, c).find((x) => x.kind === 'coach')!;
    expect(coach.state).toBe('warn');
    expect(coach.title).toBe('Names your coach');
    expect(coach.reason).toBe(
      'You\'ve kept your coach unnamed in every past update. "Marko" appears once.',
    );
    const fixed = applyFix('coach', body, c);
    expect(fixed).toContain('My coach and I think');
    const after = runChecks(fixed, { ...c, fixedKinds: ['coach'] }).find(
      (x) => x.kind === 'coach',
    )!;
    expect(after.state).toBe('pass');
    expect(after.title).toBe('Coach unnamed');
    expect(after.reason).toBe('Changed to "my coach", as in your past updates.');
  });

  it('does not warn on a coach name the player has already used in a published update', () => {
    const c = ctx({ privateNames: ['Marko'], pastUpdates: ['Marko and I are in Genoa.'] });
    expect(runChecks('I trained with Marko.', c).find((x) => x.kind === 'coach')!.state).toBe(
      'pass',
    );
  });

  it('section 7: "a week of costs" passes the money check; figures, runway and the physio warn', () => {
    const generic = 'I lost, and a Q2 loss in Genoa is a week of costs for a first-round cheque.';
    expect(runChecks(generic, ctx()).find((x) => x.kind === 'private')!.state).toBe('pass');
    for (const text of [
      'The trip cost A$1,360 all in.',
      'My runway is shorter than I would like.',
      'I spent the morning with the physio.',
      'It cost 900 euros to get here.',
    ]) {
      expect(runChecks(text, ctx()).find((x) => x.kind === 'private')!.state).toBe('warn');
    }
  });

  it('Fix on the money check takes out only the offending sentence', () => {
    const body = 'I lost 6-4 6-4. My runway is short. I am still hungry.';
    const fixed = applyFix('private', body, ctx());
    expect(fixed).toBe('I lost 6-4 6-4. I am still hungry.');
    expect(runChecks(fixed, ctx()).find((x) => x.kind === 'private')!.state).toBe('pass');
  });

  it('warns on commentary about the opponent and Fix removes it', () => {
    const body =
      'I lost to Kovalenko 6-4 6-4. Kovalenko was lucky on the big points. I learned a lot.';
    expect(runChecks(body, ctx()).find((x) => x.kind === 'opponent')!.state).toBe('warn');
    const fixed = applyFix('opponent', body, ctx());
    expect(fixed).toBe('I lost to Kovalenko 6-4 6-4. I learned a lot.');
    expect(runChecks(fixed, ctx()).find((x) => x.kind === 'opponent')!.state).toBe('pass');
  });

  it('warns on exclamation marks the past updates never use, and Fix calms them', () => {
    const c = ctx({ examples: ['I won. It was fine.'] });
    const body = 'I won 6-2 6-2! Best week in months.';
    expect(runChecks(body, c)[0]!.state).toBe('warn');
    expect(applyFix('voice', body, c)).toBe('I won 6-2 6-2. Best week in months.');
  });
});

describe('recipients and send time', () => {
  const tiers: RecipientTier[] = [
    { id: 'c', position: 1, name: 'Courtside', activeCount: 8 },
    { id: 'l', position: 2, name: 'Locker Room', activeCount: 3 },
    { id: 'i', position: 3, name: 'Inside Track', activeCount: 1 },
  ];

  it('C-AC-4: the count line follows the selected tiers, and "No one selected" when empty', () => {
    expect(recipientLine(tiers, ['c', 'l'])).toBe('11 patrons · Courtside + Locker Room');
    expect(recipientLine(tiers, ['c', 'l', 'i'])).toBe(
      '12 patrons · Courtside + Locker Room + Inside Track',
    );
    expect(recipientLine(tiers, [])).toBe('No one selected');
    expect(recipientCount(tiers, [])).toBe(0);
  });

  it('C-8/C-9: proposes every tier with patrons, with a reason naming the practice section', () => {
    const proposal = proposeRecipients(tiers, true);
    expect(proposal.map((p) => [p.tierId, p.selected, p.reason])).toEqual([
      ['c', true, 'Every update · 8 people'],
      ['l', true, 'Adds the practice notes section · 3 people'],
      ['i', true, 'Adds the practice notes section · 1 person'],
    ]);
    expect(proposeRecipients([{ ...tiers[0]!, activeCount: 0 }], false)[0]).toEqual({
      tierId: 'c',
      selected: false,
      reason: 'No patrons on this tier yet',
    });
  });

  it('C-AC-7: "Tomorrow · 07:00 your time" is 07:00 Europe/Vienna the next day', () => {
    const now = new Date('2026-09-12T06:00:00Z');
    const options = sendTimeOptions(now, 'Europe/Vienna', null);
    expect(options.map((o) => o.kind)).toEqual(['now', 'tomorrow']);
    expect(options[1]!.sendAt).toBe('2026-09-13T05:00:00.000Z');
  });

  it('C-12: offers the deadline day only inside seven days and before the deadline', () => {
    const now = new Date('2026-09-12T06:00:00Z');
    const within = sendTimeOptions(now, 'Europe/Vienna', {
      tournamentName: 'Poznań',
      deadlineAt: '2026-09-17T10:00:00Z',
    });
    expect(within[2]).toEqual({
      kind: 'deadline',
      label: 'Thursday · before the Poznań deadline',
      sendAt: '2026-09-17T05:00:00.000Z',
    });
    const tooFar = sendTimeOptions(now, 'Europe/Vienna', {
      tournamentName: 'Poznań',
      deadlineAt: '2026-09-25T10:00:00Z',
    });
    expect(tooFar).toHaveLength(2);
  });

  it('C-1: the draft window is 30 minutes, the next 06:30 local, or never', () => {
    const saved = new Date('2026-09-11T16:42:00Z'); // 18:42 in Vienna
    expect(draftDueAt('thirty_minutes', saved, 'Europe/Vienna')!.toISOString()).toBe(
      '2026-09-11T17:12:00.000Z',
    );
    expect(draftDueAt('next_morning', saved, 'Europe/Vienna')!.toISOString()).toBe(
      '2026-09-12T04:30:00.000Z',
    );
    expect(draftDueAt('manual', saved, 'Europe/Vienna')).toBeNull();
  });
});

describe('text arithmetic (section 7)', () => {
  it('reading time rounds words / 160 with a floor of one minute', () => {
    expect(readMinutes(197)).toBe(1);
    expect(readMinutes(390)).toBe(2);
    expect(readMinutes(512)).toBe(3);
    expect(countLine('one two three')).toBe('3 words · about 1 minute to read');
  });

  it('the teaser is the first paragraph, capped at 400 characters', () => {
    expect(teaserText('First para.\n\nSecond para.')).toBe('First para.');
    const long = `${'word '.repeat(120)}end.`;
    const teaser = teaserText(long);
    expect(teaser.length).toBeLessThanOrEqual(400);
    expect(teaser.endsWith('…')).toBe(true);
  });
});

describe('rewrite (C-5, C-AC-9)', () => {
  it('Shorter returns a shorter body that keeps the score first', async () => {
    const { draft } = await generateContentDraft(createMockContentDraftClient(), input());
    const { body } = await rewriteContent(createMockContentRewriteClient(), {
      variant: 'shorter',
      lang: 'en',
      body: draft.body,
      result: KOVALENKO_NOTE.result,
    });
    expect(wordCount(body)).toBeLessThan(wordCount(draft.body));
    expect(body.split('\n\n')[0]).toContain('6-4 3-6 6-7');
  });
});

describe('voice profile', () => {
  it('uses the best-opened updates first and summarises their tone', () => {
    const examples = pickVoiceExamples([
      {
        id: 'a',
        subject: 'A',
        body: 'I won. Short one.',
        sentAt: '2026-08-01T00:00:00Z',
        openRate: 64,
      },
      {
        id: 'b',
        subject: 'B',
        body: 'I lost. It happens.',
        sentAt: '2026-08-10T00:00:00Z',
        openRate: 83,
      },
      {
        id: 'c',
        subject: 'C',
        body: 'Travel day.',
        sentAt: '2026-08-20T00:00:00Z',
        openRate: null,
      },
      { id: 'd', subject: 'D', body: 'Rest.', sentAt: '2026-07-20T00:00:00Z', openRate: 40 },
    ]);
    expect(examples.map((e) => e.id)).toEqual(['b', 'a', 'd']);
    expect(voiceProfileLine(examples)).toBe(
      '3 example updates, tone: direct, short sentences, no exclamation marks',
    );
    expect(voiceProfileLine([])).toBe(
      'No published updates yet · drafting from how you talk in your notes',
    );
  });
});
