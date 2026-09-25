import { randomUUID } from 'node:crypto';
import type { ContentActionsDb, ContentRecipient } from '@deucex/actions/content';
import type {
  ContentNote,
  ContentPlayer,
  ContentStore,
  ContentTier,
  UpdatePatch,
  UpdateRecord,
} from './store';

// In-memory ContentStore plus the gated action's ContentActionsDb over the
// same state, for service tests (the same role as fans/memory-store.ts).

export interface MemoryPatron {
  id: string;
  playerId: string;
  tierId: string;
  status: string;
  email: string | null;
  since: string;
  opens: Array<1 | 0 | null>;
}

export interface MemorySend {
  id: string;
  updateId: string;
  playerId: string;
  patronId: string;
  tierId: string;
  status: 'sent' | 'failed';
  emailId: string | null;
  sentAt: string;
  lastEvent: string | null;
  openedAt: string | null;
  lastCheckedAt: string | null;
}

export class MemoryContentStore implements ContentStore {
  players: ContentPlayer[] = [];
  paused = new Set<string>();
  updates: UpdateRecord[] = [];
  notes: Array<ContentNote & { playerId: string }> = [];
  tiers: Array<Omit<ContentTier, 'activeCount'> & { playerId: string }> = [];
  patrons: MemoryPatron[] = [];
  sends: MemorySend[] = [];
  notifications: Array<{ playerId: string; category: string; title: string; body: string }> = [];
  deadline: { tournamentName: string; deadlineAt: string } | null = null;
  private seq = 0;

  async getPlayer(playerId: string) {
    return this.players.find((p) => p.id === playerId) ?? null;
  }

  async isAgentPaused(playerId: string) {
    return this.paused.has(playerId);
  }

  async getUpdate(playerId: string, updateId: string) {
    const u = this.updates.find((x) => x.id === updateId && x.playerId === playerId);
    return u ? { ...u } : null;
  }

  async getOpenDraft(playerId: string) {
    const u = this.updates.find(
      (x) => x.playerId === playerId && ['queued', 'drafting', 'draft'].includes(x.status),
    );
    return u ? { ...u } : null;
  }

  async listUpdates(playerId: string, limit: number) {
    return this.updates
      .filter((u) => u.playerId === playerId && u.status !== 'superseded')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((u) => ({ ...u }));
  }

  async insertUpdate(row: Parameters<ContentStore['insertUpdate']>[0]) {
    const open = ['queued', 'drafting', 'draft'];
    if (
      open.includes(row.status) &&
      this.updates.some((u) => u.playerId === row.playerId && open.includes(u.status))
    ) {
      throw Object.assign(new Error('duplicate open draft'), { code: '23505' });
    }
    if (
      row.noteId &&
      ['note', 'rebuild'].includes(row.trigger) &&
      this.updates.some((u) => u.noteId === row.noteId && ['note', 'rebuild'].includes(u.trigger))
    ) {
      throw Object.assign(new Error('duplicate note'), { code: '23505' });
    }
    this.seq += 1;
    const record: UpdateRecord = {
      id: randomUUID(),
      ...row,
      subject: '',
      altSubjects: [],
      body: '',
      practiceSection: null,
      generatedSubject: null,
      generatedBody: null,
      draftFailed: false,
      draftedAt: null,
      checks: [],
      overrides: [],
      builtFrom: [],
      people: [],
      tierIds: [],
      tierReasons: {},
      sendAt: null,
      teaser: true,
      teaserRemovedAt: null,
      rebuildNoteId: null,
      approvalId: null,
      sentAt: null,
      recipientCount: null,
      deliveredCount: null,
      skipReason: null,
      skippedAt: null,
      sendError: null,
      createdAt: new Date(Date.UTC(2026, 0, 1) + this.seq * 1000).toISOString(),
    };
    this.updates.push(record);
    return { ...record };
  }

