import { z } from 'npm:zod@4';

const slug = z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const contentPath = z.string().min(1).max(240).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/)
  .refine((value) => !value.includes('\\') && !value.startsWith('/') &&
    !value.split('/').some((part) => part === '' || part === '.' || part === '..') &&
    /\.(json|png|jpe?g|webp)$/i.test(value),
  'Only relative JSON and raster image resources are supported.');

const ReleaseEntrySchema = z.object({
  path: contentPath,
  sha256,
  sizeBytes: z.number().int().positive().max(20 * 1024 * 1024),
}).strict();

const ContentPackageSchema = z.object({
  id: slug,
  version: z.number().int().positive(),
  storagePath: z.string().regex(/^channels\/(stable|beta)\/packages\/[0-9a-f-]{36}\.zip$/),
  sha256,
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
  contentType: z.literal('application/zip'),
  entries: z.array(ReleaseEntrySchema).min(1).max(200),
}).strict().superRefine((pkg, ctx) => {
  const expandedBytes = pkg.entries.reduce((total, entry) => total + entry.sizeBytes, 0);
  if (expandedBytes > pkg.sizeBytes * 20) {
    ctx.addIssue({ code: 'custom', path: ['entries'], message: 'Expanded package resources exceed the permitted size ratio.' });
  }
  if (expandedBytes > 250 * 1024 * 1024) {
    ctx.addIssue({ code: 'custom', path: ['entries'], message: 'Expanded content package exceeds the 250 MB Android activation limit.' });
  }
  const paths = new Set<string>();
  pkg.entries.forEach((entry, index) => {
    if (paths.has(entry.path)) ctx.addIssue({ code: 'custom', path: ['entries', index, 'path'], message: 'Duplicate package entry path.' });
    paths.add(entry.path);
  });
});

const NativeApkSchema = z.object({
  id: slug,
  storagePath: z.string().regex(/^channels\/(stable|beta)\/native\/[0-9a-f-]{36}\.apk$/),
  sha256,
  sizeBytes: z.number().int().positive().max(150 * 1024 * 1024),
  contentType: z.literal('application/vnd.android.package-archive'),
  packageName: z.string().min(3).max(255).regex(/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/),
  versionCode: z.number().int().positive(),
  signingCertificateSha256: sha256,
}).strict();

const AnnouncementSchema = z.object({
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(500),
  tone: z.enum(['info', 'success', 'warning']).default('info'),
}).strict();

export const RemoteConfigSchema = z.object({
  featureFlags: z.record(z.string().regex(/^[a-z0-9_.-]{1,80}$/), z.boolean()).default({}),
  repairTools: z.record(slug, z.boolean()).default({}),
  ui: z.object({
    announcement: AnnouncementSchema.nullable().optional(),
  }).strict().default({}),
  toolMetadata: z.record(slug, z.object({
    title: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    category: z.string().min(1).max(60).optional(),
  }).strict()).default({}),
  compatibility: z.object({
    minAndroidApi: z.number().int().min(26).max(100).default(26),
    maxAndroidApi: z.number().int().min(26).max(100).default(100),
  }).strict().default({ minAndroidApi: 26, maxAndroidApi: 100 }),
}).strict().superRefine((config, ctx) => {
  if (Object.keys(config.featureFlags).length > 100) {
    ctx.addIssue({ code: 'custom', path: ['featureFlags'], message: 'Too many feature flags.' });
  }
  if (Object.keys(config.repairTools).length > 200) {
    ctx.addIssue({ code: 'custom', path: ['repairTools'], message: 'Too many repair-tool overrides.' });
  }
  if (config.compatibility.minAndroidApi > config.compatibility.maxAndroidApi) {
    ctx.addIssue({ code: 'custom', path: ['compatibility'], message: 'Minimum Android API cannot exceed maximum Android API.' });
  }
});

export const AppUpdateInputSchema = z.object({
  channel: z.enum(['stable', 'beta']),
  releaseNumber: z.number().int().positive(),
  appVersionCode: z.number().int().positive(),
  appVersionName: z.string().min(1).max(40).regex(/^[0-9A-Za-z.+-]+$/),
  minSupportedAppVersionCode: z.number().int().positive(),
  mandatory: z.boolean().default(false),
  releaseNotes: z.string().max(4000).default(''),
  remoteConfig: RemoteConfigSchema.default({ featureFlags: {}, repairTools: {}, ui: {}, toolMetadata: {}, compatibility: { minAndroidApi: 26, maxAndroidApi: 100 } }),
  packages: z.array(ContentPackageSchema).max(20).default([]),
  nativeApk: NativeApkSchema.nullable().default(null),
}).strict().superRefine((release, ctx) => {
  if (release.minSupportedAppVersionCode > release.appVersionCode) {
    ctx.addIssue({ code: 'custom', path: ['minSupportedAppVersionCode'], message: 'Minimum supported version cannot exceed the release version.' });
  }
  if (release.nativeApk && release.nativeApk.versionCode !== release.appVersionCode) {
    ctx.addIssue({ code: 'custom', path: ['nativeApk', 'versionCode'], message: 'APK versionCode must match appVersionCode.' });
  }
  for (const [index, pkg] of release.packages.entries()) {
    if (!pkg.storagePath.startsWith(`channels/${release.channel}/packages/`)) {
      ctx.addIssue({ code: 'custom', path: ['packages', index, 'storagePath'], message: 'Package channel does not match the release channel.' });
    }
  }
  if (release.nativeApk && !release.nativeApk.storagePath.startsWith(`channels/${release.channel}/native/`)) {
    ctx.addIssue({ code: 'custom', path: ['nativeApk', 'storagePath'], message: 'APK channel does not match the release channel.' });
  }
  const assetIds = [...release.packages.map((pkg) => pkg.id), ...(release.nativeApk ? [release.nativeApk.id] : [])];
  if (new Set(assetIds).size !== assetIds.length) {
    ctx.addIssue({ code: 'custom', path: ['packages'], message: 'Asset IDs must be unique within a release.' });
  }
});

function sortCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (typeof value === 'object' && value !== null) {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(object).sort().map((key) => [key, sortCanonical(object[key])]));
  }
  return value;
}

export function canonicalAppUpdateJson(value: unknown): string {
  return JSON.stringify(sortCanonical(value));
}
