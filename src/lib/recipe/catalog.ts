import { z } from 'zod';

export const ACTIONS = {
  CHECK_INTERNET: { risk: 'read_only', minAndroidApi: 23, permissions: [], description: 'Check validated internet connectivity.' },
  DNS_LOOKUP: { risk: 'read_only', minAndroidApi: 23, permissions: ['INTERNET'], description: 'Resolve a bounded hostname using Android network APIs.' },
  HTTPS_PROBE: { risk: 'read_only', minAndroidApi: 23, permissions: ['INTERNET'], description: 'Make a bounded HTTPS probe to a configured host.' },
  CHECK_APP_INSTALLED: { risk: 'read_only', minAndroidApi: 23, permissions: [], description: 'Check package visibility under Android package visibility rules.' },
  CHECK_STORAGE: { risk: 'read_only', minAndroidApi: 23, permissions: [], description: 'Read available app-visible storage capacity.' },
  OPEN_APP: { risk: 'guided', minAndroidApi: 23, permissions: [], description: 'Launch an installed app through its launch intent.' },
  OPEN_APP_DETAILS: { risk: 'guided', minAndroidApi: 23, permissions: [], description: 'Open Android settings for one package.' },
  OPEN_ANDROID_SETTINGS: { risk: 'guided', minAndroidApi: 23, permissions: [], description: 'Open one explicitly supported Android settings screen.' },
  SHOW_GUIDE: { risk: 'guided', minAndroidApi: 23, permissions: [], description: 'Display owner-authored troubleshooting instructions.' },
  ASK_USER_CONFIRMATION: { risk: 'guided', minAndroidApi: 23, permissions: [], description: 'Ask the device user to confirm before continuing.' },
  REQUEST_OWN_APP_PERMISSION: { risk: 'permission', minAndroidApi: 23, permissions: ['runtime-permission'], description: 'Request a declared permission for this repair app only.' },
  VERIFY_INTERNET: { risk: 'read_only', minAndroidApi: 23, permissions: ['INTERNET'], description: 'Verify internet access using a bounded network probe.' },
  VERIFY_DNS: { risk: 'read_only', minAndroidApi: 23, permissions: ['INTERNET'], description: 'Verify DNS resolution for a supplied hostname.' },
} as const;

const Host = z.string().min(1).max(253).regex(/^(?=.{1,253}$)([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(\.([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?))*$/);
const PackageName = z.string().min(3).max(255).regex(/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/);
const EmptyParams = z.object({}).strict();
const actionParams = {
  CHECK_INTERNET: EmptyParams,
  DNS_LOOKUP: z.object({ host: Host }).strict(),
  HTTPS_PROBE: z.object({ host: Host, path: z.string().max(512).regex(/^\/(?!\/)[^\r\n]*$/).optional(), timeoutMs: z.number().int().min(1000).max(10000).optional() }).strict(),
  CHECK_APP_INSTALLED: z.object({ packageName: PackageName }).strict(),
  CHECK_STORAGE: z.object({ minimumAvailableMb: z.number().int().positive().max(1_000_000).optional() }).strict(),
  OPEN_APP: z.object({ packageName: PackageName }).strict(),
  OPEN_APP_DETAILS: z.object({ packageName: PackageName }).strict(),
  OPEN_ANDROID_SETTINGS: z.object({ screen: z.enum(['wifi','internet','bluetooth','display','sound','app_notifications','date_time','storage']) }).strict(),
  SHOW_GUIDE: z.object({ title: z.string().min(1).max(100), instructions: z.array(z.string().min(1).max(1000)).min(1).max(30) }).strict(),
  ASK_USER_CONFIRMATION: z.object({ title: z.string().min(1).max(100), message: z.string().min(1).max(1000), confirmLabel: z.string().max(40).optional() }).strict(),
  REQUEST_OWN_APP_PERMISSION: z.object({ permission: z.enum(['POST_NOTIFICATIONS','CAMERA','ACCESS_FINE_LOCATION','READ_MEDIA_IMAGES']) }).strict(),
  VERIFY_INTERNET: EmptyParams,
  VERIFY_DNS: z.object({ host: Host }).strict(),
} as const;

export const RecipeStepSchema = z.object({
  id: z.string().min(1).max(80), action: z.string().min(1).max(80),
  params: z.record(z.string(), z.unknown()), risk: z.enum(['read_only','guided','permission']),
  requiresConfirmation: z.boolean(),
  condition: z.object({ previousStep: z.string().min(1).max(80), equals: z.enum(['success','failure']) }).strict().optional(),
}).strict().superRefine((step, ctx) => {
  const parameterSchema = actionParams[step.action as keyof typeof actionParams];
  if (!parameterSchema) {
    ctx.addIssue({ code: 'custom', path: ['action'], message: `Unsupported action: ${step.action}` });
    return;
  }
  const parameterResult = parameterSchema.safeParse(step.params);
  if (!parameterResult.success) parameterResult.error.issues.forEach(issue => ctx.addIssue({ code: 'custom', path: ['params', ...issue.path], message: issue.message }));
  const expectedRisk = ACTIONS[step.action as keyof typeof ACTIONS].risk;
  if (step.risk !== expectedRisk) ctx.addIssue({ code: 'custom', path: ['risk'], message: `Risk must be ${expectedRisk} for ${step.action}.` });
  if (['OPEN_APP','OPEN_APP_DETAILS','OPEN_ANDROID_SETTINGS','ASK_USER_CONFIRMATION','REQUEST_OWN_APP_PERMISSION'].includes(step.action) && !step.requiresConfirmation) {
    ctx.addIssue({ code: 'custom', path: ['requiresConfirmation'], message: 'This action must require confirmation.' });
  }
});

export const RepairRecipeSchema = z.object({
  schemaVersion: z.literal(1), toolId: z.string().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1).max(100), version: z.number().int().positive(), category: z.enum(['network','apps','storage','connectivity','system','guides']),
  minAndroidApi: z.number().int().min(23).max(100).default(23), minAppVersion: z.string().max(30).regex(/^\d+(?:\.\d+){0,3}$/).default('1.0.0'),
  estimatedSeconds: z.number().int().min(1).max(3600).default(60), changelog: z.string().max(2000).optional(),
  steps: z.array(RecipeStepSchema).min(1).max(50),
}).strict().superRefine((recipe, ctx) => {
  const ids = new Set<string>();
  recipe.steps.forEach((step, index) => {
    if (ids.has(step.id)) ctx.addIssue({ code: 'custom', path: ['steps', index, 'id'], message: 'Step IDs must be unique.' });
    ids.add(step.id);
    if (step.condition?.previousStep && !recipe.steps.slice(0, index).some(s => s.id === step.condition?.previousStep)) {
      ctx.addIssue({ code: 'custom', path: ['steps', index, 'condition'], message: 'Conditions may reference only a preceding step.' });
    }
  });
});

export type RepairRecipe = z.infer<typeof RepairRecipeSchema>;
export type RepairStep = z.infer<typeof RecipeStepSchema>;
export function validateRecipe(input: unknown) { return RepairRecipeSchema.safeParse(input); }
export function recipePermissionReport(recipe: RepairRecipe) {
  return [...new Set(recipe.steps.flatMap(step => ACTIONS[step.action as keyof typeof ACTIONS]?.permissions ?? []))];
}
