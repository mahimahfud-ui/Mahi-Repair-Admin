import { describe, expect, it } from 'vitest';
import { getApplicationReadiness } from '../src/lib/health/readiness';

const validEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example-project.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-key',
  ADMIN_OWNER_EMAIL: 'mahinmhfd@gmail.com',
};

describe('production health/readiness configuration', () => {
  it('reports ready only when required production configuration exists', () => {
    expect(getApplicationReadiness(validEnvironment).ready).toBe(true);
  });

  it.each([
    ['NEXT_PUBLIC_SUPABASE_URL', 'not-a-url'],
    ['NEXT_PUBLIC_SUPABASE_URL', 'http://example-project.supabase.co'],
    ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', ''],
    ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_secret_not-a-publishable-key'],
    ['ADMIN_OWNER_EMAIL', 'owner@example.com with typo'],
    ['ADMIN_OWNER_EMAIL', ''],
  ])('reports degraded readiness for invalid %s', (key, value) => {
    const env = { ...validEnvironment, [key]: value };
    expect(getApplicationReadiness(env).ready).toBe(false);
  });

  it('does not expose environment values in the readiness result', () => {
    const result = getApplicationReadiness(validEnvironment);
    expect(JSON.stringify(result)).not.toContain(validEnvironment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
    expect(JSON.stringify(result)).not.toContain(validEnvironment.ADMIN_OWNER_EMAIL);
  });
});
