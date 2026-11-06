import { z } from 'npm:zod@4';
import { requireOwner, respond, preflight, handleError, jsonBody, rateLimit } from '../_shared/http.ts';
const Input = z.object({
  tool_id: z.string().uuid(),
  audience: z.enum(['all_active_members', 'selected_members']),
  member_ids: z.array(z.string().uuid()).max(500).optional(),
}).strict().superRefine((v, ctx) => {
  if (v.audience === 'selected_members' && (!v.member_ids || v.member_ids.length === 0)) {
    ctx.addIssue({ code: 'custom', path: ['member_ids'], message: 'Select at least one active member.' });
  }
});
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  try {
    const { user, admin } = await requireOwner(req);
    await rateLimit(admin, `assign:${user.id}`, 30, 60);
    const parsed = Input.safeParse(await jsonBody(req));
    if (!parsed.success) return respond(req, { error: { code: 'INVALID_ASSIGNMENT', issues: parsed.error.issues } }, 422);
    const { tool_id, audience, member_ids = [] } = parsed.data;
    const { error } = await admin.rpc('replace_repair_tool_access', {
      p_tool_id: tool_id,
      p_member_ids: member_ids,
      p_assigned_by: user.id,
      p_audience: audience,
    });
    if (error) throw Object.assign(new Error('Unable to update tool access. Check that every selected member is active.'), { status: 409 });
    return respond(req, { data: { success: true, audience } });
  } catch (error) { return handleError(req, error); }
});
