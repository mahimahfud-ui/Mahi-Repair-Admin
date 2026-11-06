import { canonicalJson } from './recipe.ts';
import {
  fingerprintRunReport,
  hasAuthorizedRunStepIds,
  mapRunRpcError,
  resolveRunSubmissionOutcome,
} from './run-report.ts';

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

Deno.test('first accepted report receives HTTP 201', () => {
  const outcome = resolveRunSubmissionOutcome(
    { accepted: true, duplicate: false, run_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  );
  if (outcome.httpStatus !== 201 || outcome.duplicate || outcome.conflict) throw new Error('First report outcome was incorrect');
});

Deno.test('identical retry receives HTTP 200 and is marked duplicate', () => {
  const outcome = resolveRunSubmissionOutcome(
    { accepted: true, duplicate: true, run_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  );
  if (outcome.httpStatus !== 200 || !outcome.duplicate || outcome.conflict) throw new Error('Identical retry outcome was incorrect');
});

Deno.test('conflicting reuse of a run ID receives HTTP 409', () => {
  const outcome = resolveRunSubmissionOutcome(
    { conflict: true, run_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  );
  if (outcome.httpStatus !== 409 || !outcome.conflict) throw new Error('Conflicting retry was not rejected');
});

Deno.test('fingerprint is stable for identical content and changes with identity/content', async () => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const report = {
    device_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    tool_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    tool_version: 2,
    started_at: '2026-11-06T10:00:00Z',
    completed_at: '2026-11-06T10:01:00Z',
    result: 'SUCCESS' as const,
    step_results: [{ step_id: 'check-internet', status: 'SUCCESS' as const }],
    app_version: '1.2.0',
  };
  const first = await fingerprintRunReport('dddddddd-dddd-4ddd-8ddd-dddddddddddd', id, report);
  const retry = await fingerprintRunReport('dddddddd-dddd-4ddd-8ddd-dddddddddddd', id, report);
  const changedContent = await fingerprintRunReport('dddddddd-dddd-4ddd-8ddd-dddddddddddd', id, { ...report, tool_version: 3 });
  const changedIdentity = await fingerprintRunReport('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', id, report);
  if (first !== retry) throw new Error('Identical report fingerprint was not stable');
  if (first === changedContent) throw new Error('Changed content reused the same fingerprint');
  if (first === changedIdentity) throw new Error('Different member identity reused the same fingerprint');
});

Deno.test('server RPC authorization failures map to fail-closed statuses', () => {
  const invalid = mapRunRpcError('INVALID_DEVICE');
  const revoked = mapRunRpcError('DEVICE_REVOKED');
  const stale = mapRunRpcError('STALE_RECIPE_VERSION');
  const invalidSteps = mapRunRpcError('INVALID_STEP_IDS');
  if (invalid?.status !== 403 || revoked?.status !== 403) throw new Error('Invalid/revoked device was not forbidden');
  if (stale?.status !== 409) throw new Error('Stale recipe version was not a conflict');
  if (invalidSteps?.status !== 422) throw new Error('Unauthorized step IDs were not rejected');
});

Deno.test('fingerprint canonicalization matches the recipe canonical JSON contract', () => {
  const left = canonicalJson({ a: 1, b: { c: 2, d: 3 } });
  const right = canonicalJson({ b: { d: 3, c: 2 }, a: 1 });
  if (left !== right) throw new Error('Fingerprint must use the shared canonical JSON serializer');
});
