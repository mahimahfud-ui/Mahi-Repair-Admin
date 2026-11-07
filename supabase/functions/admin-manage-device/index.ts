import { z } from 'npm:zod@4';
import { requireOwner, respond, preflight, handleError, jsonBody, rateLimit } from '../_shared/http.ts';

const Input = z.object({ device_id: z.string().uuid(), revoked: z.boolean() }).strict();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  try {
    const { user, admin } = await requireOwner(req);
    await rateLimit(admin, `device-manage:${user.id}`, 30, 60);

    const parsed = Input.safeParse(await jsonBody(req));
    if (!parsed.success) {
      return respond(req, { error: { code: 'INVALID_DEVICE_STATE', issues: parsed.error.issues } }, 422);
    }

    const { data, error } = await admin.rpc('admin_update_device_revocation', {
      p_actor_id: user.id,
      p_device_id: parsed.data.device_id,
      p_revoked: parsed.data.revoked,
    });
    if (error) {
      if (error.message.includes('DEVICE_NOT_FOUND')) {
        throw Object.assign(new Error('Device not found.'), { status: 404 });
      }
      throw error;
    }
    return respond(req, { data });
  } catch (error) {
    return handleError(req, error);
  }
});
