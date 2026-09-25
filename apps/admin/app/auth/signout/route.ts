import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  await createClient().auth.signOut();
  return NextResponse.redirect(new URL('/signin', request.url), { status: 302 });
}
