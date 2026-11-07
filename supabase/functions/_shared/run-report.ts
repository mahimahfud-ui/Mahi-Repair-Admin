import { canonicalJson } from './recipe.ts';

export type SubmittedStepResult = {
  step_id: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'CANCELLED';
  error_code?: string;
};

const PRECHECK_FAILURE_STEP_IDS = new Set([
  'verify_sig',
  'parse_schema',
  'recipe_identity',
  'app_version_check',
  'compat_check',
]);

/**
 * A single failed preflight result may use an Android engine-owned system ID.
 * All normal execution results must reference a step in the signed recipe.
 */
export function hasAuthorizedRunStepIds(
  runResult: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'CANCELLED',
  submittedSteps: SubmittedStepResult[],
  recipeStepIds: Set<string>,
): boolean {
  const unknown = submittedSteps.filter((step) => !recipeStepIds.has(step.step_id));
  if (unknown.length === 0) return true;

  return runResult === 'FAILED' &&
    submittedSteps.length === 1 &&
    submittedSteps[0].status === 'FAILED' &&
    PRECHECK_FAILURE_STEP_IDS.has(submittedSteps[0].step_id);
}

export type RunReportFingerprintInput = {
  device_id: string;
  tool_id: string;
  tool_version: number;
  started_at: string;
  completed_at?: string;
  result: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
  step_results: SubmittedStepResult[];
  error_code?: string;
  app_version: string;
};

/** Fingerprint normalized report content and its authenticated identity. */
export async function fingerprintRunReport(
  userId: string,
  runId: string,
  report: RunReportFingerprintInput,
): Promise<string> {
  const canonical = canonicalJson({
    run_id: runId,
    user_id: userId,
    device_id: report.device_id,
    tool_id: report.tool_id,
    tool_version: report.tool_version,
    started_at: new Date(report.started_at).toISOString(),
    completed_at: report.completed_at ? new Date(report.completed_at).toISOString() : null,
    result: report.result,
    step_results: report.step_results,
    error_code: report.error_code ?? null,
    app_version: report.app_version,
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export type RunSubmissionOutcome =
  | { httpStatus: 201 | 200; duplicate: boolean; conflict: false }
  | { httpStatus: 409; duplicate: false; conflict: true };

/** Interpret only the server transaction result; the client cannot choose this. */
export function resolveRunSubmissionOutcome(
  value: unknown,
  expectedRunId: string,
): RunSubmissionOutcome {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid idempotent run submission response.');
  }
  const result = value as Record<string, unknown>;
  if (result.conflict === true && result.run_id === expectedRunId) {
    return { httpStatus: 409, duplicate: false, conflict: true };
  }
  if (result.accepted !== true || result.run_id !== expectedRunId || typeof result.duplicate !== 'boolean') {
    throw new Error('Invalid idempotent run submission response.');
  }
  return result.duplicate
    ? { httpStatus: 200, duplicate: true, conflict: false }
    : { httpStatus: 201, duplicate: false, conflict: false };
}

export type RunRpcError = { status: 403 | 404 | 409 | 422; code: string; message: string };

/** Convert stable SQL error tokens into client-safe HTTP errors. */
export function mapRunRpcError(message: string): RunRpcError | null {
  const cases: Array<[string, RunRpcError]> = [
    ['ACTIVE_MEMBER_REQUIRED', { status: 403, code: 'MEMBER_INACTIVE', message: 'An active member account is required.' }],
    ['INVALID_DEVICE', { status: 403, code: 'INVALID_DEVICE', message: 'The registered device does not belong to this account.' }],
    ['DEVICE_REVOKED', { status: 403, code: 'DEVICE_REVOKED', message: 'This device has been revoked.' }],
    ['TOOL_NOT_PUBLISHED', { status: 403, code: 'TOOL_NOT_PUBLISHED', message: 'This repair is not currently published.' }],
    ['TOOL_ACCESS_DENIED', { status: 403, code: 'TOOL_ACCESS_DENIED', message: 'This account is not assigned to this repair.' }],
    ['CURRENT_PUBLISHED_VERSION_MISSING', { status: 409, code: 'VERSION_UNAVAILABLE', message: 'The current published recipe version is unavailable.' }],
    ['STALE_RECIPE_VERSION', { status: 409, code: 'STALE_RECIPE_VERSION', message: 'This repair version is no longer current. Refresh the repair catalog.' }],
    ['DEVICE_APP_VERSION_MISMATCH', { status: 409, code: 'DEVICE_APP_VERSION_MISMATCH', message: 'Refresh device registration before submitting this report.' }],
    ['ANDROID_API_INCOMPATIBLE', { status: 409, code: 'ANDROID_API_INCOMPATIBLE', message: 'This device does not meet the recipe Android API requirement.' }],
    ['APP_VERSION_INCOMPATIBLE', { status: 409, code: 'APP_VERSION_INCOMPATIBLE', message: 'The installed app version does not meet the recipe requirement.' }],
    ['INVALID_STEP_IDS', { status: 422, code: 'INVALID_STEP_IDS', message: 'The report contains a step that is not part of the authorized recipe.' }],
    ['INVALID_REPORT', { status: 422, code: 'INVALID_REPORT', message: 'The repair report is invalid.' }],
  ];
  return cases.find(([token]) => message.includes(token))?.[1] ?? null;
}
