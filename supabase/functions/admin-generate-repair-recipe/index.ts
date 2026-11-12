import {
  requireOwner,
  respond,
  preflight,
  handleError,
  jsonBody,
  rateLimit,
  audit,
} from '../_shared/http.ts';
import {
  AiRecipeInputSchema,
  DEFAULT_GEMINI_MODEL,
  generateAiRecipeDraft,
  GeminiProviderError,
} from '../_shared/ai-recipe.ts';

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return preflight(request);
  if (request.method !== 'POST') {
    return respond(request, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST is supported.' } }, 405);
  }

  try {
    const { user, admin } = await requireOwner(request);
    await rateLimit(admin, 'ai-recipe-draft:' + user.id, 6, 60);

    const parsed = AiRecipeInputSchema.safeParse(await jsonBody(request));
    if (!parsed.success) {
      return respond(request, {
        error: { code: 'INVALID_AI_RECIPE_REQUEST', issues: parsed.error.issues },
      }, 422);
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY')?.trim();
    if (!apiKey) {
      return respond(request, {
        error: {
          code: 'AI_PROVIDER_NOT_CONFIGURED',
          message: 'The AI recipe assistant is not configured on the server.',
        },
      }, 503);
    }

    const model = Deno.env.get('GEMINI_MODEL')?.trim() || DEFAULT_GEMINI_MODEL;
    const recipe = await generateAiRecipeDraft(parsed.data, apiKey, model);

    await audit(
      admin,
      user.id,
      'ai.recipe_draft_generated',
      'recipe_draft',
      null,
      {
        model,
        category: parsed.data.category,
        targetAppPackageProvided: Boolean(parsed.data.target_app_package),
        stepCount: recipe.steps.length,
      },
    );

    return respond(request, {
      data: {
        recipe,
        model,
        saved: false,
        published: false,
      },
    });
  } catch (error) {
    if (error instanceof GeminiProviderError) {
      return respond(request, {
        error: {
          code: 'AI_PROVIDER_UNAVAILABLE',
          message: 'The AI provider did not return a usable repair recipe. Please refine the symptom and retry.',
        },
      }, 503);
    }
    return handleError(request, error);
  }
});
