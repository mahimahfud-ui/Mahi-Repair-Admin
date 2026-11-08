import { requireOwner, respond, preflight, handleError, rateLimit } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  try {
    const { user, admin } = await requireOwner(req);
    await rateLimit(admin, 'owner-dashboard:' + user.id, 30, 60);

    const [analyticsResult, toolsResult, profilesResult, devicesResult, runsResult, auditResult] =
      await Promise.all([
        admin.rpc('get_admin_analytics'),
        admin.from('repair_tools')
          .select('id,slug,name,category,description,status,version,audience,draft_recipe,android_compatibility,estimated_seconds,repair_instructions,created_at,updated_at')
          .order('updated_at', { ascending: false })
          .limit(250),
        admin.from('profiles')
          .select('id,email,display_name,role,status,created_at')
          .eq('role', 'member')
          .order('created_at', { ascending: false })
          .limit(500),
        admin.from('devices')
          .select('id,user_id,device_label,app_version,android_version,android_api,revoked_at,last_seen_at,registered_at,hardware_profile,telemetry,field_availability,profile_updated_at')
          .order('last_seen_at', { ascending: false })
          .limit(250),
        admin.from('repair_runs')
          .select('id,tool_id,user_id,result,started_at,created_at,step_results,error_code')
          .order('created_at', { ascending: false })
          .limit(20),
        admin.from('admin_audit_logs')
          .select('id,actor_id,action,target_type,target_id,details,created_at')
          .order('created_at', { ascending: false })
          .limit(100),
      ]);

    const failure = [
      analyticsResult.error,
      toolsResult.error,
      profilesResult.error,
      devicesResult.error,
      runsResult.error,
      auditResult.error,
    ].find(Boolean);
    if (failure) throw failure;

    const profiles = profilesResult.data ?? [];
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
    const toolRows = toolsResult.data ?? [];
    const toolById = new Map(toolRows.map((tool) => [tool.id, tool]));

    const tools = toolRows.map((tool) => {
      const compatibility = tool.android_compatibility ?? {};
      const instructions = Array.isArray(tool.repair_instructions)
        ? tool.repair_instructions.map(String)
        : [];
      return {
        id: tool.id,
        slug: tool.slug,
        name: tool.name,
        category: tool.category,
        description: tool.description ?? '',
        problemDescription: instructions.join('\n'),
        status: tool.status,
        version: tool.version,
        audience: tool.audience,
        estimatedSeconds: tool.estimated_seconds,
        minAndroidSdk: Number(compatibility.minApi ?? compatibility.minAndroidApi ?? 26),
        createdAt: tool.created_at,
        updatedAt: tool.updated_at,
        draftRecipe: tool.draft_recipe ?? {},
      };
    });

    const members = profiles.map((profile) => ({
      id: profile.id,
      email: profile.email ?? '',
      displayName: profile.display_name ?? '',
      role: profile.role,
      status: profile.status,
      createdAt: profile.created_at,
      lastSignInAt: null,
    }));

    const deviceRows = devicesResult.data ?? [];
    const devices = deviceRows.map((device) => ({
      id: device.id,
      userId: device.user_id,
      userEmail: profileById.get(device.user_id)?.email ?? null,
      deviceLabel: device.device_label ?? '',
      appVersion: device.app_version,
      androidVersion: device.android_version,
      androidApi: device.android_api ?? 0,
      revokedAt: device.revoked_at,
      lastSeenAt: device.last_seen_at,
      createdAt: device.registered_at,
      hardwareProfile: device.hardware_profile ?? {},
      telemetry: device.telemetry ?? {},
      fieldAvailability: device.field_availability ?? {},
      profileUpdatedAt: device.profile_updated_at,
    }));

    const recentRuns = (runsResult.data ?? []).map((run) => ({
      runId: run.id,
      toolId: run.tool_id,
      toolName: toolById.get(run.tool_id)?.name ?? null,
      userEmail: profileById.get(run.user_id)?.email ?? null,
      result: run.result,
      startedAt: run.started_at ?? run.created_at,
      durationMs: 0,
      stepCount: Array.isArray(run.step_results) ? run.step_results.length : 0,
    }));

    const auditLogs = (auditResult.data ?? []).map((entry) => ({
      id: entry.id,
      actorId: entry.actor_id,
      action: entry.action,
      targetType: entry.target_type,
      targetId: entry.target_id,
      details: entry.details ?? {},
      createdAt: entry.created_at,
    }));

    const totals = analyticsResult.data ?? {};
    const totalRuns = Number(totals.total_runs ?? 0);
    const successfulRuns = Number(totals.success ?? 0);
    const analytics = {
      totalRuns,
      successRate: totalRuns > 0 ? (successfulRuns / totalRuns) * 100 : 0,
      activeMembersCount: profiles.filter((profile) => profile.status === 'active').length,
      activeDevicesCount: deviceRows.filter((device) => device.revoked_at == null).length,
      totalTools: toolRows.length,
      publishedTools: Number(totals.published_tools ?? 0),
      recentRuns,
    };

    return respond(req, {
      data: { analytics, tools, members, devices, auditLogs },
    });
  } catch (error) {
    return handleError(req, error);
  }
});
