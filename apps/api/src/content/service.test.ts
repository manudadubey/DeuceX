import { describe, expect, it } from 'vitest';
import type { AgentRunInsert, AgentRunsDb, ApprovalGateDb, ApprovalRecord } from '@deucex/actions';
import { ApprovalNotFoundError } from '@deucex/actions';
import type { EmailClient, SendEmailInput } from '@deucex/actions/account';
import {
  createMockContentDraftClient,
  createMockContentRewriteClient,
  wordCount,
  type ContentDraftModelClient,
} from '@deucex/agents';
import { contentPublishPayload } from '@deucex/shared';
import { MemoryContentStore } from './memory-store';
import {
  fixCheck,
  latestTeaser,
  loadContentPage,
  notePhrase,
  onNoteSaved,
  publishDraft,
  removeTeaser,
  rewriteDraft,
  runContentTick,
  runDueDrafts,
  saveDraft,
  skipDraft,
  startManualDraft,
  undoSkip,
  UpdateStateError,
  type ContentDeps,
} from './service';

const PLAYER = 'player-1';
// 11 Sep 2026, 18:42 in Vienna (C-AC-1).
const SAVED = new Date('2026-09-11T16:42:00Z');

function world(opts: { tier?: string; draftClient?: ContentDraftModelClient } = {}) {
  const store = new MemoryContentStore();
  store.players.push({
    id: PLAYER,
    name: 'Arya Dubey',
    email: 'arya@example.com',
    tier: opts.tier ?? 'pro',
    timezone: 'Europe/Vienna',
    patronLanguage: 'en',
    contentWindow: 'thirty_minutes',
    privateNames: [],
    profileTeaser: true,
  });
  store.tiers.push(
    { id: 'court', playerId: PLAYER, position: 1, name: 'Courtside' },
    { id: 'locker', playerId: PLAYER, position: 2, name: 'Locker Room' },
    { id: 'inside', playerId: PLAYER, position: 3, name: 'Inside Track' },
  );
  for (let i = 0; i < 8; i += 1) {
    store.patrons.push({
      id: `c${i}`,
      playerId: PLAYER,
      tierId: 'court',
      status: 'active',
      email: `c${i}@example.com`,
      since: '2026-01-01T00:00:00Z',
      opens: [],
    });
  }
  for (let i = 0; i < 3; i += 1) {
    store.patrons.push({
      id: `l${i}`,
      playerId: PLAYER,
      tierId: 'locker',
      status: 'active',
      email: `l${i}@example.com`,
      since: '2026-01-01T00:00:00Z',
      opens: [],
    });
  }
  store.notes.push({
    playerId: PLAYER,
    id: 'note-1',
    ctx: 'match',
    recordedAt: SAVED.toISOString(),
    durSeconds: 52,
    transcript: 'Lost to Kovalenko in a third set tiebreak. Oddly fine with it.',
    result: 'L 6-4 3-6 6-7(5)',
    opponent: 'Kovalenko',
    round: 'Q2',
    surface: 'clay',
    mood: 'confident',
    tags: [],
  });

  const approvals: ApprovalRecord[] = [];
  const claimed: string[] = [];
  const gateDb: ApprovalGateDb = {
    async getApproval(id, playerId) {
      return approvals.find((a) => a.id === id && a.playerId === playerId) ?? null;
    },
    async claimApproval({ approvalId }) {
      if (claimed.includes(approvalId)) return false;
      claimed.push(approvalId);
      return true;
    },
  };
  const sent: SendEmailInput[] = [];
  const email: EmailClient = {
    async sendEmail(input) {
      sent.push(input);
      return { id: `email-${sent.length}` };
    },
  };
  const runs: AgentRunInsert[] = [];
  const agentRuns: AgentRunsDb = {
    async insertAgentRun(r) {
      runs.push(r);
    },
  };
  const events = new Map<string, string>();
  let now = SAVED;
  const deps: ContentDeps = {
    store,
    draftClient: opts.draftClient ?? createMockContentDraftClient(),
    rewriteClient: createMockContentRewriteClient(),
    agentRuns,
    email,
    statusClient: {
      async getLastEvent(id) {
        return events.get(id) ?? 'delivered';
      },
    },
    gateDb,
    actionsDb: store.actionsDb(),
    appBaseUrl: 'https://deucex.vercel.app',
    now: () => now,
  };
  const approve = async (updateId: string, id = `approval-${approvals.length + 1}`) => {
    const u = (await store.getUpdate(PLAYER, updateId))!;
    approvals.push({
      id,
      playerId: PLAYER,
      actionType: 'content_publish',
      payload: contentPublishPayload({
        updateId: u.id,
        subject: u.subject,
        body: u.body,
        practiceSection: u.practiceSection,
        tierIds: u.tierIds,
        sendAt: u.sendAt,
        teaser: u.teaser,
      }),
    });
    return id;
  };
  return {
    store,
    deps,
    sent,
    runs,
    claimed,
    events,
    approve,
    setNow: (d: Date) => {
      now = d;
    },
  };
}

