import { z } from 'npm:zod@4';
import { authenticate, respond, preflight, handleError, jsonBody, rateLimit } from '../_shared/http.ts';

const Input = z.object({ device_id: z.string().uuid() }).strict();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  try {
    const { user, profile, admin } = await authenticate(req);
    if (profile.role !== 'member') {
      throw Object.assign(new Error('Member account required'), { status: 403 });
    }
    await rateLimit(admin, `catalog:${user.id}`, 60, 60);

    const checked = Input.safeParse(await jsonBody(req));
    if (!checked.success) {
      return respond(req, { error: { code: 'INVALID_DEVICE', issues: checked.error.issues } }, 422);
    }

    // One database transaction revalidates member/device state, current publication,
    // assignment and Android compatibility while recording device_tool_syncs.
    // The RPC applies the catalog equivalent of publishedIds.has(id) in SQL:
    // only tools with status = 'PUBLISHED' and the exact current version are emitted.
    const { data, error } = await admin.rpc('get_member_repair_catalog', {
      p_user_id: user.id,
      p_device_id: checked.data.device_id,
    });
    if (error) {
      const token = error.message;
      if (token.includes('ACTIVE_MEMBER_REQUIRED') || token.includes('INVALID_DEVICE') ||
          token.includes('DEVICE_REVOKED')) {
        throw Object.assign(new Error('An active registered device and member account are required.'), { status: 403 });
      }
      throw error;
    }

    if (!Array.isArray(data)) throw new Error('The repair catalog response was invalid.');
    return respond(req, { data });
  } catch (error) {
    return handleError(req, error);
  }
});
