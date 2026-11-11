import { z } from 'zod';

export const AiRecipeAssistantInputSchema = z.object({
  symptom_description: z.string().trim().min(8).max(1200),
  tool_id: z.string().trim().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(100),
  category: z.enum(['network', 'apps', 'storage', 'connectivity', 'system', 'guides']),
  target_app_package: z.string().trim().min(3).max(255)
    .regex(/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/).optional(),
  min_android_api: z.number().int().min(23).max(100).default(23),
  min_app_version: z.string().max(30).regex(/^\d+(?:\.\d+){0,3}$/).default('1.0.0'),
}).strict();

export type AiRecipeAssistantInput = z.infer<typeof AiRecipeAssistantInputSchema>;
