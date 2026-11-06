import { z } from 'npm:zod@4';
import {
  requireOwner, respond, preflight, handleError, jsonBody, rateLimit, audit,
} from '../_shared/http.ts';
import { RecipeSchema } from '../_shared/recipe.ts';

const Input = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100),
  slug: z.string().max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  category: z.enum(['network', 'apps', 'storage', 'connectivity', 'system', 'guides']),
  description: z.string().max(2000).default(''),
  icon: z.string().regex(/^[a-z0-9-]{1,40}$/).default('wrench'),
  draft_recipe: z.record(z.string(), z.unknown()),
}).strict();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  try {
    const { user, admin } = await requireOwner(req);
    await rateLimit(admin, `admin-write:${user.id}`, 20, 60);

    const input = Input.safeParse(await jsonBody(req));
    if (!input.success) {
      return respond(req, { error: { code: 'INVALID_TOOL_METADATA', issues: input.error.issues } }, 422);
    }
    const { id, name, slug, category, description, icon, draft_recipe } = input.data;
    const parsedRecipe = RecipeSchema.safeParse(draft_recipe);
    if (!parsedRecipe.success) {
      return respond(req, { error: { code: 'INVALID_RECIPE', issues: parsedRecipe.error.issues } }, 422);
    }
    const recipe = parsedRecipe.data;
    if (slug !== recipe.toolId || category !== recipe.category) {
      throw Object.assign(new Error('Tool slug and category must match the recipe.'), { status: 400 });
    }

    const risks = recipe.steps.map((step) => step.risk);
    const riskClassification = risks.includes('permission')
      ? 'permission'
      : risks.includes('guided') ? 'guided' : 'read_only';
    const repairInstructions = recipe.steps.flatMap((step) => {
      if (step.action !== 'SHOW_GUIDE') return [];
      const instructions = step.params.instructions;
      return Array.isArray(instructions) ? instructions.map(String) : [];
    });
    const values = {
      name,
      slug,
      category,
      description,
      icon,
      draft_recipe: recipe,
      android_compatibility: { minApi: recipe.minAndroidApi },
      minimum_app_version: recipe.minAppVersion,
      estimated_seconds: recipe.estimatedSeconds,
      risk_classification: riskClassification,
      repair_instructions: repairInstructions,
    };

    let data;
    let error;
    if (id) {
      const { data: existing, error: lookupError } = await admin
        .from('repair_tools').select('id,status').eq('id', id).single();
      if (lookupError || !existing) throw Object.assign(new Error('Tool not found.'), { status: 404 });
      if (existing.status === 'ARCHIVED') throw Object.assign(new Error('Archived tools cannot be edited.'), { status: 409 });
      const result = await admin.from('repair_tools').update(values)
        .eq('id', id).select('id,slug,status,version').single();
      data = result.data;
      error = result.error;
    } else {
      const result = await admin.from('repair_tools').insert({ ...values, created_by: user.id })
        .select('id,slug,status,version').single();
      data = result.data;
      error = result.error;
    }
    if (error || !data) throw error ?? new Error('Tool save did not return a record.');
    await audit(admin, user.id, id ? 'tool.draft.updated' : 'tool.created', 'repair_tool', data.id, { slug });
    return respond(req, { data });
  } catch (error) {
    return handleError(req, error);
  }
});
