import { z } from 'npm:zod@4';

const host = z.string().min(1).max(253).regex(/^(?=.{1,253}$)([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(\.([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?))*$/);
const pkg = z.string().min(3).max(255).regex(/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/);
const empty = z.object({}).strict();

const definitions = {
  CHECK_INTERNET: empty,
  DNS_LOOKUP: z.object({ host }).strict(),
  HTTPS_PROBE: z.object({
    host,
    path: z.string().max(512).regex(/^\/(?!\/)[^\r\n]*$/).optional(),
    timeoutMs: z.number().int().min(1000).max(10000).optional(),
  }).strict(),
  CHECK_APP_INSTALLED: z.object({ packageName: pkg }).strict(),
  CHECK_STORAGE: z.object({ minimumAvailableMb: z.number().int().positive().max(1_000_000).optional() }).strict(),
  OPEN_APP: z.object({ packageName: pkg }).strict(),
  OPEN_APP_DETAILS: z.object({ packageName: pkg }).strict(),
  OPEN_ANDROID_SETTINGS: z.object({
    screen: z.enum(['wifi', 'internet', 'bluetooth', 'display', 'sound', 'app_notifications', 'date_time', 'storage']),
  }).strict(),
  SHOW_GUIDE: z.object({
    title: z.string().min(1).max(100),
    instructions: z.array(z.string().min(1).max(1000)).min(1).max(30),
  }).strict(),
  ASK_USER_CONFIRMATION: z.object({
    title: z.string().min(1).max(100),
    message: z.string().min(1).max(1000),
    confirmLabel: z.string().max(40).optional(),
  }).strict(),
  REQUEST_OWN_APP_PERMISSION: z.object({
    permission: z.enum(['POST_NOTIFICATIONS', 'CAMERA', 'ACCESS_FINE_LOCATION', 'READ_MEDIA_IMAGES']),
  }).strict(),
  VERIFY_INTERNET: empty,
  VERIFY_DNS: z.object({ host }).strict(),
} as const;

type ActionName = keyof typeof definitions;
type Risk = 'read_only' | 'guided' | 'permission';
const actionRisk = {
  CHECK_INTERNET: 'read_only',
  DNS_LOOKUP: 'read_only',
  HTTPS_PROBE: 'read_only',
  CHECK_APP_INSTALLED: 'read_only',
  CHECK_STORAGE: 'read_only',
  OPEN_APP: 'guided',
  OPEN_APP_DETAILS: 'guided',
  OPEN_ANDROID_SETTINGS: 'guided',
  SHOW_GUIDE: 'guided',
  ASK_USER_CONFIRMATION: 'guided',
  REQUEST_OWN_APP_PERMISSION: 'permission',
  VERIFY_INTERNET: 'read_only',
  VERIFY_DNS: 'read_only',
} satisfies Record<ActionName, Risk>;

function isActionName(value: string): value is ActionName {
  return Object.prototype.hasOwnProperty.call(definitions, value);
}

const requiresConfirmation = new Set<ActionName>([
  'OPEN_APP',
  'OPEN_APP_DETAILS',
  'OPEN_ANDROID_SETTINGS',
  'ASK_USER_CONFIRMATION',
  'REQUEST_OWN_APP_PERMISSION',
]);

export const RecipeSchema = z.object({
  schemaVersion: z.literal(1),
  toolId: z.string().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1).max(100),
  version: z.number().int().positive(),
  category: z.enum(['network', 'apps', 'storage', 'connectivity', 'system', 'guides']),
  minAndroidApi: z.number().int().min(23).max(100).default(23),
  minAppVersion: z.string().max(30).regex(/^\d+(?:\.\d+){0,3}$/).default('1.0.0'),
  estimatedSeconds: z.number().int().min(1).max(3600).default(60),
  changelog: z.string().max(2000).optional(),
  steps: z.array(z.object({
    id: z.string().min(1).max(80),
    action: z.string(),
    params: z.record(z.string(), z.unknown()),
    risk: z.enum(['read_only', 'guided', 'permission']),
    requiresConfirmation: z.boolean(),
    condition: z.object({
      previousStep: z.string().min(1).max(80),
      equals: z.enum(['success', 'failure']),
    }).strict().optional(),
  }).strict()).min(1).max(50),
}).strict().superRefine((recipe, ctx) => {
  const seen = new Set<string>();

  recipe.steps.forEach((step, index) => {
    if (!isActionName(step.action)) {
      ctx.addIssue({
        code: 'custom',
        path: ['steps', index, 'action'],
        message: 'Unsupported action.',
      });
      return;
    }

    if (seen.has(step.id)) {
      ctx.addIssue({ code: 'custom', path: ['steps', index, 'id'], message: 'Duplicate step ID.' });
    }
    seen.add(step.id);

    const paramsResult = definitions[step.action].safeParse(step.params);
    if (!paramsResult.success) {
      paramsResult.error.issues.forEach(issue => {
        ctx.addIssue({
          code: 'custom',
          path: ['steps', index, 'params', ...issue.path],
          message: issue.message,
        });
      });
    }

    const expectedRisk = actionRisk[step.action];
    if (step.risk !== expectedRisk) {
      ctx.addIssue({
        code: 'custom',
        path: ['steps', index, 'risk'],
        message: `Risk must be ${expectedRisk}.`,
      });
    }

    if (requiresConfirmation.has(step.action) && !step.requiresConfirmation) {
      ctx.addIssue({
        code: 'custom',
        path: ['steps', index, 'requiresConfirmation'],
        message: 'This action requires confirmation.',
      });
    }

    if (step.condition?.previousStep && !recipe.steps.slice(0, index).some(previous => previous.id === step.condition?.previousStep)) {
      ctx.addIssue({
        code: 'custom',
        path: ['steps', index, 'condition'],
        message: 'Condition must reference a preceding step.',
      });
    }
  });
});

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record).sort().map(key => [key, canonicalize(record[key])]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
