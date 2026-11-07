import { z } from 'npm:zod@4';
import { requireOwner, respond, preflight, handleError, jsonBody, rateLimit } from '../_shared/http.ts';

const Input = z.object({
  tool_id: z.string().uuid(),
  status: z.enum(['DRAFT', 'TESTING', 'ARCHIVED']),
}).strict();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  try {
    const { user, admin } = await requireOwner(req);
    await rateLimit(admin, `tool-state:${user.id}`, 20, 60);

    const parsed = Input.safeParse(await jsonBody(req));
    if (!parsed.success) {
      return respond(req, { error: { code: 'INVALID_TOOL_STATE', issues: parsed.error.issues } }, 422);
    }

    const { data: current, error: lookupError } = await admin.from('repair_tools')
      .select('id,status,version')
      .eq('id', parsed.data.tool_id)
      .single();
    if (lookupError || !current) throw Object.assign(new Error('Tool not found.'), { status: 404 });

    const { data, error } = await admin.rpc('admin_set_repair_tool_status', {
      p_actor_id: user.id,
      p_tool_id: current.id,
      p_expected_status: current.status,
      p_new_status: parsed.data.status,
    });
    if (error) {
      if (error.message.includes('TOOL_NOT_FOUND')) throw Object.assign(new Error('Tool not found.'), { status: 404 });
      if (error.message.includes('TOOL_STATE_CONFLICT')) throw Object.assign(new Error('Tool state changed concurrently. Reload and retry.'), { status: 409 });
      if (error.message.includes('ARCHIVED_TOOL_IS_IMMUTABLE')) throw Object.assign(new Error('Archived tools cannot be changed.'), { status: 409 });
      throw error;
    }

    return respond(req, { data });
  } catch (error) {
    return handleError(req, error);
  }
});
