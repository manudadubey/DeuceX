'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import type {
  CheckContext,
  CheckKind,
  RewriteVariant,
  SendTimeOption,
  UpdateCheck,
} from '@deucex/agents';

// The Content Agent's apps/api calls. Only /publish reaches a patron, and only
// after @/lib/approvals/confirm-approval's confirmApproval has created the
// content_publish approval row; apps/api rebuilds the payload from its own
// row and refuses a mismatch. Same split as lib/fans/api.ts.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

export class ContentApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type UpdateStatus =
  | 'queued'
  | 'drafting'
  | 'draft'
  | 'scheduled'
  | 'sending'
  | 'published'
  | 'send_failed'
  | 'skipped'
  | 'superseded';

export interface StoredCheck extends UpdateCheck {
  fixApplied: boolean;
}

export interface BuiltFromItem {
  kind: 'note' | 'result' | 'voice' | 'mood' | 'notes';
  label: string;
  ref: string | null;
}

export interface PatronUpdate {
  id: string;
  trigger: string;
  noteId: string | null;
  status: UpdateStatus;
  dueAt: string | null;
  lang: string;
  subject: string;
  altSubjects: string[];
  body: string;
  practiceSection: string | null;
  generatedBody: string | null;
  draftFailed: boolean;
  draftedAt: string | null;
  checks: StoredCheck[];
  builtFrom: BuiltFromItem[];
  tierIds: string[];
  tierReasons: Record<string, string>;
  sendAt: string | null;
  teaser: boolean;
  teaserRemovedAt: string | null;
  rebuildNoteId: string | null;
  sentAt: string | null;
  recipientCount: number | null;
  deliveredCount: number | null;
  skipReason: string | null;
  sendError: string | null;
  createdAt: string;
}

export interface ContentTier {
  id: string;
  position: number;
  name: string;
  activeCount: number;
}

export interface HistoryRow {
  id: string;
  subject: string;
  status: UpdateStatus;
  date: string;
  tiers: string;
  words: number;
  skipReason: string | null;
  recipientCount: number | null;
  deliveredCount: number | null;
  openRate: number | null;
  joins7d: number | null;
}

export interface ContentPageData {
  plan: 'free' | 'pro' | 'elite';
  paused: boolean;
  window: 'thirty_minutes' | 'next_morning' | 'manual';
  timezone: string;
  current: PatronUpdate | null;
  tiers: ContentTier[];
  sendTimes: SendTimeOption[];
  voice: {
    line: string;
    examples: Array<{ id: string; subject: string; openRate: number | null }>;
  };
  checkContext: CheckContext;
  history: HistoryRow[];
}

async function authHeaders(supabase: SupabaseClient<Database>): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ContentApiError('Not signed in', 401);
  return { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

async function call<T>(
  supabase: SupabaseClient<Database>,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: await authHeaders(supabase),
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
  });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => ({}))) as { error?: string }).error;
    throw new ContentApiError(detail ?? `Request failed: ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}

export const loadContentPage = (s: SupabaseClient<Database>) =>
  call<ContentPageData>(s, 'GET', '/content/page');

export const startNewUpdate = (s: SupabaseClient<Database>) =>
  call<PatronUpdate>(s, 'POST', '/content/updates');

export interface DraftEdit {
  subject?: string;
  altSubjects?: string[];
  body?: string;
  tierIds?: string[];
  sendAt?: string | null;
  teaser?: boolean;
}

const post = (s: SupabaseClient<Database>, id: string, action: string, body?: unknown) =>
  call<PatronUpdate>(s, 'POST', `/content/updates/${id}/${action}`, body);

export const saveDraft = (s: SupabaseClient<Database>, id: string, edit: DraftEdit) =>
  post(s, id, 'save', edit);
export const fixCheck = (s: SupabaseClient<Database>, id: string, kind: CheckKind) =>
  post(s, id, 'fix', { kind });
export const rewriteDraft = (s: SupabaseClient<Database>, id: string, variant: RewriteVariant) =>
  post(s, id, 'rewrite', { variant });
export const restoreOriginal = (s: SupabaseClient<Database>, id: string) => post(s, id, 'restore');
export const skipDraft = (s: SupabaseClient<Database>, id: string, reason: string) =>
  post(s, id, 'skip', { reason });
export const undoSkip = (s: SupabaseClient<Database>, id: string) => post(s, id, 'undo-skip');
export const publishDraft = (s: SupabaseClient<Database>, id: string, approvalId: string) =>
  post(s, id, 'publish', { approvalId });
export const cancelSchedule = (s: SupabaseClient<Database>, id: string) => post(s, id, 'cancel');
export const removeTeaser = (s: SupabaseClient<Database>, id: string) =>
  post(s, id, 'remove-teaser');
export const rebuildDraft = (s: SupabaseClient<Database>, id: string) => post(s, id, 'rebuild');
export const sendPreview = (s: SupabaseClient<Database>, id: string) =>
  call<{ to: string }>(s, 'POST', `/content/updates/${id}/preview`);
