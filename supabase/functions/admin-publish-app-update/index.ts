import { handleError, jsonBody, preflight, rateLimit, requireOwner, respond } from '../_shared/http.ts';
import { AppUpdateInputSchema, canonicalAppUpdateJson } from '../_shared/app-update.ts';
import { signCanonicalPayload } from '../_shared/sign.ts';

const BUCKET = 'mahi-app-updates';

async function verifyStoredAsset(
  admin: ReturnType<typeof import('../_shared/http.ts').serviceClient>,
  storagePath: string,
  expectedSize: number,
  expectedMime: string,
) {
  const separator = storagePath.lastIndexOf('/');
  const folder = storagePath.slice(0, separator);
  const fileName = storagePath.slice(separator + 1);
  const { data: objects, error } = await admin.storage
    .from(BUCKET)
    .list(folder, { limit: 100, search: fileName });
  const data = objects?.find((item) => item.name === fileName);
  if (error || !data) throw Object.assign(new Error('One or more release assets were not uploaded to the private release bucket.'), { status: 422 });
  const metadata = data.metadata as { size?: string | number; mimetype?: string } | null;
  const storedSize = Number(metadata?.size ?? 0);
  if (storedSize !== expectedSize || metadata?.mimetype !== expectedMime) {
    throw Object.assign(new Error('A release asset size or content type does not match its manifest.'), { status: 422 });
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return preflight(request);
  try {
    const { user, admin } = await requireOwner(request);
    await rateLimit(admin, `app-update-publish:${user.id}`, 5, 60);

    const parsed = AppUpdateInputSchema.safeParse(await jsonBody(request));
    if (!parsed.success) {
      return respond(request, {
        error: {
          code: 'INVALID_APP_UPDATE_RELEASE',
          issues: parsed.error.issues,
        },
      }, 422);
    }

    const release = parsed.data;
    const assetPaths = [
      ...release.packages.map((pkg) => ({
        path: pkg.storagePath,
        size: pkg.sizeBytes,
        mime: pkg.contentType,
      })),
      ...(release.nativeApk ? [{
        path: release.nativeApk.storagePath,
        size: release.nativeApk.sizeBytes,
        mime: release.nativeApk.contentType,
      }] : []),
    ];

    for (const asset of assetPaths) {
      await verifyStoredAsset(admin, asset.path, asset.size, asset.mime);
    }

    const releaseId = crypto.randomUUID();
    const publishedAt = new Date().toISOString();
    const manifest = {
      schemaVersion: 1,
      releaseId,
      ...release,
      publishedAt,
    };
    const manifestPayload = canonicalAppUpdateJson(manifest);
    const signature = await signCanonicalPayload(manifestPayload);

    const { data: committedId, error: commitError } = await admin.rpc('commit_app_update_release', {
      p_release_id: releaseId,
      p_channel: release.channel,
      p_release_number: release.releaseNumber,
      p_manifest: manifest,
      p_manifest_payload: manifestPayload,
      p_signature: signature,
      p_published_by: user.id,
    });
    if (commitError || committedId !== releaseId) {
      throw Object.assign(new Error('The release could not be committed. Check that the release number is unique for its channel.'), { status: 409 });
    }

    return respond(request, {
      data: {
        releaseId,
        channel: release.channel,
        releaseNumber: release.releaseNumber,
        manifestPayload,
        signature,
        signatureAlgorithm: 'RSA-SHA256',
        publishedAt,
      },
    }, 201);
  } catch (error) {
    return handleError(request, error);
  }
});
