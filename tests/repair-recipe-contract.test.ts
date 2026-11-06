import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RepairRecipeSchema } from '../src/lib/recipe/catalog';
import { canonicalJson } from '../src/lib/recipe/canonical';

const fixtureUrl = new URL('../../contract-tests/repair-recipe-v1.json', import.meta.url);
const fixture = JSON.parse(readFileSync(fixtureUrl, 'utf8')) as unknown;

describe('shared Run Repair v1 contract', () => {
  it('accepts the exact cross-platform fixture and preserves its stable tool ID', () => {
    const result = RepairRecipeSchema.safeParse(fixture);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.toolId).toBe('run-repair');
    expect(result.data.schemaVersion).toBe(1);
    expect(result.data.steps).toHaveLength(1);
    expect(JSON.parse(canonicalJson(result.data)).toolId).toBe('run-repair');
  });

  it('rejects unknown top-level and action parameter properties', () => {
    const rootExtra = { ...(fixture as Record<string, unknown>), admin: true };
    expect(RepairRecipeSchema.safeParse(rootExtra).success).toBe(false);

    const step = (fixture as { steps: Array<Record<string, unknown>> }).steps[0];
    const paramsExtra = {
      ...(fixture as Record<string, unknown>),
      steps: [{ ...step, params: { shellCommand: 'id' } }],
    };
    expect(RepairRecipeSchema.safeParse(paramsExtra).success).toBe(false);
  });
});