async function draftedWorld() {
  const w = world();
  await onNoteSaved(w.deps, { playerId: PLAYER, noteId: 'note-1' });
  w.setNow(new Date(SAVED.getTime() + 31 * 60 * 1000));
  await runDueDrafts(w.deps);
  const draft = (await w.store.getOpenDraft(PLAYER))!;
  return { ...w, draft };
}

describe('the trigger (C-1)', () => {
  it('queues a draft 30 minutes after a saved match note with a result, and not before', async () => {
    const w = world();
    await onNoteSaved(w.deps, { playerId: PLAYER, noteId: 'note-1' });
    const queued = (await w.store.getOpenDraft(PLAYER))!;
    expect(queued.status).toBe('queued');
    expect(queued.dueAt).toBe('2026-09-11T17:12:00.000Z');
    w.setNow(new Date(SAVED.getTime() + 10 * 60 * 1000));
    expect(await runDueDrafts(w.deps)).toBe(0);
  });

  it("C-AC-12: never drafts from a Free player's notes", async () => {
    const w = world({ tier: 'free' });
    await onNoteSaved(w.deps, { playerId: PLAYER, noteId: 'note-1' });
    expect(w.store.updates).toHaveLength(0);
  });

  it('skips practice notes, notes without a result, "Only when I ask" and a paused agent', async () => {
    const w = world();
    w.store.notes.push({ ...w.store.notes[0]!, id: 'practice', ctx: 'practice', result: null });
    await onNoteSaved(w.deps, { playerId: PLAYER, noteId: 'practice' });
    w.store.players[0]!.contentWindow = 'manual';
    await onNoteSaved(w.deps, { playerId: PLAYER, noteId: 'note-1' });
    w.store.players[0]!.contentWindow = 'thirty_minutes';
    w.store.paused.add(PLAYER);
    await onNoteSaved(w.deps, { playerId: PLAYER, noteId: 'note-1' });
    expect(w.store.updates).toHaveLength(0);
  });

  it('a newer note while a draft is open offers a rebuild instead of a second draft', async () => {
    const w = await draftedWorld();
    w.store.notes.push({ ...w.store.notes[0]!, id: 'note-2', recordedAt: '2026-09-13T10:00:00Z' });
    await onNoteSaved(w.deps, { playerId: PLAYER, noteId: 'note-2' });
    expect(w.store.updates).toHaveLength(1);
    expect((await w.store.getOpenDraft(PLAYER))!.rebuildNoteId).toBe('note-2');
  });
});

