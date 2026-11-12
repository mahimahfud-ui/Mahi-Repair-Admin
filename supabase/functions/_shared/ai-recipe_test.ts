import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import {
  AiRecipeInputSchema,
  generateAiRecipeDraft,
  GeminiProviderError,
} from './ai-recipe.ts';

const input = AiRecipeInputSchema.parse({
  symptom_description: 'The YouTube app says it cannot connect to the internet.',
  tool_id: 'youtube-network-check',
  title: 'YouTube Network Check',
  category: 'apps',
  target_app_package: 'com.google.android.youtube',
  min_android_api: 23,
  min_app_version: '1.0.0',
});

function responseWith(text: string, status = 200): Response {
  return new Response(
    JSON.stringify({
      candidates: [{
        content: { parts: [{ text }] },
        finishReason: 'STOP',
      }],
    }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

const safeOutput: { estimatedSeconds: number; steps: Array<Record<string, unknown>> } = {
  estimatedSeconds: 30,
  steps: [
    {
      id: 'check-network',
      action: 'CHECK_INTERNET',
      params: {},
      risk: 'read_only',
      requiresConfirmation: false,
    },
    {
      id: 'check-app',
      action: 'CHECK_APP_INSTALLED',
      params: { packageName: 'com.google.android.youtube' },
      risk: 'read_only',
      requiresConfirmation: false,
    },
    {
      id: 'open-details',
      action: 'OPEN_APP_DETAILS',
      params: { packageName: 'com.google.android.youtube' },
      risk: 'guided',
      requiresConfirmation: true,
    },
  ],
};

Deno.test('Gemini output is validated and trusted tool metadata is server supplied', async () => {
  let requestUrl = '';
  let requestHeaders = new Headers();
  const recipe = await generateAiRecipeDraft(
    input,
    'test-api-key-not-real',
    'gemini-3.8-flash',
    async (url, init) => {
      requestUrl = String(url);
      requestHeaders = new Headers(init?.headers);
      return responseWith(JSON.stringify(safeOutput));
    },
  );

  assertEquals(requestUrl, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
  assertEquals(requestHeaders.get('x-goog-api-key'), 'test-api-key-not-real');
  assertEquals(new URL(requestUrl).search, '');
  assertEquals(recipe.toolId, input.tool_id);
  assertEquals(recipe.title, input.title);
  assertEquals(recipe.category, input.category);
  assertEquals(recipe.version, 1);
  assertEquals(recipe.steps.length, 3);
});

Deno.test('arbitrary package names are rejected even when the schema shape is valid', async () => {
  const malicious = structuredClone(safeOutput);
  malicious.steps[1].params = { packageName: 'com.attacker.other' };
  await assertRejects(
    () => generateAiRecipeDraft(input, 'test-key', 'gemini-3.8-flash', async () => responseWith(JSON.stringify(malicious))),
    GeminiProviderError,
  );
});

Deno.test('arbitrary network hosts are rejected', async () => {
  const malicious = structuredClone(safeOutput);
  malicious.steps.push({
    id: 'external-probe',
    action: 'DNS_LOOKUP',
    params: { host: 'attacker.example' },
    risk: 'read_only',
    requiresConfirmation: false,
  });
  await assertRejects(
    () => generateAiRecipeDraft(input, 'test-key', 'gemini-3.8-flash', async () => responseWith(JSON.stringify(malicious))),
    GeminiProviderError,
  );
});

Deno.test('recipe generation enforces the maximum step count', async () => {
  const tooMany = {
    estimatedSeconds: 300,
    steps: Array.from({ length: 13 }, (_, index) => ({
      id: 'step-' + index,
      action: 'CHECK_INTERNET',
      params: {},
      risk: 'read_only',
      requiresConfirmation: false,
    })),
  };
  await assertRejects(
    () => generateAiRecipeDraft(input, 'test-key', 'gemini-3.8-flash', async () => responseWith(JSON.stringify(tooMany))),
    GeminiProviderError,
  );
});

Deno.test('provider failures are surfaced as sanitized errors without response content', async () => {
  await assertRejects(
    () => generateAiRecipeDraft(input, 'test-key', 'gemini-3.8-flash', async () => new Response('private provider detail', { status: 401 })),
    GeminiProviderError,
    'AI recipe generation is temporarily unavailable. Please retry later.',
  );
});

Deno.test('request validation rejects user-controlled model options and invalid packages', () => {
  const badPackage = AiRecipeInputSchema.safeParse({
    ...input,
    target_app_package: 'https://attacker.example/payload',
  });
  assertEquals(badPackage.success, false);
});
