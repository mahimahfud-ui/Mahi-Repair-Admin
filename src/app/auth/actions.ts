"use server";

import { createClient } from '@/lib/supabase/server';
import { isValidOwnerAuthEmail } from '@/lib/auth/owner-auth';

export type OwnerMagicLinkResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'rate_limited' | 'configuration' | 'failed' };

/**
 * Send a one-time Supabase Magic Link only to the server-configured Owner.
 * The existing Member OTP flow is not changed by this action.
 */
export async function requestOwnerMagicLink(inputEmail: string): Promise<OwnerMagicLinkResult> {
  const ownerEmail = process.env['ADMIN_OWNER_EMAIL']?.trim().toLowerCase();
  const email = typeof inputEmail === 'string' ? inputEmail.trim().toLowerCase() : '';

  if (!isValidOwnerAuthEmail(ownerEmail) || !process.env['NEXT_PUBLIC_APP_URL']) {
    return { ok: false, reason: 'configuration' };
  }
  if (!isValidOwnerAuthEmail(email) || email !== ownerEmail) {
    return { ok: false, reason: 'invalid' };
  }

  let emailRedirectTo: string;
  try {
    const appUrl = new URL(process.env['NEXT_PUBLIC_APP_URL']);
    const isLocalDevelopment = appUrl.hostname === 'localhost' || appUrl.hostname === '127.0.0.1';
    if (appUrl.protocol !== 'https:' && !(isLocalDevelopment && appUrl.protocol === 'http:')) {
      return { ok: false, reason: 'configuration' };
    }
    emailRedirectTo = new URL('/auth/callback', appUrl.origin).toString();
  } catch {
    return { ok: false, reason: 'configuration' };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: ownerEmail,
      options: {
        emailRedirectTo,
        shouldCreateUser: false,
      },
    });

    if (error) {
      const status = (error as { status?: number }).status;
      const code = (error as { code?: string }).code?.toLowerCase() ?? '';
      const message = error.message.toLowerCase();
      if (status === 429 || code.includes('rate') || message.includes('rate limit')) {
        return { ok: false, reason: 'rate_limited' };
      }
      return { ok: false, reason: 'failed' };
    }

    return { ok: true };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
