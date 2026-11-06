export type SubmittedStepResult = {
  step_id: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'CANCELLED';
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


export type RunReportSubmission = {
  run_id: string;
  device_id: string;
  tool_id: string;
  tool_version: number;
  started_at: string;
  completed_at?: string;
  result: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
  step_results: Array<{
    step_id: string;
    status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'CANCELLED';
    error_code?: string;
  }>;
  error_code?: string;
  app_version: string;
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sameInstant(left: unknown, right: unknown): boolean {
  if (left == null || right == null) return left == null && right == null;
  const leftMillis = Date.parse(String(left));
  const rightMillis = Date.parse(String(right));
  return Number.isFinite(leftMillis) && leftMillis === rightMillis;
}

/** Accept identical retries only; a reused run UUID with altered content is a conflict. */
export function matchesExistingRun(
  existing: Record<string, unknown>,
  authenticatedUserId: string,
  submitted: RunReportSubmission,
): boolean {
  return existing.id === submitted.run_id &&
    existing.user_id === authenticatedUserId &&
    existing.device_id === submitted.device_id &&
    existing.tool_id === submitted.tool_id &&
    existing.tool_version === submitted.tool_version &&
    sameInstant(existing.started_at, submitted.started_at) &&
    sameInstant(existing.completed_at, submitted.completed_at ?? null) &&
    existing.result === submitted.result &&
    stableJson(existing.step_results) === stableJson(submitted.step_results) &&
    (existing.error_code ?? null) === (submitted.error_code ?? null) &&
    existing.app_version === submitted.app_version;
}
