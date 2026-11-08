import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isConfiguredActiveOwner } from '@/lib/auth/owner-access';

export async function requireOwner() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect('/login');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role,status,display_name')
    .eq('id', user.id)
    .maybeSingle();

  const configuredOwnerEmail = process.env['ADMIN_OWNER_EMAIL'];
  if (profileError || !isConfiguredActiveOwner(user.email, configuredOwnerEmail, profile)) {
    redirect('/login?denied=1');
  }

  return { supabase, user, profile };
}