describe('the drafting run (C-AC-1)', () => {
  it('drafts from the note, lists what it read, proposes tiers, and sends nothing', async () => {
    const w = await draftedWorld();
    const d = w.draft;
    expect(d.status).toBe('draft');
    expect(wordCount(d.body)).toBeGreaterThanOrEqual(150);
    expect(wordCount(d.body)).toBeLessThanOrEqual(250);
    expect(d.builtFrom.map((b) => b.label)).toEqual([
      'Match Scribe · Fri 18:42 · 0:52',
      'Result · L 6-4 3-6 6-7(5) vs Kovalenko',
      'Mood · confident',
    ]);
    expect(d.tierIds.sort()).toEqual(['court', 'locker']);
    expect(d.tierReasons).toMatchObject({
      court: 'Every update · 8 people',
      locker: 'Adds the practice notes section · 3 people',
      inside: 'No patrons on this tier yet',
    });
    expect(d.checks.map((c) => c.state)).toEqual(['pass', 'pass', 'pass', 'pass']);
    expect(w.sent).toHaveLength(0);
    expect(w.runs).toHaveLength(1);
    expect(w.runs[0]).toMatchObject({ agentName: 'content', model: 'gpt-4o', status: 'succeeded' });
  });

  it('PRD-13 AD-13: the draft records the run that proposed it, and a rewrite keeps that link', async () => {
    const w = await draftedWorld();
    expect(w.draft.agentRunId).toBe(w.runs[0]!.id);
    await rewriteDraft(w.deps, PLAYER, w.draft.id, 'shorter');
    expect(w.runs).toHaveLength(2);
    expect((await w.store.getOpenDraft(PLAYER))!.agentRunId).toBe(w.runs[0]!.id);
  });

  it('PRD-13 AD-13: a failed draft links no run, since the player writes it', async () => {
    const broken: ContentDraftModelClient = {
      async complete() {
        return { raw: { nope: true }, usage: { inputTokens: 10, outputTokens: 5 } };
      },
    };
    const w = world({ draftClient: broken });
    await onNoteSaved(w.deps, { playerId: PLAYER, noteId: 'note-1' });
    w.setNow(new Date(SAVED.getTime() + 31 * 60 * 1000));
    await runDueDrafts(w.deps);
    expect((await w.store.getOpenDraft(PLAYER))!.agentRunId).toBeNull();
  });

  it('C-17: exactly one For-you notification per run, none for edits or rewrites', async () => {
    const w = await draftedWorld();
    expect(w.store.notifications).toHaveLength(1);
    expect(w.store.notifications[0]!.category).toBe('for_you');
    expect(w.store.notifications[0]!.title).toBe(`Draft ready: "${w.draft.subject}"`);
    expect(w.store.notifications[0]!.body).toMatch(
      /^\d+ words from today's note\. Courtside \+ Locker Room\. Nothing goes out until you approve\.$/,
    );
    await saveDraft(w.deps, PLAYER, w.draft.id, { body: `${w.draft.body} One more line.` });
    await rewriteDraft(w.deps, PLAYER, w.draft.id, 'shorter');
    expect(w.store.notifications).toHaveLength(1);
  });

  it('C-AC-11: a failed draft opens as "Write it yourself" with an empty body and nothing sent', async () => {
    const broken: ContentDraftModelClient = {
      async complete() {
        return { raw: { nope: true }, usage: { inputTokens: 10, outputTokens: 5 } };
      },
    };
    const w = world({ draftClient: broken });
    await onNoteSaved(w.deps, { playerId: PLAYER, noteId: 'note-1' });
    w.setNow(new Date(SAVED.getTime() + 31 * 60 * 1000));
    await runDueDrafts(w.deps);
    const d = (await w.store.getOpenDraft(PLAYER))!;
    expect(d).toMatchObject({
      status: 'draft',
      subject: 'Write it yourself',
      body: '',
      draftFailed: true,
    });
    expect(w.runs[0]!.status).toBe('failed_validation');
    expect(w.sent).toHaveLength(0);
  });

  it('C-20: New update drafts from recent notes straight away', async () => {
    const w = world();
    w.setNow(new Date('2026-09-14T08:00:00Z'));
    const d = await startManualDraft(w.deps, PLAYER);
    expect(d.status).toBe('draft');
    expect(d.builtFrom[0]!.label).toBe('1 recent note');
    await expect(startManualDraft(w.deps, PLAYER)).rejects.toBeInstanceOf(UpdateStateError);
  });

  it('checks a manual draft against the opponent from the notes it read', async () => {
    const w = world();
    w.setNow(new Date('2026-09-14T08:00:00Z'));
    const d = await startManualDraft(w.deps, PLAYER);
    const edited = await saveDraft(w.deps, PLAYER, d.id, {
      body: `${d.body} Kovalenko was lucky on the big points.`,
    });
    expect(edited.checks.find((c) => c.kind === 'opponent')!.state).toBe('warn');
  });

  it('describes the note relative to now', () => {
    const note = { recordedAt: SAVED.toISOString() } as never;
    expect(notePhrase(note, new Date('2026-09-12T04:12:00Z'), 'Europe/Vienna')).toBe(
      "last night's note",
    );
    expect(notePhrase(note, new Date('2026-09-15T04:12:00Z'), 'Europe/Vienna')).toBe(
      'your Friday note',
    );
  });
});

