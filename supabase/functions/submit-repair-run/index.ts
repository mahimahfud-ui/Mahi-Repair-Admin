import { authenticate, respond, preflight, handleError, jsonBody, rateLimit } from '../_shared/http.ts';
import { z } from 'npm:zod@4';
import {
  fingerprintRunReport,
  hasAuthorizedRunStepIds,
  mapRunRpcError,
  resolveRunSubmissionOutcome,
} from '../_shared/run-report.ts';

const ErrorCode = z.string().regex(/^[A-Z0-9_:-]{1,100}$/);
const Run = z.object({
  // Must equal Android RepairRunReport.runId exactly (UUID string).
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  try {
    const { user, profile, admin } = await authenticate(req);
    if (profile.role !== 'member') throw Object.assign(new Error('Member account required'), { status: 403 });
    await rateLimit(admin, `run:${user.id}`, 60, 60);

    const checked = Run.safeParse(await jsonBody(req));
    if (!checked.success) return respond(req, { error: { code: 'INVALID_RUN', issues: checked.error.issues } }, 422);
    const value = checked.data;

    // This read provides early, user-friendly step validation. The SQL RPC
    // repeats identity, device, assignment, publication/version, compatibility
    // and step checks under row locks in the same transaction as the insert.
    const { data: version, error: versionError } = await admin.from('repair_tool_versions')
      .select('payload')
      .eq('tool_id', value.tool_id)
      .eq('version', value.tool_version)
      .maybeSingle();
    if (versionError) throw versionError;
    if (!version) throw Object.assign(new Error('The submitted recipe version is unavailable.'), { status: 409 });
    const payload = version.payload as { steps?: Array<{ id: string }> };
    const knownStepIds = new Set((payload.steps ?? []).map((step) => step.id));
    if (!hasAuthorizedRunStepIds(value.result, value.step_results, knownStepIds)) {
      throw Object.assign(new Error('The report contains a step that is not part of the authorized recipe.'), { status: 422 });
    }

    const fingerprint = await fingerprintRunReport(user.id, value.run_id, value);
    const { data, error } = await admin.rpc('submit_repair_run_idempotent', {
      p_run_id: value.run_id,
      p_user_id: user.id,
      p_device_id: value.device_id,
      p_tool_id: value.tool_id,
      p_tool_version: value.tool_version,
      p_started_at: value.started_at,
      p_completed_at: value.completed_at ?? null,
      p_result: value.result,
      p_step_results: value.step_results,
      p_error_code: value.error_code ?? null,
      p_app_version: value.app_version,
      p_request_fingerprint: fingerprint,
    });

    if (error) {
      const mapped = mapRunRpcError(error.message);
      if (mapped) throw Object.assign(new Error(mapped.message), { status: mapped.status });
      throw error;
    }

    const outcome = resolveRunSubmissionOutcome(data, value.run_id);
    if (outcome.conflict) {
      return respond(req, {
        error: { code: 'RUN_ID_CONFLICT', message: 'This run ID was already used for different report content or another identity.' },
      }, 409);
    }

    // SUCCESS is a device-reported outcome, not cryptographic proof of physical
    // repair. The server validates authorization and report integrity only.
    return respond(req, {
      data: { run_id: value.run_id, accepted: true, duplicate: outcome.duplicate },
    }, outcome.httpStatus);
  } catch (error) {
    return handleError(req, error);
  }
});
