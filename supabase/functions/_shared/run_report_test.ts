import { hasAuthorizedRunStepIds, matchesExistingRun } from './run-report.ts';

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


Deno.test('report retries with the same run ID and content are idempotent', () => {
  const submitted = {
    run_id: '11111111-1111-4111-8111-111111111111',
    device_id: '22222222-2222-4222-8222-222222222222',
    tool_id: '33333333-3333-4333-8333-333333333333',
    tool_version: 4,
    started_at: '2026-11-06T10:00:00.000Z',
    completed_at: '2026-11-06T10:00:10.000Z',
    result: 'SUCCESS' as const,
    step_results: [{ step_id: 'check-internet', status: 'SUCCESS' as const }],
    app_version: '1.0.0',
  };
  const stored = {
    id: submitted.run_id,
    user_id: 'member-id',
    device_id: submitted.device_id,
    tool_id: submitted.tool_id,
    tool_version: submitted.tool_version,
    started_at: '2026-11-06T10:00:00+00:00',
    completed_at: '2026-11-06T10:00:10+00:00',
    result: submitted.result,
    step_results: submitted.step_results,
    error_code: null,
    app_version: submitted.app_version,
  };
  if (!matchesExistingRun(stored, 'member-id', submitted)) {
    throw new Error('An identical retry was not recognized as the same report');
  }
});

Deno.test('reusing a run ID with changed content or another member is rejected', () => {
  const submitted = {
    run_id: '11111111-1111-4111-8111-111111111111',
    device_id: '22222222-2222-4222-8222-222222222222',
    tool_id: '33333333-3333-4333-8333-333333333333',
    tool_version: 4,
    started_at: '2026-11-06T10:00:00.000Z',
    completed_at: '2026-11-06T10:00:10.000Z',
    result: 'SUCCESS' as const,
    step_results: [{ step_id: 'check-internet', status: 'SUCCESS' as const }],
    app_version: '1.0.0',
  };
  const stored = {
    id: submitted.run_id,
    user_id: 'member-id',
    device_id: submitted.device_id,
    tool_id: submitted.tool_id,
    tool_version: submitted.tool_version,
    started_at: submitted.started_at,
    completed_at: submitted.completed_at,
    result: submitted.result,
    step_results: submitted.step_results,
    error_code: null,
    app_version: submitted.app_version,
  };
  if (matchesExistingRun(stored, 'different-member-id', submitted)) {
    throw new Error('A report belonging to another member was treated as a retry');
  }
  if (matchesExistingRun(stored, 'member-id', { ...submitted, result: 'FAILED' })) {
    throw new Error('A conflicting payload reused an accepted run ID');
  }
});
