import { z } from 'npm:zod@4';
import { requireOwner, respond, preflight, handleError, jsonBody, rateLimit, audit } from '../_shared/http.ts';
const Input = z.object({ tool_id: z.string().uuid(), disabled: z.boolean() }).strict();
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  try {
    const { user, admin } = await requireOwner(req);
    await rateLimit(admin, `tool-disable:${user.id}`, 20, 60);
    const parsed = Input.safeParse(await jsonBody(req));
    if (!parsed.success) return respond(req, { error: { code: 'INVALID_TOOL_STATE', issues: parsed.error.issues } }, 422);
    const { tool_id, disabled } = parsed.data;
    const { data: tool, error: findError } = await admin.from('repair_tools').select('id,status,version').eq('id', tool_id).single();
    if (findError || !tool) throw Object.assign(new Error('Tool not found'), { status: 404 });
    if (disabled && tool.status !== 'PUBLISHED') throw Object.assign(new Error('Only published tools can be disabled.'), { status: 409 });
    if (!disabled && tool.status !== 'DISABLED') throw Object.assign(new Error('Only disabled tools can be re-enabled.'), { status: 409 });
    if (!disabled && tool.version < 1) throw Object.assign(new Error('A tool must have a published version before it can be enabled.'), { status: 409 });
    const nextStatus = disabled ? 'DISABLED' : 'PUBLISHED';
    const { data: updated, error } = await admin.from('repair_tools').update({ status: nextStatus }).eq('id', tool_id).eq('status', tool.status).select('id,status').maybeSingle();
    if (error) throw error;
    if (!updated) throw Object.assign(new Error('Tool state changed concurrently. Reload and retry.'), { status: 409 });
    await audit(admin, user.id, disabled ? 'tool.disabled' : 'tool.enabled', 'repair_tool', tool_id, {});
    return respond(req, { data: updated });
  } catch (error) { return handleError(req, error); }
});
