import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { canAccessArea, type AdminArea } from '@deucex/shared';
import { ApiError, apiRequest, type Me } from './api';
import { createClient } from './supabase/server';
import { ROLE_PREVIEW_COOKIE } from './supabase/cookie';

async function auth() {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  return {
    token: data.session?.access_token ?? null,
    rolePreview: cookies().get(ROLE_PREVIEW_COOKIE)?.value ?? null,
  };
}

/** A console read from a server component. Session or passkey problems send the person to sign in. */
export async function serverApi<T>(path: string): Promise<T> {
  try {
    return await apiRequest<T>(path, await auth());
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401 || error.code === 'not_staff') redirect('/signin');
      if (
        error.code === 'passkey_enrolment_required' ||
        error.code === 'passkey_sign_in_required'
      ) {
        redirect('/passkey');
      }
      // PRD-13 section 4.1: a hidden area reached by URL lands on Overview.
      if (error.code === 'forbidden_area') redirect('/');
    }
    throw error;
  }
}

export async function getMe(): Promise<Me | null> {
  const a = await auth();
  if (!a.token) return null;
  try {
    return await apiRequest<Me>('/admin/me', a);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null;
    throw error;
  }
}

/** Page guard: an area outside the acting role redirects to Overview (AD-2, AD-AC-1). */
export async function requireArea(area: AdminArea): Promise<Me> {
  const me = await getMe();
  if (!me) redirect('/signin');
  if (!me.passkeyRegistered || !me.passkeySession) redirect('/passkey');
  if (!canAccessArea(me.actingRole, area)) redirect('/');
  return me;
}