describe('the editor', () => {
  it('re-runs the checks on every save, and Fix clears a coach warn (C-10)', async () => {
    const w = await draftedWorld();
    w.store.players[0]!.privateNames = ['Marko'];
    const edited = await saveDraft(w.deps, PLAYER, w.draft.id, {
      body: `${w.draft.body}\n\nMarko and I are already on it.`,
    });
    expect(edited.checks.find((c) => c.kind === 'coach')!.state).toBe('warn');
    const fixed = await fixCheck(w.deps, PLAYER, w.draft.id, 'coach');
    expect(fixed.body).toContain('My coach and I are already on it.');
    expect(fixed.checks.find((c) => c.kind === 'coach')).toMatchObject({
      state: 'pass',
      fixApplied: true,
    });
  });

  it("refuses a tier that is not the player's and a send time in the past", async () => {
    const w = await draftedWorld();
    await expect(
      saveDraft(w.deps, PLAYER, w.draft.id, { tierIds: ['someone-else'] }),
    ).rejects.toThrow('Unknown tier');
    await expect(
      saveDraft(w.deps, PLAYER, w.draft.id, { sendAt: '2026-01-01T00:00:00Z' }),
    ).rejects.toThrow('already passed');
  });

  it('C-AC-8: Skip needs a reason, sends nothing, and Undo restores the draft', async () => {
    const w = await draftedWorld();
    await expect(skipDraft(w.deps, PLAYER, w.draft.id, '  ')).rejects.toThrow('reason');
    await skipDraft(w.deps, PLAYER, w.draft.id, 'nothing to say yet');
    const page = await loadContentPage(w.deps, PLAYER);
    expect(page.history[0]).toMatchObject({ status: 'skipped', skipReason: 'nothing to say yet' });
    expect(w.sent).toHaveLength(0);
    const restored = await undoSkip(w.deps, PLAYER, w.draft.id);
    expect(restored.status).toBe('draft');
  });
});

