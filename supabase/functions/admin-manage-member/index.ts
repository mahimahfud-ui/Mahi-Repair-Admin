import { z } from 'npm:zod@4';
import { requireOwner, respond, preflight, handleError, jsonBody, rateLimit, audit } from '../_shared/http.ts';
const Input = z.object({ user_id: z.string().uuid(), status: z.enum(['active', 'suspended', 'revoked']) }).strict();
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  try {
    const { user, admin } = await requireOwner(req);
    await rateLimit(admin, `member-manage:${user.id}`, 30, 60);
    const parsed = Input.safeParse(await jsonBody(req));
    if (!parsed.success) return respond(req, { error: { code: 'INVALID_MEMBER_STATUS', issues: parsed.error.issues } }, 422);
    const { user_id: target, status } = parsed.data;
    if (target === user.id) throw Object.assign(new Error('You cannot suspend or revoke your own owner session.'), { status: 400 });
    const { data: profile, error: lookupError } = await admin.from('profiles').select('id,role').eq('id', target).single();
    if (lookupError || !profile || profile.role !== 'member') throw Object.assign(new Error('Member not found'), { status: 404 });

    if (status === 'active') {
      const { error: authError } = await admin.auth.admin.updateUserById(target, { ban_duration: 'none' });
      if (authError) throw authError;
      const { error: profileError } = await admin.from('profiles').update({ status }).eq('id', target);
      if (profileError) throw profileError;
    } else {
      const { error: profileError } = await admin.from('profiles').update({ status }).eq('id', target);
      if (profileError) throw profileError;
      const { error: authError } = await admin.auth.admin.updateUserById(target, { ban_duration: '876000h' });
      if (authError) throw authError; // Profile status already blocks all application access.
    }
    await audit(admin, user.id, `member.${status}`, 'profile', target, {});
    return respond(req, { data: { user_id: target, status } });
  } catch (error) { return handleError(req, error); }
});
