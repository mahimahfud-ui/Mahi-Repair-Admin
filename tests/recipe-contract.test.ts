import { describe, expect, it } from 'vitest';
import { RepairRecipeSchema } from '../src/lib/recipe/catalog';

const base = {
  schemaVersion: 1 as const,
  toolId: 'demo-network-check',
  title: 'Demo',
  version: 1,
  category: 'network' as const,
  minAndroidApi: 23,
  minAppVersion: '1.0.0',
  estimatedSeconds: 20,
  steps: [{ id: 'a', action: 'CHECK_INTERNET', params: {}, risk: 'read_only' as const, requiresConfirmation: false }],
};

describe('repair recipe contract', () => {
  it('accepts a supported read-only action', () => expect(RepairRecipeSchema.safeParse(base).success).toBe(true));
  it('rejects unknown actions', () => expect(RepairRecipeSchema.safeParse({ ...base, steps: [{ ...base.steps[0], action: 'RUN_SHELL' }] }).success).toBe(false));
  it('rejects unknown action parameters', () => expect(RepairRecipeSchema.safeParse({ ...base, steps: [{ ...base.steps[0], params: { shell: 'id' } }] }).success).toBe(false));
  it('rejects a guided action without confirmation', () => expect(RepairRecipeSchema.safeParse({ ...base, steps: [{ id: 'b', action: 'OPEN_APP_DETAILS', params: { packageName: 'com.example.app' }, risk: 'guided', requiresConfirmation: false }] }).success).toBe(false));
  it('rejects duplicated step IDs', () => expect(RepairRecipeSchema.safeParse({ ...base, steps: [...base.steps, ...base.steps] }).success).toBe(false));
  it('accepts a condition referencing a preceding step', () => expect(RepairRecipeSchema.safeParse({ ...base, steps: [...base.steps, { id: 'b', action: 'VERIFY_INTERNET', params: {}, risk: 'read_only', requiresConfirmation: false, condition: { previousStep: 'a', equals: 'success' } }] }).success).toBe(true));
  it('rejects a condition that references a later or missing step', () => expect(RepairRecipeSchema.safeParse({ ...base, steps: [{ ...base.steps[0], condition: { previousStep: 'missing', equals: 'success' } }] }).success).toBe(false));
  it('rejects a malformed HTTPS path', () => expect(RepairRecipeSchema.safeParse({ ...base, steps: [{ id: 'https', action: 'HTTPS_PROBE', params: { host: 'example.com', path: '//evil.example' }, risk: 'read_only', requiresConfirmation: false }] }).success).toBe(false));
});
