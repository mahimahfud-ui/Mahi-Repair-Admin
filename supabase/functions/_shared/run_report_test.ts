import { hasAuthorizedRunStepIds } from './run-report.ts';

Deno.test('normal run results must use signed recipe step IDs', () => {
  const recipeIds = new Set(['check-internet', 'verify-dns']);
  if (!hasAuthorizedRunStepIds('SUCCESS', [
    { step_id: 'check-internet', status: 'SUCCESS' },
  ], recipeIds)) throw new Error('A signed recipe step was rejected');
  if (hasAuthorizedRunStepIds('FAILED', [
    { step_id: 'not-in-recipe', status: 'FAILED' },
  ], recipeIds)) throw new Error('An arbitrary step ID was accepted');
});

Deno.test('only a single failed engine precheck may use a reserved system ID', () => {
  const recipeIds = new Set(['check-internet']);
  if (!hasAuthorizedRunStepIds('FAILED', [
    { step_id: 'verify_sig', status: 'FAILED' },
  ], recipeIds)) throw new Error('A failed signature precheck was rejected');
  if (hasAuthorizedRunStepIds('SUCCESS', [
    { step_id: 'verify_sig', status: 'FAILED' },
  ], recipeIds)) throw new Error('A precheck failure was accepted as a successful run');
  if (hasAuthorizedRunStepIds('FAILED', [
    { step_id: 'verify_sig', status: 'FAILED' },
    { step_id: 'unknown', status: 'FAILED' },
  ], recipeIds)) throw new Error('Additional untrusted step IDs were accepted');
});
