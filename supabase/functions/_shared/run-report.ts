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
