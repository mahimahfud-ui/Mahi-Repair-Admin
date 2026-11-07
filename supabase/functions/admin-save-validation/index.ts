import { z } from 'npm:zod@4';
import { requireOwner, respond, preflight, handleError, jsonBody, rateLimit } from '../_shared/http.ts';
import { RecipeSchema, canonicalJson } from '../_shared/recipe.ts';

const Input = z.object({
  recipe: z.unknown().refine((value) => value !== undefined, 'Recipe is required.'),
  tool_id: z.string().uuid().optional(),
}).strict();
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  try {
    const { user, admin } = await requireOwner(req);
    await rateLimit(admin, `validation:${user.id}`, 60, 60);
    const input = Input.safeParse(await jsonBody(req));
    if (!input.success) return respond(req, { error: { code: 'INVALID_TEST_REQUEST', issues: input.error.issues } }, 422);
    const raw = JSON.stringify(input.data.recipe ?? null);
    if (raw.length > 131072) throw Object.assign(new Error('Recipe test input exceeds 128 KB.'), { status: 413 });
    const parsed = RecipeSchema.safeParse(input.data.recipe);
    const issues = parsed.success ? [] : parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
    const canonical = input.data.recipe ? canonicalJson(input.data.recipe) : '';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
    const hash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const { data, error } = await admin.from('recipe_test_history').insert({
      owner_id: user.id,
      tool_id: input.data.tool_id ?? null,
      recipe_hash: hash,
      validation_status: parsed.success ? 'VALID' : 'INVALID',
      issues,
      simulated_step_count: parsed.success ? parsed.data.steps.length : 0,
    }).select('id,tested_at').single();
    if (error) throw error;
    return respond(req, { data: { ...data, valid: parsed.success, issues } });
  } catch (error) {
    return handleError(req, error);
  }
});
