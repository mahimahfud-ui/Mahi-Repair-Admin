import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isActiveOwnerProfile } from '@/lib/auth/owner-access';
import { getMagicLinkRedirectUrl } from '@/lib/auth/magic-link';

export async function GET(request: Request) {
  // Use the configured canonical origin for every callback result. The request
  // Host header is never trusted as a post-authentication redirect destination.
  let appOrigin: string;
  try {
    appOrigin = new URL(
      getMagicLinkRedirectUrl(
        process.env.NEXT_PUBLIC_APP_URL,
        process.env.NODE_ENV === 'production',
      ),
    ).origin;
  } catch {
    return new NextResponse('Admin sign-in is not configured.', { status: 503 });
  }

  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=callback', appOrigin));
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
        return NextResponse.redirect(new URL('/', appOrigin));
      }
    }
  }

  // Do not leave a member, inactive account, or failed callback with an Admin session.
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login?denied=1', appOrigin));
}
