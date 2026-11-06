import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isActiveOwnerProfile } from '@/lib/auth/owner-access';

export async function requireOwner() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect('/login');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role,status,display_name')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !isActiveOwnerProfile(profile)) {
    redirect('/login?denied=1');
  }

  return { supabase, user, profile };
}
