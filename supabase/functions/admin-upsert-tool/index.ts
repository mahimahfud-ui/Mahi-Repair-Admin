import { z } from 'npm:zod@4';
import {
  requireOwner, respond, preflight, handleError, jsonBody, rateLimit,
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

    const { data, error } = await admin.rpc('admin_save_repair_tool_draft', {
      p_actor_id: user.id,
      p_tool_id: id ?? null,
      p_name: name,
      p_slug: slug,
      p_category: category,
      p_description: description,
      p_icon: icon,
      p_draft_recipe: recipe,
      p_min_android_api: recipe.minAndroidApi,
      p_minimum_app_version: recipe.minAppVersion,
      p_estimated_seconds: recipe.estimatedSeconds,
      p_risk_classification: riskClassification,
      p_repair_instructions: repairInstructions,
    });

    if (error) {
      if (error.message.includes('TOOL_NOT_FOUND')) throw Object.assign(new Error('Tool not found.'), { status: 404 });
      if (error.message.includes('ARCHIVED_TOOL_CANNOT_BE_EDITED')) throw Object.assign(new Error('Archived tools cannot be edited.'), { status: 409 });
      if (error.code === '23505') throw Object.assign(new Error('A tool with this slug already exists.'), { status: 409 });
      throw error;
    }
    return respond(req, { data });
  } catch (error) {
    return handleError(req, error);
  }
});
