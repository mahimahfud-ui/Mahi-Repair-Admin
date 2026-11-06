export const MAGIC_LINK_COOLDOWN_SECONDS = 60;
export const MAGIC_LINK_COOLDOWN_STORAGE_KEY = 'mahi-repair-admin:magic-link-last-request';

type AuthErrorLike = {
  code?: unknown;
  error_code?: unknown;
  message?: unknown;
  status?: unknown;
};

function asAuthError(value: unknown): AuthErrorLike {
  return value !== null && typeof value === 'object' ? value as AuthErrorLike : {};
}

/**
 * Build the callback from a configured origin, never from the incoming Host header
 * or window.location.origin. Production must use the canonical HTTPS deployment URL.
 */
export function getMagicLinkRedirectUrl(
  configuredAppUrl: string | undefined,
  isProduction: boolean,
): string {
  if (!configuredAppUrl?.trim()) {
    throw new Error('The Admin Panel sign-in URL is not configured. Contact the administrator.');
  }

  let configured: URL;
  try {
    configured = new URL(configuredAppUrl);
  } catch {
    throw new Error('The Admin Panel sign-in URL is invalid. Contact the administrator.');
  }

  if (
    (configured.protocol !== 'https:' && configured.protocol !== 'http:') ||
    configured.username ||
    configured.password ||
    configured.pathname !== '/' ||
    configured.search ||
    configured.hash
  ) {
    throw new Error('The Admin Panel sign-in URL must be a clean website origin.');
  }

  if (isProduction && configured.protocol !== 'https:') {
    throw new Error('Production sign-in must use the configured HTTPS website URL.');
  }

  if (!isProduction && configured.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(configured.hostname)) {
    throw new Error('Local HTTP sign-in is only allowed on localhost.');
  }

  return new URL('/auth/callback', configured.origin).toString();
}

/** Convert provider-specific Auth errors into safe, actionable UI copy. */
export function getMagicLinkErrorMessage(error: unknown): string {
  const authError = asAuthError(error);
  const code = String(authError.code ?? authError.error_code ?? '').toLowerCase();
  const message = String(authError.message ?? '').toLowerCase();
  const status = Number(authError.status);

  if (
    code === 'over_email_send_rate_limit' ||
    code === 'over_email_rate_limit' ||
    message.includes('email rate limit exceeded')
  ) {
    return 'The email sending limit has been reached. Wait before requesting another link. If this keeps happening, the administrator must configure production SMTP in Supabase.';
  }

  if (code === 'email_address_not_authorized') {
    return 'Supabase is not allowed to send email to this address yet. The administrator must configure a custom SMTP provider for production.';
  }

  if (code === 'over_request_rate_limit' || status === 429) {
    return 'Too many sign-in requests were made. Wait a few minutes, then try again.';
  }

  if (code === 'otp_disabled') {
    return 'Email sign-in is currently disabled for this project. Contact the administrator.';
  }

  if (code === 'smtp_error' || status >= 500) {
    return 'The email service is temporarily unavailable. Try again later.';
  }

  return 'We could not send the sign-in link. Check the email address and try again later.';
}
