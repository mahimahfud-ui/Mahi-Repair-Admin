import { z } from 'npm:zod@4';
import { authenticate, handleError, jsonBody, preflight, rateLimit, respond } from '../_shared/http.ts';

const Input = z.object({
  device_id: z.string().uuid(),
  channel: z.enum(['stable', 'beta']).default('stable'),
}).strict();

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return preflight(request);
  try {
    const { user, profile, admin } = await authenticate(request);
    if (profile.role !== 'member') {
      throw Object.assign(new Error('Member account required.'), { status: 403 });
    }
    await rateLimit(admin, `app-update-manifest:${user.id}`, 60, 60);

    const parsed = Input.safeParse(await jsonBody(request));
    if (!parsed.success) {
      return respond(request, { error: { code: 'INVALID_UPDATE_REQUEST' } }, 422);
    }

    const { data: device, error: deviceError } = await admin
      .from('devices')
      .select('id')
      .eq('id', parsed.data.device_id)
      .eq('user_id', user.id)
      .is('revoked_at', null)
      .maybeSingle();
    if (deviceError || !device) {
      throw Object.assign(new Error('An active registered device is required.'), { status: 403 });
    }

    const { data: release, error: releaseError } = await admin
      .from('app_update_releases')
      .select('id,channel,release_number,manifest_payload,signature,signature_algorithm,published_at')
      .eq('channel', parsed.data.channel)
      .order('release_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (releaseError) throw new Error('The update manifest is temporarily unavailable.');
    if (!release) return respond(request, { data: null });

    return respond(request, {
      data: {
        release_id: release.id,
        channel: release.channel,
        release_number: release.release_number,
        manifest_payload: release.manifest_payload,
        signature: release.signature,
        signature_algorithm: release.signature_algorithm,
        published_at: release.published_at,
      },
    });
  } catch (error) {
    return handleError(request, error);
  }
});
