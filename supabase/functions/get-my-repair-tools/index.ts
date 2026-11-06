import { z } from 'npm:zod@4';
import { authenticate, respond, preflight, handleError, jsonBody, rateLimit } from '../_shared/http.ts';

const Input = z.object({ device_id: z.string().uuid() }).strict();
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  try {
    const { user, profile, admin } = await authenticate(req);
    if (profile.role !== 'member') throw Object.assign(new Error('Member account required'), { status: 403 });
    await rateLimit(admin, `catalog:${user.id}`, 60, 60);
    const checked = Input.safeParse(await jsonBody(req));
    if (!checked.success) return respond(req, { error: { code: 'INVALID_DEVICE', issues: checked.error.issues } }, 422);
    const deviceId = checked.data.device_id;
    const { data: device, error: deviceError } = await admin.from('devices')
      .select('id').eq('id', deviceId).eq('user_id', user.id).is('revoked_at', null).single();
    if (deviceError || !device) throw Object.assign(new Error('Active registered device required'), { status: 403 });

    await admin.from('devices').update({ last_seen_at: new Date().toISOString() }).eq('id', deviceId);
    const { data: tools, error } = await admin.from('repair_tools')
      .select('id,slug,audience').eq('status', 'PUBLISHED');
    if (error) throw error;
    const publishedIds = new Set((tools ?? []).map((tool) => tool.id));
    const allMemberToolIds = (tools ?? []).filter((tool) => tool.audience === 'all_active_members').map((tool) => tool.id);
    const { data: assignments, error: assignmentError } = await admin.from('repair_tool_access')
      .select('tool_id').eq('member_id', user.id);
    if (assignmentError) throw assignmentError;
    const assignedPublishedIds = (assignments ?? []).map((assignment) => assignment.tool_id)
      .filter((id) => publishedIds.has(id));
    const allowed = new Set([...allMemberToolIds, ...assignedPublishedIds]);
    if (!allowed.size) return respond(req, { data: [] });

    const { data: versions, error: versionError } = await admin.from('repair_tool_versions')
      .select('tool_id,version,canonical_payload,signature,signature_algorithm,published_at')
      .in('tool_id', [...allowed]).order('version', { ascending: false });
    if (versionError) throw versionError;
    const latest = new Map<string, typeof versions[number]>();
    for (const version of versions ?? []) if (!latest.has(version.tool_id)) latest.set(version.tool_id, version);
    const syncRows = [...latest.entries()].map(([tool_id, version]) => ({
      device_id: deviceId, user_id: user.id, tool_id, version: version.version,
    }));
    if (syncRows.length) {
      const { error: syncError } = await admin.from('device_tool_syncs').upsert(syncRows, { onConflict: 'device_id,tool_id' });
      if (syncError) throw syncError;
    }
    return respond(req, {
      data: [...latest.entries()].map(([tool_id, version]) => ({
        tool_id,
        version: version.version,
        signed_payload: version.canonical_payload,
        signature: version.signature,
        signature_algorithm: version.signature_algorithm,
        published_at: version.published_at,
      })),
    });
  } catch (error) {
    return handleError(req, error);
  }
});
