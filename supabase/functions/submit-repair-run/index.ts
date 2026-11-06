import { authenticate, respond, preflight, handleError, jsonBody, rateLimit } from '../_shared/http.ts';
import { z } from 'npm:zod@4';
import { hasAuthorizedRunStepIds, matchesExistingRun } from '../_shared/run-report.ts';

const ErrorCode = z.string().regex(/^[A-Z0-9_:-]{1,100}$/);
const Run = z.object({
  run_id: z.string().uuid(),
  device_id: z.string().uuid(),
  tool_id: z.string().uuid(),
  tool_version: z.number().int().positive(),
  started_at: z.string().datetime(),
  completed_at: z.string().datetime().optional(),
  result: z.enum(['SUCCESS', 'PARTIAL', 'FAILED', 'CANCELLED']),
  step_results: z.array(z.object({
    step_id: z.string().min(1).max(80),
    status: z.enum(['SUCCESS', 'FAILED', 'SKIPPED', 'CANCELLED']),
    error_code: ErrorCode.optional(),
  }).strict()).min(1).max(50),
  error_code: ErrorCode.optional(),
  app_version: z.string().max(30).regex(/^\d+(?:\.\d+){0,3}$/),
}).strict().superRefine((value, ctx) => {
  if (value.completed_at && Date.parse(value.completed_at) < Date.parse(value.started_at)) {
    ctx.addIssue({ code: 'custom', path: ['completed_at'], message: 'Completion time cannot precede start time.' });
  }
  const ids = new Set<string>();
  value.step_results.forEach((step, index) => {
    if (ids.has(step.step_id)) ctx.addIssue({ code: 'custom', path: ['step_results', index, 'step_id'], message: 'Duplicate step result.' });
    ids.add(step.step_id);
  });
  const statuses = value.step_results.map((step) => step.status);
  if (value.result === 'SUCCESS' && !statuses.includes('SUCCESS')) {
    ctx.addIssue({ code: 'custom', path: ['step_results'], message: 'A successful run must contain at least one completed recipe step.' });
  }
  if (value.result === 'PARTIAL' && (!statuses.includes('FAILED') || !statuses.includes('SUCCESS'))) {
    ctx.addIssue({ code: 'custom', path: ['step_results'], message: 'A partial run must contain both completed and failed steps.' });
  }
  if (value.result === 'FAILED' && !statuses.includes('FAILED')) {
    ctx.addIssue({ code: 'custom', path: ['step_results'], message: 'A failed run must contain a failed step or failed precheck.' });
  }
  if (value.result === 'CANCELLED' && !statuses.includes('CANCELLED')) {
    ctx.addIssue({ code: 'custom', path: ['step_results'], message: 'A cancelled run must contain a cancelled step.' });
  }
});

function compareVersions(a: string, b: string): number {
  const left = a.split('.').map((v) => Number.parseInt(v, 10));
  const right = b.split('.').map((v) => Number.parseInt(v, 10));
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  try {
    const { user, profile, admin } = await authenticate(req);
    if (profile.role !== 'member') throw Object.assign(new Error('Member account required'), { status: 403 });
    await rateLimit(admin, `run:${user.id}`, 60, 60);
    const checked = Run.safeParse(await jsonBody(req));
    if (!checked.success) return respond(req, { error: { code: 'INVALID_RUN', issues: checked.error.issues } }, 422);
    const value = checked.data;

    // Resolve an accepted retry before checking mutable device/tool state. The initial
    // acceptance remains idempotent after a later device revoke or tool disable.
    const findAcceptedDuplicate = async (): Promise<Response | null> => {
      const { data: existing, error } = await admin.from('repair_runs')
        .select('id,user_id,device_id,tool_id,tool_version,started_at,completed_at,result,step_results,error_code,app_version')
        .eq('id', value.run_id)
        .maybeSingle();
      if (error) throw error;
      if (!existing) return null;
      if (!matchesExistingRun(existing, user.id, value)) {
        throw Object.assign(new Error('This run ID was already used with different report content.'), { status: 409 });
      }
      return respond(req, { data: { run_id: existing.id, accepted: true, duplicate: true } }, 200);
    };

    const acceptedDuplicate = await findAcceptedDuplicate();
    if (acceptedDuplicate) return acceptedDuplicate;

    const { data: device, error: deviceError } = await admin.from('devices')
      .select('id,user_id,revoked_at,android_api,app_version').eq('id', value.device_id).eq('user_id', user.id).single();
    if (deviceError || !device || device.revoked_at) throw Object.assign(new Error('Active registered device required'), { status: 403 });
    if (device.app_version !== value.app_version) throw Object.assign(new Error('Refresh device registration before submitting this run.'), { status: 409 });

    const { data: tool, error: toolError } = await admin.from('repair_tools').select('id,slug,status,audience,version').eq('id', value.tool_id).single();
    if (toolError || !tool || tool.status !== 'PUBLISHED') throw Object.assign(new Error('This repair is not currently published.'), { status: 403 });
    if (tool.version !== value.tool_version) throw Object.assign(new Error('This repair version is no longer current. Refresh the repair list.'), { status: 409 });
    if (tool.audience === 'selected_members') {
      const { data: access } = await admin.from('repair_tool_access').select('id').eq('tool_id', value.tool_id).eq('member_id', user.id).maybeSingle();
      if (!access) throw Object.assign(new Error('No access to tool'), { status: 403 });
    }

    const { data: version, error: versionError } = await admin.from('repair_tool_versions')
      .select('id,payload').eq('tool_id', value.tool_id).eq('version', value.tool_version).maybeSingle();
    if (versionError || !version) throw Object.assign(new Error('Unknown tool version'), { status: 400 });
    const payload = version.payload as { minAndroidApi?: number; minAppVersion?: string; steps?: Array<{ id: string }> };
    if ((device.android_api ?? 0) < (payload.minAndroidApi ?? 23)) throw Object.assign(new Error('Device Android API is below the recipe requirement.'), { status: 409 });
    if (payload.minAppVersion && compareVersions(value.app_version, payload.minAppVersion) < 0) throw Object.assign(new Error('Android app version is below the recipe requirement.'), { status: 409 });
    const knownStepIds = new Set((payload.steps ?? []).map((step) => step.id));
    if (!hasAuthorizedRunStepIds(value.result, value.step_results, knownStepIds)) throw Object.assign(new Error('Run contains a step ID that is not part of the signed recipe.'), { status: 422 });

    const { data, error } = await admin.from('repair_runs')
      .insert({
        id: value.run_id,
        device_id: value.device_id,
        tool_id: value.tool_id,
        tool_version: value.tool_version,
        started_at: value.started_at,
        completed_at: value.completed_at ?? null,
        result: value.result,
        step_results: value.step_results,
        error_code: value.error_code ?? null,
        app_version: value.app_version,
        user_id: user.id,
      })
      .select('id')
      .single();

    if (error) {
      // A concurrent retry may win the primary-key insert. Re-read and compare every field.
      if (error.code === '23505') {
        const duplicate = await findAcceptedDuplicate();
        if (duplicate) return duplicate;
        throw Object.assign(new Error('The run ID conflicts with an existing report.'), { status: 409 });
      }
      throw error;
    }
    return respond(req, { data: { run_id: data.id, accepted: true, duplicate: false } }, 201);
  } catch (error) { return handleError(req, error); }
});
