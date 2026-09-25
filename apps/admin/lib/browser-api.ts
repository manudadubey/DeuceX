'use client';

import { apiRequest } from './api';
import { createClient } from './supabase/client';
import { ROLE_PREVIEW_COOKIE } from './supabase/cookie';

function rolePreview(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${ROLE_PREVIEW_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

/** A console call from a client control, with the browser's staff session. */
export async function browserApi<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await createClient().auth.getSession();
  return apiRequest<T>(
    path,
    { token: data.session?.access_token ?? null, rolePreview: rolePreview() },
    init,
  );
}

export function post<T>(path: string, body: unknown = {}): Promise<T> {
  return browserApi<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export function setRolePreview(role: string | null): void {
  document.cookie = role
    ? `${ROLE_PREVIEW_COOKIE}=${encodeURIComponent(role)}; path=/; samesite=lax`
    : `${ROLE_PREVIEW_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