  async patchUpdate(updateId: string, patch: UpdatePatch) {
    const u = this.updates.find((x) => x.id === updateId);
    if (!u) throw new Error(`no update ${updateId}`);
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) (u as unknown as Record<string, unknown>)[k] = v;
    }
  }

  async claimQueued(updateId: string) {
    const u = this.updates.find((x) => x.id === updateId);
    if (!u || u.status !== 'queued') return false;
    u.status = 'drafting';
    return true;
  }

  async listDueQueued(now: Date) {
    return this.updates.filter(
      (u) => u.status === 'queued' && u.dueAt && new Date(u.dueAt).getTime() <= now.getTime(),
    );
  }

  async listDueScheduled(now: Date) {
    return this.updates.filter(
      (u) => u.status === 'scheduled' && u.sendAt && new Date(u.sendAt).getTime() <= now.getTime(),
    );
  }

  async getNote(noteId: string) {
    return this.notes.find((n) => n.id === noteId) ?? null;
  }

  async listNotesBefore(playerId: string, beforeIso: string, limit: number) {
    return this.notes
      .filter((n) => n.playerId === playerId && n.recordedAt < beforeIso)
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
      .slice(0, limit);
  }

  async listTiers(playerId: string) {
    return this.tiers
      .filter((t) => t.playerId === playerId)
      .sort((a, b) => a.position - b.position)
      .map((t) => ({
        id: t.id,
        position: t.position,
        name: t.name,
        activeCount: this.patrons.filter(
          (p) => p.tierId === t.id && ['active', 'past_due'].includes(p.status),
        ).length,
      }));
  }

  async sendStats(updateIds: readonly string[]) {
    return updateIds.map((id) => {
      const rows = this.sends.filter((s) => s.updateId === id && s.status === 'sent');
      return {
        updateId: id,
        delivered: rows.length,
        opened: rows.filter((s) => s.openedAt).length,
      };
    });
  }

  async listPatronStarts(playerId: string) {
    return this.patrons.filter((p) => p.playerId === playerId).map((p) => p.since);
  }

  async nextDeadline() {
    return this.deadline;
  }

  async insertNotification(input: Parameters<ContentStore['insertNotification']>[0]) {
    this.notifications.push(input);
  }

  async listSendsToPoll(_now: Date, limit: number) {
    return this.sends
      .filter((s) => s.status === 'sent' && !s.openedAt && s.emailId)
      .slice(0, limit)
      .map((s) => ({ id: s.id, emailId: s.emailId!, patronId: s.patronId }));
  }

  async recordSendEvent(
    sendId: string,
    lastEvent: string | null,
    openedAt: string | null,
    checkedAt: string,
  ) {
    const s = this.sends.find((x) => x.id === sendId)!;
    s.lastEvent = lastEvent;
    s.lastCheckedAt = checkedAt;
    if (openedAt) s.openedAt = openedAt;
  }

  async refreshPatronOpens(patronIds: readonly string[]) {
    for (const id of new Set(patronIds)) {
      const p = this.patrons.find((x) => x.id === id);
      if (!p) continue;
      p.opens = this.sends
        .filter((s) => s.patronId === id)
        .sort((a, b) => a.sentAt.localeCompare(b.sentAt))
        .slice(-6)
        .map((s) => (s.status !== 'sent' ? null : s.openedAt ? 1 : 0));
    }
  }

  /** packages/actions' ContentActionsDb over the same state. */
  actionsDb(): ContentActionsDb {
    return {
      getUpdate: async (playerId, updateId) => {
        const u = await this.getUpdate(playerId, updateId);
        return u
          ? {
              id: u.id,
              playerId: u.playerId,
              status: u.status,
              subject: u.subject,
              body: u.body,
              practiceSection: u.practiceSection,
              tierIds: u.tierIds,
              sendAt: u.sendAt,
              teaser: u.teaser,
              approvalId: u.approvalId,
            }
          : null;
      },
      getSender: async (playerId) => {
        const p = await this.getPlayer(playerId);
        return p ? { name: p.name, email: p.email, slug: 'arya-dubey' } : null;
      },
      listRecipients: async (playerId, tierIds): Promise<ContentRecipient[]> =>
        this.patrons
          .filter(
            (p) =>
              p.playerId === playerId &&
              tierIds.includes(p.tierId) &&
              ['active', 'past_due'].includes(p.status) &&
              p.email,
          )
          .map((p) => ({
            patronId: p.id,
            tierId: p.tierId,
            tierPosition: this.tiers.find((t) => t.id === p.tierId)?.position ?? 1,
            email: p.email!,
          })),
      listSentPatronIds: async (updateId) =>
        this.sends
          .filter((s) => s.updateId === updateId && s.status === 'sent')
          .map((s) => s.patronId),
      recordSend: async (input) => {
        this.sends = this.sends.filter(
          (s) => !(s.updateId === input.updateId && s.patronId === input.patronId),
        );
        this.sends.push({
          id: randomUUID(),
          updateId: input.updateId,
          playerId: input.playerId,
          patronId: input.patronId,
          tierId: input.tierId,
          status: input.status,
          emailId: input.emailId,
          sentAt: new Date().toISOString(),
          lastEvent: null,
          openedAt: null,
          lastCheckedAt: null,
        });
      },
      setStatus: async (updateId, patch) => {
        const map: UpdatePatch = { status: patch.status as UpdateRecord['status'] };
        if (patch.approvalId !== undefined) map.approvalId = patch.approvalId;
        if (patch.sentAt !== undefined) map.sentAt = patch.sentAt;
        if (patch.recipientCount !== undefined) map.recipientCount = patch.recipientCount;
        if (patch.deliveredCount !== undefined) map.deliveredCount = patch.deliveredCount;
        if (patch.sendError !== undefined) map.sendError = patch.sendError;
        await this.patchUpdate(updateId, map);
      },
    };
  }
}
