import { createClient } from 'npm:@supabase/supabase-js@2';

const DEFAULT_ADMIN_ORIGIN = 'https://mahi-repair-admin.onrender.com';

function configuredAdminOrigin(): string {
  const configured = Deno.env.get('ADMIN_ORIGIN')?.trim();
  return configured || DEFAULT_ADMIN_ORIGIN;
}

export function normalizeAdminOrigin(configured: string | undefined): string | null {
  if (!configured) return null;
  try {
    const parsed = new URL(configured);
    if (
      parsed.protocol !== 'https:' ||
      parsed.origin !== configured ||
      parsed.username !== '' ||
      parsed.password !== ''
    ) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function isAllowedCorsOrigin(origin: string | null, configured: string | undefined): boolean {
  if (!origin) return false;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.origin !== origin || parsed.username !== '' || parsed.password !== '') return false;

  const adminOrigin = normalizeAdminOrigin(configured?.trim() || DEFAULT_ADMIN_ORIGIN);
  if (adminOrigin && origin === adminOrigin) return true;

  return parsed.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
}

export function requireAdminOrigin(): string {
  const configured = configuredAdminOrigin();
  const origin = normalizeAdminOrigin(configured);
  if (!origin) {
    throw Object.assign(
      new Error('ADMIN_ORIGIN must be a canonical HTTPS origin without a path or trailing slash.'),
      { status: 500 },
    );
  }
  return origin;
}

export function isSameAdminOriginRedirect(candidate: string, adminOrigin: string): boolean {
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' &&
      parsed.origin === adminOrigin &&
      parsed.username === '' &&
      parsed.password === '';
  } catch {
    return false;
  }
}

export const corsHeaders = (request: Request) => {
  const origin = request.headers.get('origin');
  const configured = configuredAdminOrigin();
  const allowed = isAllowedCorsOrigin(origin, configured);

  const headers: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache',
  };
  if (origin && allowed) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
};

export function respond(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });
}

export function preflight(request: Request) {
  return new Response('ok', { headers: corsHeaders(request) });
}

export function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error('Missing secret: ' + name);
  return value;
}

export function serviceClient() {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type AdminClient = ReturnType<typeof serviceClient>;

export async function authenticate(request: Request) {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) {
    throw Object.assign(new Error('Authentication required'), { status: 401 });
  }

  const token = header.slice(7);
  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) throw Object.assign(new Error('Invalid session'), { status: 401 });

  const admin = serviceClient();
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id,role,status')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError || !profile || profile.status !== 'active') {
    throw Object.assign(new Error('Account is not active'), { status: 403 });
  }

  return { user, profile, admin, token };
}

export async function requireOwner(request: Request) {
  const auth = await authenticate(request);
  if (auth.profile.role !== 'owner') {
    throw Object.assign(new Error('Owner authorization required'), { status: 403 });
  }
  return auth;
}

export async function rateLimit(admin: AdminClient, key: string, limit = 30, windowSeconds = 60) {
  const { data, error } = await admin.rpc('consume_rate_limit', {
    p_bucket_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new Error('Rate limiter unavailable');
  if (!data) throw Object.assign(new Error('Rate limit exceeded'), { status: 429 });
}

export async function audit(
  admin: AdminClient,
  actor: string,
  action: string,
  targetType: string,
  targetId: string | null,
  details: unknown = {},
) {
  const { error } = await admin.from('admin_audit_logs').insert({
    actor_id: actor,
    action,
    target_type: targetType,
    target_id: targetId,
    details,
  });
  if (error) throw new Error('Audit write failed: ' + error.message);
}

export async function handleError(request: Request, error: unknown) {
  const normalized = error instanceof Error ? error : new Error('Request failed');
  const candidateStatus =
    typeof error === 'object' && error !== null && 'status' in error
      ? error.status
      : undefined;
  const status = typeof candidateStatus === 'number' && candidateStatus >= 400 && candidateStatus <= 599
    ? candidateStatus
    : 500;
  const code = status === 401 ? 'UNAUTHORIZED'
    : status === 403 ? 'FORBIDDEN'
    : status === 429 ? 'RATE_LIMITED'
    : status >= 500 ? 'INTERNAL_ERROR'
    : 'REQUEST_FAILED';

  if (status >= 500) console.error('Edge Function failure:', normalized);
  const message = status >= 500 ? 'The request could not be completed.' : normalized.message;
  return respond(request, { error: { code, message } }, status);
}

export async function jsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw Object.assign(new Error('Invalid JSON body'), { status: 400 });
  }
}
