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
    if (!checked.success) return respond(req, { error: { code: 'INVALID_TOOL_REQUEST', issues: checked.error.issues } }, 422);
    const { tool_id: toolId, device_id: deviceId } = checked.data;
    const { data: device } = await admin.from('devices').select('id')
      .eq('id', deviceId).eq('user_id', user.id).is('revoked_at', null).maybeSingle();
    if (!device) throw Object.assign(new Error('Active registered device required'), { status: 403 });
    const { data: tool, error } = await admin.from('repair_tools')
      .select('id,slug,status,audience').eq('id', toolId).single();
    if (error || !tool || tool.status !== 'PUBLISHED') throw Object.assign(new Error('Published tool not found'), { status: 404 });
    if (tool.audience === 'selected_members') {
      const { data: access } = await admin.from('repair_tool_access').select('id')
        .eq('tool_id', toolId).eq('member_id', user.id).maybeSingle();
      if (!access) throw Object.assign(new Error('You do not have access to this tool'), { status: 403 });
    }
    const { data: version, error: versionError } = await admin.from('repair_tool_versions')
      .select('canonical_payload,signature,signature_algorithm,version')
      .eq('tool_id', toolId).order('version', { ascending: false }).limit(1).single();
    if (versionError || !version) throw Object.assign(new Error('No published version'), { status: 404 });
    return respond(req, {
      signed_payload: version.canonical_payload,
      signature: version.signature,
      signature_algorithm: version.signature_algorithm,
      version: version.version,
    });
  } catch (error) {
    return handleError(req, error);
  }
});
