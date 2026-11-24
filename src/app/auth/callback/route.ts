import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isConfiguredActiveOwner } from '@/lib/auth/owner-access';

/**
 * All Auth callback outcomes must use the one canonical production origin.
 * This avoids finishing a valid one-time link on an obsolete Render hostname.
 */
function canonicalOrigin(): string | null {
  try {
    const configured = process.env['NEXT_PUBLIC_APP_URL']?.trim();
    if (!configured) return null;
    const url = new URL(configured);
    const localDevelopment = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(localDevelopment && url.protocol === 'http:')) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function loginRedirect(origin: string, reason: 'link' | 'denied') {
  return NextResponse.redirect(new URL(`/login?error=${reason}`, origin), {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET(request: NextRequest) {
  const origin = canonicalOrigin();
  if (!origin) {
    return new NextResponse('Owner sign-in is not configured. Contact the administrator.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  // A stale/alias hostname must never receive or finish the Owner session.
  // Preserve Supabase's one-time PKCE code while moving the callback to the
  // server-configured canonical Admin origin before exchanging the code.
  if (request.nextUrl.origin !== origin) {
    const canonicalCallback = new URL('/auth/callback', origin);
    canonicalCallback.search = request.nextUrl.search;
    return NextResponse.redirect(canonicalCallback, {
      status: 307,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const code = request.nextUrl.searchParams.get('code');
  if (!code) return loginRedirect(origin, 'link');

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    await supabase.auth.signOut();
    return loginRedirect(origin, 'link');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role,status')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profileError || !isConfiguredActiveOwner(data.user.email, process.env['ADMIN_OWNER_EMAIL'], profile)) {
    await supabase.auth.signOut();
    return loginRedirect(origin, 'denied');
  }

  return NextResponse.redirect(new URL('/', origin), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
