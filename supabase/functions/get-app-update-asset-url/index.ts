import { z } from 'npm:zod@4';
import { authenticate, env, handleError, jsonBody, preflight, rateLimit, respond } from '../_shared/http.ts';

const BUCKET = 'mahi-app-updates';
const Input = z.object({
  device_id: z.string().uuid(),
  release_id: z.string().uuid(),
  asset_id: z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
}).strict();

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return preflight(request);
  try {
    const { user, profile, admin } = await authenticate(request);
    if (profile.role !== 'member') {
      throw Object.assign(new Error('Member account required.'), { status: 403 });
    }
    await rateLimit(admin, `app-update-asset:${user.id}`, 30, 60);

    const parsed = Input.safeParse(await jsonBody(request));
    if (!parsed.success) return respond(request, { error: { code: 'INVALID_ASSET_REQUEST' } }, 422);

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
      .select('manifest')
      .eq('id', parsed.data.release_id)
      .maybeSingle();
    if (releaseError || !release) throw Object.assign(new Error('Update release not found.'), { status: 404 });

    const manifest = release.manifest as {
      packages?: Array<{ id: string; storagePath: string; sha256: string; sizeBytes: number; contentType: string }>;
      nativeApk?: { id: string; storagePath: string; sha256: string; sizeBytes: number; contentType: string } | null;
    };
    const asset = [
      ...(manifest.packages ?? []),
      ...(manifest.nativeApk ? [manifest.nativeApk] : []),
    ].find((item) => item.id === parsed.data.asset_id);
    if (!asset) throw Object.assign(new Error('Asset is not part of this signed release.'), { status: 404 });

    const { data: signed, error: signedError } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(asset.storagePath, 90);
    if (signedError || !signed?.signedUrl) throw new Error('The update asset could not be prepared for download.');

    const signedUrl = signed.signedUrl.startsWith('https://')
      ? signed.signedUrl
      : new URL(signed.signedUrl, env('SUPABASE_URL')).toString();

    return respond(request, {
      data: {
        asset_id: asset.id,
        signed_url: signedUrl,
        sha256: asset.sha256,
        size_bytes: asset.sizeBytes,
        content_type: asset.contentType,
        expires_in_seconds: 90,
      },
    });
  } catch (error) {
    return handleError(request, error);
  }
});
