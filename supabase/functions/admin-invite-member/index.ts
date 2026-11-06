import {
  requireOwner,
  respond,
  preflight,
  handleError,
  jsonBody,
  rateLimit,
  audit,
  requireAdminOrigin,
  isSameAdminOriginRedirect,
} from '../_shared/http.ts';
import { z } from 'npm:zod@4';

const Input = z.object({
  email: z.string().email().max(254),
  redirect_to: z.string().url().optional(),
}).strict();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  try {
    const { user, admin } = await requireOwner(req);
    await rateLimit(admin, 'invite:' + user.id, 10, 3600);

    const parsed = Input.safeParse(await jsonBody(req));
    if (!parsed.success) {
      return respond(req, { error: { code: 'INVALID_INVITATION', issues: parsed.error.issues } }, 422);
    }

    const email = parsed.data.email.trim().toLowerCase();
    const allowedOrigin = requireAdminOrigin();
    const redirectTo = parsed.data.redirect_to ?? (allowedOrigin + '/auth/callback');

    if (!isSameAdminOriginRedirect(redirectTo, allowedOrigin)) {
      throw Object.assign(
        new Error('Invitation redirect must use the configured HTTPS Admin origin.'),
        { status: 400 },
      );
    }

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { role: 'member' },
    });
    if (error) throw error;
    if (!data.user) throw new Error('Invitation did not return a user record.');

    const { error: profileError } = await admin.from('profiles').upsert({
      id: data.user.id,
      email,
      role: 'member',
      status: 'active',
    }, { onConflict: 'id' });
    if (profileError) throw profileError;

    await audit(admin, user.id, 'member.invited', 'profile', data.user.id, {
      email_domain: email.split('@')[1],
    });

    return respond(req, { data: { user_id: data.user.id, invited: true } });
  } catch (error) {
    return handleError(req, error);
  }
});
