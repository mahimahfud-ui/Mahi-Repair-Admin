import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isConfiguredActiveOwner } from '@/lib/auth/owner-access';

function loginRedirect(request: NextRequest, reason: 'link' | 'denied') {
  return NextResponse.redirect(new URL(`/login?error=${reason}`, request.url), {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (!code) return loginRedirect(request, 'link');

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    await supabase.auth.signOut();
    return loginRedirect(request, 'link');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role,status')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profileError || !isConfiguredActiveOwner(data.user.email, process.env['ADMIN_OWNER_EMAIL'], profile)) {
    await supabase.auth.signOut();
    return loginRedirect(request, 'denied');
  }

  return NextResponse.redirect(new URL('/', request.url), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
