import { AppUpdateInputSchema, canonicalAppUpdateJson, RemoteConfigSchema } from './app-update.ts';

const validRelease = {
  channel: 'stable',
  releaseNumber: 1,
  appVersionCode: 1,
  appVersionName: '1.0.0',
  minSupportedAppVersionCode: 1,
  mandatory: false,
  releaseNotes: 'Initial signed remote configuration',
  remoteConfig: {
    featureFlags: { "new-diagnostics": true },
    repairTools: { 'run-repair': true },
    ui: { announcement: { title: 'Update ready', body: 'New repair guidance is available.', tone: 'info' } },
    toolMetadata: {},
    compatibility: { minAndroidApi: 26, maxAndroidApi: 100 },
  },
  packages: [],
  nativeApk: null,
};

Deno.test('app update contract accepts typed data-only remote configuration', () => {
  const parsed = AppUpdateInputSchema.safeParse(validRelease);
  if (!parsed.success) throw new Error(parsed.error.message);
  if (parsed.data.remoteConfig.featureFlags['new-diagnostics'] !== true) {
    throw new Error('Feature flag was not preserved.');
  }
});

Deno.test('remote configuration rejects script-shaped keys and non-boolean flags', () => {
  const parsed = RemoteConfigSchema.safeParse({
    featureFlags: { runCode: 'true' },
    repairTools: {},
    ui: {},
    toolMetadata: {},
    compatibility: { minAndroidApi: 26, maxAndroidApi: 100 },
    script: 'alert(1)',
  });
  if (parsed.success) throw new Error('Unknown executable content must be rejected.');
});

Deno.test('content packages reject traversal and executable resource types', () => {
  const pkg = AppUpdateInputSchema.safeParse({
    ...validRelease,
    packages: [{
      id: 'icons',
      version: 1,
      storagePath: 'channels/stable/packages/12345678-1234-1234-1234-123456789abc.zip',
      sha256: 'a'.repeat(64),
      sizeBytes: 1000,
      contentType: 'application/zip',
      entries: [{ path: '../payload.js', sha256: 'b'.repeat(64), sizeBytes: 10 }],
    }],
  });
  if (pkg.success) throw new Error('Unsafe package entry was accepted.');
});

Deno.test('package channel must match release channel', () => {
  const parsed = AppUpdateInputSchema.safeParse({
    ...validRelease,
    channel: 'beta',
    packages: [{
      id: 'icons',
      version: 1,
      storagePath: 'channels/stable/packages/12345678-1234-1234-1234-123456789abc.zip',
      sha256: 'a'.repeat(64),
      sizeBytes: 1000,
      contentType: 'application/zip',
      entries: [{ path: 'icons/logo.png', sha256: 'b'.repeat(64), sizeBytes: 10 }],
    }],
  });
  if (parsed.success) throw new Error('Cross-channel asset was accepted.');
});

Deno.test('canonical manifest output sorts object keys but preserves array order', () => {
  const canonical = canonicalAppUpdateJson({ z: 1, a: { y: 2, b: 3 }, entries: ['first', 'second'] });
  if (canonical !== '{"a":{"b":3,"y":2},"entries":["first","second"],"z":1}') {
    throw new Error('Canonical JSON output changed.');
  }
});
