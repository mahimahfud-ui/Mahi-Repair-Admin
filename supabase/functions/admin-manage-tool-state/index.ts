import { z } from 'npm:zod@4';
import { requireOwner, respond, preflight, handleError, jsonBody, rateLimit, audit } from '../_shared/http.ts';
const Input = z.object({ tool_id: z.string().uuid(), status: z.enum(['DRAFT', 'TESTING', 'ARCHIVED']) }).strict();
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  try {
    const { user, admin } = await requireOwner(req);
    await rateLimit(admin, `tool-state:${user.id}`, 20, 60);
    const parsed = Input.safeParse(await jsonBody(req));
    if (!parsed.success) return respond(req, { error: { code: 'INVALID_TOOL_STATE', issues: parsed.error.issues } }, 422);
    const { tool_id, status } = parsed.data;
    const { data: tool, error: findError } = await admin.from('repair_tools').select('id,status,version').eq('id', tool_id).single();
    if (findError || !tool) throw Object.assign(new Error('Tool not found'), { status: 404 });
    if (tool.status === 'ARCHIVED') throw Object.assign(new Error('Archived tools cannot be changed.'), { status: 409 });
    const { data: updated, error: updateError } = await admin.from('repair_tools').update({ status }).eq('id', tool_id).eq('status', tool.status).select('id,status').maybeSingle();
    if (updateError) throw updateError;
    if (!updated) throw Object.assign(new Error('Tool state changed concurrently. Reload and retry.'), { status: 409 });
    await audit(admin, user.id, status === 'ARCHIVED' ? 'tool.archived' : 'tool.unpublished_or_test_state_changed', 'repair_tool', tool_id, { from: tool.status, to: status, version: tool.version });
    return respond(req, { data: updated });
  } catch (error) { return handleError(req, error); }
});
