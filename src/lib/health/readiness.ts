import { isValidOwnerAuthEmail } from '@/lib/auth/owner-pin';

export type ApplicationReadiness = {
  ready: boolean;
  checks: {
    supabaseUrl: boolean;
    supabasePublishableKey: boolean;
    ownerIdentity: boolean;
  };
};

export function getApplicationReadiness(
  env: NodeJS.ProcessEnv = process.env,
): ApplicationReadiness {
  const rawUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  let supabaseUrl = false;

  try {
    const parsed = new URL(rawUrl);
    supabaseUrl =
      parsed.protocol === 'https:' &&
      parsed.hostname.endsWith('.supabase.co') &&
      parsed.username === '' &&
      parsed.password === '';
  } catch {
    supabaseUrl = false;
  }

  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';
  const checks = {
    supabaseUrl,
    supabasePublishableKey: publishableKey.startsWith('sb_publishable_'),
    ownerIdentity: isValidOwnerAuthEmail(env.ADMIN_OWNER_EMAIL?.trim()),
  };

  return {
    ready: Object.values(checks).every(Boolean),
    checks,
  };
}
