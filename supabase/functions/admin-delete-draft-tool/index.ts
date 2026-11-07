import { z } from 'npm:zod@4';
import { requireOwner, respond, preflight, handleError, jsonBody, rateLimit } from '../_shared/http.ts';

const Input = z.object({ tool_id: z.string().uuid() }).strict();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  try {
    const { user, admin } = await requireOwner(req);
    await rateLimit(admin, `tool-delete:${user.id}`, 10, 60);

    const parsed = Input.safeParse(await jsonBody(req));
    if (!parsed.success) {
      return respond(req, { error: { code: 'INVALID_TOOL', issues: parsed.error.issues } }, 422);
    }

    const { error } = await admin.rpc('admin_delete_draft_repair_tool', {
      p_actor_id: user.id,
      p_tool_id: parsed.data.tool_id,
    });
    if (error) {
      if (error.message.includes('TOOL_NOT_FOUND')) throw Object.assign(new Error('Tool not found.'), { status: 404 });
      if (error.message.includes('ONLY_UNPUBLISHED_DRAFT_TOOLS_CAN_BE_DELETED')) {
        throw Object.assign(new Error('Only unpublished draft/testing tools can be deleted.'), { status: 409 });
      }
      throw error;
    }
    return respond(req, { data: { deleted: true } });
  } catch (error) {
    return handleError(req, error);
  }
});
