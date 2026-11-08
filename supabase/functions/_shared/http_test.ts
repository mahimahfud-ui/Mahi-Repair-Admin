import {
  isAllowedCorsOrigin,
  isSameAdminOriginRedirect,
  normalizeAdminOrigin,
} from './http.ts';

Deno.test('ADMIN_ORIGIN accepts only a canonical HTTPS origin', () => {
  if (normalizeAdminOrigin('https://admin.example.com') !== 'https://admin.example.com') {
    throw new Error('A canonical HTTPS origin was rejected');
  }

  for (const invalid of [
    undefined,
    'http://admin.example.com',
    'https://admin.example.com/',
    'https://admin.example.com/path',
    'https://admin.example.com?next=/',
    'https://user:pass@admin.example.com',
    'not a URL',
  ]) {
    if (normalizeAdminOrigin(invalid) !== null) {
      throw new Error('An invalid ADMIN_ORIGIN was accepted: ' + String(invalid));
    }
  }
});

Deno.test('CORS accepts only the exact configured origin and local development loopback', () => {
  const configured = 'https://admin.example.com';
  if (!isAllowedCorsOrigin(configured, configured)) throw new Error('Configured Admin origin was rejected');

  for (const untrusted of [
    'https://evil.example.com',
    'https://admin.example.com.evil.test',
    'https://admin.example.com:444',
    'https://admin.example.com/path',
    'https://user@admin.example.com',
    null,
  ]) {
    if (isAllowedCorsOrigin(untrusted, configured)) {
      throw new Error('Untrusted CORS origin was accepted: ' + String(untrusted));
    }
  }

  for (const local of ['http://localhost:3000', 'http://127.0.0.1:54321', 'http://[::1]:3000']) {
    if (!isAllowedCorsOrigin(local, configured)) throw new Error('Local development origin was rejected: ' + local);
  }

  if (isAllowedCorsOrigin('http://localhost.evil.test:3000', configured)) {
    throw new Error('A lookalike localhost hostname was accepted');
  }
});

Deno.test('member invitation redirects must remain on the configured HTTPS Admin origin', () => {
  const origin = 'https://admin.example.com';
  if (!isSameAdminOriginRedirect('https://admin.example.com/auth/callback', origin)) {
    throw new Error('A valid callback URL was rejected');
  }
  if (!isSameAdminOriginRedirect('https://admin.example.com/auth/callback?flow=invite', origin)) {
    throw new Error('A same-origin callback URL with query was rejected');
  }

  for (const candidate of [
    'http://admin.example.com/auth/callback',
    'https://evil.example.com/auth/callback',
    'https://user@admin.example.com/auth/callback',
    'javascript:alert(1)',
    'not a URL',
  ]) {
    if (isSameAdminOriginRedirect(candidate, origin)) {
      throw new Error('An unsafe invitation redirect was accepted: ' + candidate);
    }
  }
});

Deno.test('CORS defaults to the fixed production Admin origin when no override is set', () => {
  const production = 'https://mahi-repair-admin.onrender.com';
  if (!isAllowedCorsOrigin(production, undefined)) {
    throw new Error('The canonical production Admin origin was not accepted as the default');
  }
  if (isAllowedCorsOrigin('https://untrusted.example.com', undefined)) {
    throw new Error('An untrusted origin was accepted when using the production default');
  }
});
