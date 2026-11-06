import { z } from 'npm:zod@4';
import { requireOwner, respond, preflight, handleError, jsonBody, rateLimit } from '../_shared/http.ts';

const Input = z.object({
  user_id: z.string().uuid(),
  status: z.enum(['active', 'suspended', 'revoked']),
}).strict();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  try {
    const { user, admin } = await requireOwner(req);
    await rateLimit(admin, `member-manage:${user.id}`, 30, 60);

    const parsed = Input.safeParse(await jsonBody(req));
    if (!parsed.success) {
      return respond(req, { error: { code: 'INVALID_MEMBER_STATUS', issues: parsed.error.issues } }, 422);
    }
    const { user_id: target, status } = parsed.data;

    // For reactivation, unblock Auth first but leave the database profile suspended
    // until the owner-checked, audited database transaction succeeds.
    if (status === 'active') {
      const { error } = await admin.auth.admin.updateUserById(target, { ban_duration: 'none' });
      if (error) throw error;
    }

    const { data, error } = await admin.rpc('admin_update_member_status', {
      p_actor_id: user.id,
      p_member_id: target,
      p_status: status,
    });
    if (error) {
      if (error.message.includes('MEMBER_NOT_FOUND')) {
        throw Object.assign(new Error('Member not found.'), { status: 404 });
      }
      if (error.message.includes('CANNOT_CHANGE_OWN_OWNER_STATUS')) {
        throw Object.assign(new Error('You cannot suspend or revoke your own owner session.'), { status: 400 });
      }
      throw error;
    }

    // Suspension/revocation commits first. Even if the separate Auth ban API fails,
    // the profile status blocks every Edge Function and new Realtime authorization.
    if (status !== 'active') {
      const { error: authError } = await admin.auth.admin.updateUserById(target, {
        ban_duration: '876000h',
      });
      if (authError) throw authError;
    }

    return respond(req, { data });
  } catch (error) {
    return handleError(req, error);
  }
});
