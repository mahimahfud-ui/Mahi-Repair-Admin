import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const supabase = await createClient();
  const denied = async () => {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL('/login?denied=1', url.origin));
  };

  if (!code) return NextResponse.redirect(new URL('/login?error=callback', url.origin));
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) return denied();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return denied();
  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('role,status').eq('id', user.id).maybeSingle();
  if (profileError || !profile || profile.role !== 'owner' || profile.status !== 'active') return denied();

  return NextResponse.redirect(new URL('/', url.origin));
}
