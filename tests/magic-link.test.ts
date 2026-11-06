import { describe, expect, it } from 'vitest';
import {
  getMagicLinkErrorMessage,
  getMagicLinkRedirectUrl,
  MAGIC_LINK_COOLDOWN_SECONDS,
} from '../src/lib/auth/magic-link';

describe('magic-link redirect configuration', () => {
  it('uses the configured production HTTPS origin, not a request host', () => {
    expect(
      getMagicLinkRedirectUrl('https://mahi-repair-admin.onrender.com', true),
    ).toBe('https://mahi-repair-admin.onrender.com/auth/callback');
  });

  it('accepts localhost HTTP only for local development', () => {
    expect(getMagicLinkRedirectUrl('http://localhost:3000', false))
      .toBe('http://localhost:3000/auth/callback');
  });

  it.each([
    undefined,
    '',
    'not-a-url',
    'http://mahi-repair-admin.onrender.com',
    'https://mahi-repair-admin.onrender.com/login',
    'https://user:pass@mahi-repair-admin.onrender.com',
    'https://mahi-repair-admin.onrender.com?next=http://localhost:3000',
  ])('rejects unsafe production origins: %s', (value) => {
    expect(() => getMagicLinkRedirectUrl(value, true)).toThrow();
  });

  it('keeps the requested cooldown at 60 seconds', () => {
    expect(MAGIC_LINK_COOLDOWN_SECONDS).toBe(60);
  });
});

describe('magic-link user-facing errors', () => {
  it('explains the project email quota without exposing provider internals', () => {
    expect(getMagicLinkErrorMessage({
      code: 'over_email_send_rate_limit',
      status: 429,
      message: 'email rate limit exceeded',
    })).toContain('email sending limit has been reached');
  });

  it('explains custom SMTP address restrictions', () => {
    expect(getMagicLinkErrorMessage({ code: 'email_address_not_authorized' }))
      .toContain('custom SMTP provider');
  });

  it('explains request-level throttling separately', () => {
    expect(getMagicLinkErrorMessage({ code: 'over_request_rate_limit', status: 429 }))
      .toContain('Too many sign-in requests');
  });

  it('does not show raw provider errors to the user', () => {
    expect(getMagicLinkErrorMessage({ status: 400, message: 'internal gateway detail' }))
      .toBe('We could not send the sign-in link. Check the email address and try again later.');
  });
});