describe('publishing (C-14, C-18)', () => {
  it('sends nothing without the approval row', async () => {
    const w = await draftedWorld();
    await expect(publishDraft(w.deps, PLAYER, w.draft.id, 'made-up')).rejects.toBeInstanceOf(
      ApprovalNotFoundError,
    );
    expect(w.sent).toHaveLength(0);
    expect((await w.store.getUpdate(PLAYER, w.draft.id))!.status).toBe('draft');
  });

  it('C-AC-6: with the approval, one email per patron in the selected tiers, then Published', async () => {
    const w = await draftedWorld();
    const approvalId = await w.approve(w.draft.id);
    const published = await publishDraft(w.deps, PLAYER, w.draft.id, approvalId);
    expect(published).toMatchObject({
      status: 'published',
      recipientCount: 11,
      deliveredCount: 11,
    });
    expect(w.sent).toHaveLength(11);
    expect(w.store.notifications.at(-1)).toMatchObject({
      category: 'fyi',
      title: 'Sent to 11 patrons',
    });
    expect(await latestTeaser(w.deps, PLAYER)).toEqual({
      text: w.draft.body.split('\n\n')[0],
      sentAt: published.sentAt,
    });
  });

  it('records publishing over a warn as an override (C-11)', async () => {
    const w = await draftedWorld();
    await saveDraft(w.deps, PLAYER, w.draft.id, { body: `${w.draft.body} My runway is short.` });
    const approvalId = await w.approve(w.draft.id);
    const published = await publishDraft(w.deps, PLAYER, w.draft.id, approvalId);
    expect(published.overrides).toEqual(['private']);
  });

  it('C-AC-7: a schedule sends at its time, to whoever is receiving then', async () => {
    const w = await draftedWorld();
    await saveDraft(w.deps, PLAYER, w.draft.id, { sendAt: '2026-09-12T05:00:00.000Z' });
    const approvalId = await w.approve(w.draft.id);
    const scheduled = await publishDraft(w.deps, PLAYER, w.draft.id, approvalId);
    expect(scheduled.status).toBe('scheduled');
    expect(w.sent).toHaveLength(0);
    expect(w.claimed).toEqual([]);

    // A new Locker Room patron joins overnight: the count is recomputed at send time.
    w.store.patrons.push({
      id: 'l9',
      playerId: PLAYER,
      tierId: 'locker',
      status: 'active',
      email: 'l9@example.com',
      since: '2026-09-11T22:00:00Z',
      opens: [],
    });
    w.setNow(new Date('2026-09-12T05:01:00Z'));
    await runContentTick(w.deps);
    const sent = (await w.store.getUpdate(PLAYER, w.draft.id))!;
    expect(sent).toMatchObject({ status: 'published', recipientCount: 12 });
    expect(w.claimed).toEqual([approvalId]);
    expect(w.store.notifications.at(-1)!.title).toBe('Scheduled update sent');
  });

  it('removing the teaser keeps the update published (C-13)', async () => {
    const w = await draftedWorld();
    const approvalId = await w.approve(w.draft.id);
    await publishDraft(w.deps, PLAYER, w.draft.id, approvalId);
    await removeTeaser(w.deps, PLAYER, w.draft.id);
    expect(await latestTeaser(w.deps, PLAYER)).toBeNull();
    expect((await w.store.getUpdate(PLAYER, w.draft.id))!.status).toBe('published');
  });

  it('the profile switch hides the teaser whatever the update says', async () => {
    const w = await draftedWorld();
    await publishDraft(w.deps, PLAYER, w.draft.id, await w.approve(w.draft.id));
    w.store.players[0]!.profileTeaser = false;
    expect(await latestTeaser(w.deps, PLAYER)).toBeNull();
  });
});

describe('opens and joins (C-16, C-AC-10)', () => {
  it("polls Resend, fills open rates and the patrons' opens strip", async () => {
    const w = await draftedWorld();
    await publishDraft(w.deps, PLAYER, w.draft.id, await w.approve(w.draft.id));
    w.events.set('email-1', 'opened');
    w.events.set('email-2', 'clicked');
    await runContentTick(w.deps);
    const page = await loadContentPage(w.deps, PLAYER);
    expect(page.history[0]!.openRate).toBe(Math.round((2 / 11) * 100));
    expect(w.store.patrons.find((p) => p.id === 'c0')!.opens).toEqual([1]);
    expect(w.store.patrons.find((p) => p.id === 'c2')!.opens).toEqual([0]);
  });

  it('attributes a join within seven days of the update, and not after a later one', async () => {
    const w = await draftedWorld();
    const published = await publishDraft(w.deps, PLAYER, w.draft.id, await w.approve(w.draft.id));
    const sentAt = new Date(published.sentAt!);
    w.store.patrons.push({
      id: 'mira',
      playerId: PLAYER,
      tierId: 'court',
      status: 'active',
      email: null,
      since: new Date(sentAt.getTime() + 48 * 3600_000).toISOString(),
      opens: [],
    });
    w.store.patrons.push({
      id: 'late',
      playerId: PLAYER,
      tierId: 'court',
      status: 'active',
      email: null,
      since: new Date(sentAt.getTime() + 9 * 86_400_000).toISOString(),
      opens: [],
    });
    const page = await loadContentPage(w.deps, PLAYER);
    expect(page.history[0]!.joins7d).toBe(1);
  });

  it('shows no open rate before the first open event, never a zero', async () => {
    const w = await draftedWorld();
    await publishDraft(w.deps, PLAYER, w.draft.id, await w.approve(w.draft.id));
    const page = await loadContentPage(w.deps, PLAYER);
    expect(page.history[0]!.openRate).toBeNull();
  });
});
