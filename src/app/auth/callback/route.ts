import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isActiveOwnerProfile } from '@/lib/auth/owner-access';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=callback', url.origin));
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (!exchangeError) {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (!userError && user) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role,status')
        .eq('id', user.id)
        .maybeSingle();

      if (!profileError && isActiveOwnerProfile(profile)) {
        return NextResponse.redirect(new URL('/', url.origin));
      }
    }
  }

  // Do not leave a member, inactive account, or failed callback with an Admin session.
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login?denied=1', url.origin));
}
