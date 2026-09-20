'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, NoteCtx } from '@procircuit/db';

// The apps/api calls that have a real vendor side effect (R2 upload/delete,
// Whisper) or a status transition apps/api owns — everything else about a
// note (reading history, editing review fields, the quota count) is a
// direct Supabase call via packages/db/src/notes.ts instead. See
// TECH-ARCHITECTURE.md section 1.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

export class QuotaExceededError extends Error {
  constructor() {
    super("You've used 10 of 10 notes this month");
  }
}

export class ApiError extends Error {}

async function authHeaders(supabase: SupabaseClient<Database>): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError('Not signed in');
  return { Authorization: `Bearer ${token}` };
}

export interface UploadNoteFields {
  ctx: NoteCtx;
  recordedAt: string;
  durSeconds: number;
  audio: Blob;
  audioContentType: string;
  languagePreference?: string;
  device?: string;
}

export interface NoteSummary {
  id: string;
  status: string;
}

export async function uploadNote(
  supabase: SupabaseClient<Database>,
  fields: UploadNoteFields,
): Promise<NoteSummary> {
  const headers = await authHeaders(supabase);
  const form = new FormData();
  form.append('ctx', fields.ctx);
  form.append('recordedAt', fields.recordedAt);
  form.append('durSeconds', String(fields.durSeconds));
  if (fields.languagePreference) form.append('languagePreference', fields.languagePreference);
  if (fields.device) form.append('device', fields.device);
  form.append('audio', fields.audio, 'note.webm');

  const res = await fetch(`${API_URL}/notes`, { method: 'POST', headers, body: form });
  if (res.status === 402) throw new QuotaExceededError();
  if (!res.ok) throw new ApiError(`Upload failed: ${res.status}`);
  const body = (await res.json()) as { note: NoteSummary };
  return body.note;
}

export async function saveNoteRemote(
  supabase: SupabaseClient<Database>,
  noteId: string,
): Promise<void> {
  const headers = await authHeaders(supabase);
  const res = await fetch(`${API_URL}/notes/${noteId}/save`, { method: 'PATCH', headers });
  if (res.status === 402) throw new QuotaExceededError();
  if (!res.ok) throw new ApiError(`Save failed: ${res.status}`);
}

export async function deleteNoteRemote(
  supabase: SupabaseClient<Database>,
  noteId: string,
): Promise<void> {
  const headers = await authHeaders(supabase);
  const res = await fetch(`${API_URL}/notes/${noteId}`, { method: 'DELETE', headers });
  if (!res.ok && res.status !== 404) throw new ApiError(`Delete failed: ${res.status}`);
}

export async function retryTranscriptionRemote(
  supabase: SupabaseClient<Database>,
  noteId: string,
): Promise<void> {
  const headers = await authHeaders(supabase);
  const res = await fetch(`${API_URL}/notes/${noteId}/retry`, { method: 'POST', headers });
  if (!res.ok) throw new ApiError(`Retry failed: ${res.status}`);
}
