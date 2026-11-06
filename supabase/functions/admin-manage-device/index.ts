import { z } from 'npm:zod@4';
import { requireOwner, respond, preflight, handleError, jsonBody, rateLimit, audit } from '../_shared/http.ts';
const Input = z.object({ device_id: z.string().uuid(), revoked: z.boolean() }).strict();
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  try {
    const { user, admin } = await requireOwner(req);
    await rateLimit(admin, `device-manage:${user.id}`, 30, 60);
    const parsed = Input.safeParse(await jsonBody(req));
    if (!parsed.success) return respond(req, { error: { code: 'INVALID_DEVICE_STATE', issues: parsed.error.issues } }, 422);
    const { device_id, revoked } = parsed.data;
    const { data: device, error: findError } = await admin.from('devices').select('id,user_id').eq('id', device_id).single();
    if (findError || !device) throw Object.assign(new Error('Device not found'), { status: 404 });
    const { data: updated, error } = await admin.from('devices').update({ revoked_at: revoked ? new Date().toISOString() : null }).eq('id', device_id).select('id,revoked_at').single();
    if (error) throw error;
    await audit(admin, user.id, revoked ? 'device.revoked' : 'device.restored', 'device', device_id, { member_id: device.user_id });
    return respond(req, { data: { device_id, revoked: Boolean(updated.revoked_at) } });
  } catch (error) { return handleError(req, error); }
});
