import { describe, expect, it } from 'vitest';
import { AiRecipeAssistantInputSchema } from '@/lib/ai/recipe-assistant';

const valid = {
  symptom_description: 'YouTube reports that it cannot reach the internet.',
  tool_id: 'youtube-connectivity-check',
  title: 'YouTube Connectivity Check',
  category: 'apps' as const,
  target_app_package: 'com.google.android.youtube',
  min_android_api: 23,
  min_app_version: '1.0.0',
};

describe('AI recipe assistant request validation', () => {
  it('accepts a bounded symptom and validated Android package', () => {
    expect(AiRecipeAssistantInputSchema.safeParse(valid).success).toBe(true);
  });
  it('rejects arbitrary URL-like package values', () => {
    expect(AiRecipeAssistantInputSchema.safeParse({ ...valid, target_app_package: 'https://attacker.example/payload' }).success).toBe(false);
  });
  it('rejects a recipe slug that is not lowercase kebab-case', () => {
    expect(AiRecipeAssistantInputSchema.safeParse({ ...valid, tool_id: '../../untrusted' }).success).toBe(false);
  });
  it('rejects oversized symptom content', () => {
    expect(AiRecipeAssistantInputSchema.safeParse({ ...valid, symptom_description: 'x'.repeat(1201) }).success).toBe(false);
  });
  it('rejects unknown fields rather than forwarding them to the provider', () => {
    expect(AiRecipeAssistantInputSchema.safeParse({ ...valid, api_key: 'must-never-be-client-controlled' }).success).toBe(false);
  });
});
