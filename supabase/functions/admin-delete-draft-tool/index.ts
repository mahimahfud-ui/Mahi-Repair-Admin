import { z } from 'npm:zod@4';
import { requireOwner, respond, preflight, handleError, jsonBody, rateLimit, audit } from '../_shared/http.ts';

const Input = z.object({ tool_id: z.string().uuid() }).strict();
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  try {
    const { user, admin } = await requireOwner(req);
    await rateLimit(admin, `tool-delete:${user.id}`, 10, 60);
    const parsed = Input.safeParse(await jsonBody(req));
    if (!parsed.success) return respond(req, { error: { code: 'INVALID_TOOL', issues: parsed.error.issues } }, 422);
    const { data: tool, error: findError } = await admin.from('repair_tools')
      .select('id,status,version,slug').eq('id', parsed.data.tool_id).single();
    if (findError || !tool) throw Object.assign(new Error('Tool not found'), { status: 404 });
    if (tool.version !== 0 || !['DRAFT', 'TESTING'].includes(tool.status)) {
      throw Object.assign(new Error('Only unpublished draft/testing tools can be deleted.'), { status: 409 });
    }
    const { error } = await admin.from('repair_tools').delete().eq('id', tool.id);
    if (error) throw error;
    await audit(admin, user.id, 'tool.draft.deleted', 'repair_tool', tool.id, { slug: tool.slug });
    return respond(req, { data: { deleted: true } });
  } catch (error) {
    return handleError(req, error);
  }
});
