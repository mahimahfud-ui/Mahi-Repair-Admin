import { RecipeSchema, canonicalJson } from './recipe.ts';

Deno.test('Edge Function schema accepts the shared Run Repair v1 fixture', async () => {
  const fixturePath = new URL('../../../../contract-tests/repair-recipe-v1.json', import.meta.url);
  const fixture = JSON.parse(await Deno.readTextFile(fixturePath)) as unknown;
  const parsed = RecipeSchema.safeParse(fixture);
  if (!parsed.success) throw new Error(parsed.error.message);
  if (parsed.data.toolId !== 'run-repair') throw new Error('Primary recipe slug mismatch');
  const canonical = canonicalJson(parsed.data);
  if ((JSON.parse(canonical) as { toolId: string }).toolId !== 'run-repair') {
    throw new Error('Canonical payload changed the primary recipe slug');
  }
});
