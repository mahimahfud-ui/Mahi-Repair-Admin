import { z } from 'npm:zod@4';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { env, serviceClient, respond, preflight, handleError, jsonBody, rateLimit } from '../_shared/http.ts';
import { isValidMemberCode, isValidMemberPin } from '../_shared/member-credentials.ts';

const Input = z.object({
  member_code: z.string().trim().regex(/^MR-[A-HJ-NP-Z2-9]{8}$/),
  pin: z.string().regex(/^\d{12}$/),
}).strict();

const encoder = new TextEncoder();

async function digest(value: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function invalidCredentials(req: Request) {
  return respond(req, {
    error: { code: 'INVALID_CREDENTIALS', message: 'Member ID or PIN is incorrect, or access is inactive.' },
  }, 401);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  try {
    const parsed = Input.safeParse(await jsonBody(req));
    if (!parsed.success) return invalidCredentials(req);

    const memberCode = parsed.data.member_code.toUpperCase();
    const pin = parsed.data.pin;
    if (!isValidMemberCode(memberCode) || !isValidMemberPin(pin)) return invalidCredentials(req);

    const admin = serviceClient();
    const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const codeDigest = await digest(memberCode);
    await rateLimit(admin, `member-login-ip:${await digest(forwardedFor)}`, 30, 60);
    await rateLimit(admin, `member-login-code:${codeDigest}`, 6, 300);

    const { data: profile, error: profileError } = await admin.from('profiles')
      .select('id,role,status,member_code')
      .eq('member_code', memberCode)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || profile.role !== 'member' || profile.status !== 'active') return invalidCredentials(req);

    // Resolve the actual Auth identity on the server. The Android app only sends
    // the Member ID and PIN; it never learns or submits an email address.
    const { data: userResult, error: userError } = await admin.auth.admin.getUserById(profile.id);
    const internalEmail = userResult.user?.email;
    if (userError || !internalEmail) return invalidCredentials(req);

    const auth = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: sessionData, error: signInError } = await auth.auth.signInWithPassword({
      email: internalEmail,
      password: pin,
    });
    if (signInError || !sessionData.session || sessionData.user?.id !== profile.id) return invalidCredentials(req);

    const { data: currentProfile, error: currentProfileError } = await admin.from('profiles')
      .select('role,status')
      .eq('id', profile.id)
      .maybeSingle();
    if (currentProfileError) throw currentProfileError;
    if (!currentProfile || currentProfile.role !== 'member' || currentProfile.status !== 'active') return invalidCredentials(req);

    const session = sessionData.session;
    return respond(req, {
      access_token: session.access_token,
      token_type: session.token_type,
      expires_in: session.expires_in,
      refresh_token: session.refresh_token,
      user: {
        id: profile.id,
        email: internalEmail,
        app_metadata: { role: 'member' },
      },
    });
  } catch (error) {
    return handleError(req, error);
  }
});
