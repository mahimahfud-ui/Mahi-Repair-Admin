import { z } from 'npm:zod@4';
import { authenticate, respond, preflight, handleError, jsonBody, rateLimit } from '../_shared/http.ts';

const Input = z.object({ tool_id: z.string().uuid(), device_id: z.string().uuid() }).strict();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  try {
    const { user, profile, admin } = await authenticate(req);
    if (profile.role !== 'member') throw Object.assign(new Error('Member account required'), { status: 403 });
    await rateLimit(admin, `signed-tool:${user.id}`, 90, 60);

    const checked = Input.safeParse(await jsonBody(req));
    if (!checked.success) {
      return respond(req, { error: { code: 'INVALID_TOOL_REQUEST', issues: checked.error.issues } }, 422);
    }

    const { data, error } = await admin.rpc('get_signed_repair_tool_for_device', {
      p_user_id: user.id,
      p_device_id: checked.data.device_id,
      p_tool_id: checked.data.tool_id,
    });
    if (error) {
      const token = error.message;
      const status = token.includes('INVALID_DEVICE') || token.includes('DEVICE_REVOKED') ||
          token.includes('ACTIVE_MEMBER_REQUIRED') || token.includes('TOOL_ACCESS_DENIED') ||
          token.includes('TOOL_NOT_PUBLISHED') ? 403 : 409;
      throw Object.assign(new Error('The requested repair is no longer available to this device.'), { status });
    }
    if (!data || typeof data !== 'object') throw new Error('Signed recipe response was invalid.');
    const recipe = data as {
      signed_payload: string;
      signature: string;
      signature_algorithm: 'RSA-SHA256';
      version: number;
    };

    return respond(req, {
      signed_payload: recipe.signed_payload,
      signature: recipe.signature,
      signature_algorithm: recipe.signature_algorithm,
      version: recipe.version,
    });
  } catch (error) {
    return handleError(req, error);
  }
});
