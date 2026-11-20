'use client';

import { useMemo, useState } from 'react';
import { publishAppUpdate } from '@/app/actions';

type UploadedAsset = {
  id: string;
  storagePath: string;
  sha256: string;
  sizeBytes: number;
  contentType: string;
};

const DEFAULT_REMOTE_CONFIG = JSON.stringify({
  featureFlags: { "new-diagnostics": true },
  repairTools: { 'run-repair': true },
  ui: { announcement: null },
  toolMetadata: {},
  compatibility: { minAndroidApi: 26, maxAndroidApi: 100 },
}, null, 2);

export function ReleaseManagerForm() {
  const [channel, setChannel] = useState('stable');
  const [appVersionCode, setAppVersionCode] = useState(1);
  const [packageVersion, setPackageVersion] = useState(1);
  const [packageAsset, setPackageAsset] = useState<UploadedAsset | null>(null);
  const [packageEntries, setPackageEntries] = useState('[\n  { "path": "metadata/repair-tools.json", "sha256": "REPLACE_WITH_SHA256", "sizeBytes": 128 }\n]');
  const [apkAsset, setApkAsset] = useState<UploadedAsset | null>(null);
  const [certificateSha, setCertificateSha] = useState('');
  const [uploading, setUploading] = useState<'packages' | 'native' | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploadMessage, setUploadMessage] = useState('');

  const packageJson = useMemo(() => packageAsset ? JSON.stringify([{
    ...packageAsset,
    version: packageVersion,
    entries: (() => { try { return JSON.parse(packageEntries); } catch { return []; } })(),
  }]) : '[]', [packageAsset, packageEntries, packageVersion]);

  const nativeApkJson = useMemo(() => apkAsset ? JSON.stringify({
    ...apkAsset,
    packageName: 'com.aistudio.mahirepair.qrzntk',
    versionCode: appVersionCode,
    signingCertificateSha256: certificateSha.trim().toLowerCase(),
  }) : 'null', [apkAsset, certificateSha, appVersionCode]);

  async function uploadAsset(kind: 'packages' | 'native', file?: File) {
    if (!file) return;
    setUploading(kind);
    setUploadError('');
    setUploadMessage('');
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('channel', channel);
      form.set('kind', kind);
      const response = await fetch('/api/releases/upload', { method: 'POST', body: form });
      const result = await response.json() as { data?: UploadedAsset; error?: string };
      if (!response.ok || !result.data) throw new Error(result.error ?? 'Upload failed.');
      if (kind === 'packages') setPackageAsset(result.data);
      else setApkAsset(result.data);
      setUploadMessage(`${file.name} uploaded privately. SHA-256 calculated by the server.`);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setUploading(null);
    }
  }

  return (
    <section className="panel p-4 sm:p-5">
      <div className="mb-5">
        <p className="text-[10px] uppercase tracking-[.18em] text-red-300">Owner release workflow</p>
        <h2 className="mt-1 text-base font-semibold">Publish a signed app release</h2>
        <p className="muted mt-1 text-xs leading-5">Configuration is applied only after Android verifies the RSA-SHA256 manifest. ZIP packages are data-only; script and executable entries are rejected by the contract.</p>
      </div>

      <form action={publishAppUpdate} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-xs">Release channel
            <select name="channel" value={channel} onChange={(event) => { setChannel(event.target.value); setPackageAsset(null); setApkAsset(null); }} className="mt-1 w-full rounded-lg border border-[#333843] bg-[#101319] p-2.5 text-sm">
              <option value="stable">Stable</option><option value="beta">Beta</option>
            </select>
          </label>
          <label className="block text-xs">Release number
            <input name="release_number" type="number" min="1" required defaultValue="1" className="mt-1 w-full rounded-lg border border-[#333843] bg-[#101319] p-2.5 text-sm"/>
          </label>
          <label className="block text-xs">App version name
            <input name="app_version_name" required defaultValue="1.0.0" maxLength={40} className="mt-1 w-full rounded-lg border border-[#333843] bg-[#101319] p-2.5 text-sm"/>
          </label>
          <label className="block text-xs">App version code
            <input name="app_version_code" type="number" min="1" required value={appVersionCode} onChange={(event) => setAppVersionCode(Math.max(1, Number(event.target.value) || 1))} className="mt-1 w-full rounded-lg border border-[#333843] bg-[#101319] p-2.5 text-sm"/>
          </label>
          <label className="block text-xs">Minimum supported app code
            <input name="min_supported_app_version_code" type="number" min="1" required defaultValue="1" className="mt-1 w-full rounded-lg border border-[#333843] bg-[#101319] p-2.5 text-sm"/>
          </label>
          <label className="flex items-center gap-2 self-end rounded-lg border border-[#333843] p-3 text-xs">
            <input name="mandatory" type="checkbox" className="accent-red-500"/> Mandatory native/content update
          </label>
        </div>

        <label className="block text-xs">Release notes
          <textarea name="release_notes" rows={2} maxLength={4000} placeholder="Describe what changed and whether a native app installation is required." className="mt-1 w-full rounded-lg border border-[#333843] bg-[#101319] p-3 text-sm"/>
        </label>

        <label className="block text-xs">Remote configuration JSON
          <textarea name="remote_config_json" required rows={12} defaultValue={DEFAULT_REMOTE_CONFIG} spellCheck={false} className="mt-1 w-full rounded-lg border border-[#333843] bg-[#080a0e] p-3 font-mono text-[11px] leading-5"/>
        </label>

        <input type="hidden" name="packages_json" value={packageJson}/>
        <input type="hidden" name="native_apk_json" value={nativeApkJson}/>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-[#333843] p-3">
            <div className="text-xs font-semibold">Data-only ZIP content package</div>
            <p className="muted mt-1 text-[11px] leading-5">Upload a ZIP containing only declared JSON/image resources. Provide exact entry paths, SHA-256 hashes and uncompressed byte sizes below.</p>
            <label className="mt-3 block text-xs">Content package version
              <input type="number" min="1" required value={packageVersion} onChange={(event) => setPackageVersion(Math.max(1, Number(event.target.value) || 1))} className="mt-1 w-full rounded-lg border border-[#333843] bg-[#101319] p-2.5 text-sm"/>
            </label>
            <input type="file" accept=".zip,application/zip" onChange={(event) => void uploadAsset('packages', event.target.files?.[0])} className="mt-3 block w-full text-xs"/>
            {packageAsset ? <p className="mt-2 break-all font-mono text-[10px] text-emerald-300">{packageAsset.storagePath}<br/>SHA-256 {packageAsset.sha256}</p> : null}
            <label className="mt-3 block text-xs">Declared package entries JSON
              <textarea value={packageEntries} onChange={(event) => setPackageEntries(event.target.value)} rows={5} spellCheck={false} className="mt-1 w-full rounded-lg border border-[#333843] bg-[#080a0e] p-2 font-mono text-[10px]"/>
            </label>
          </div>

          <div className="rounded-xl border border-[#333843] p-3">
            <div className="text-xs font-semibold">Signed native APK (optional)</div>
            <p className="muted mt-1 text-[11px] leading-5">The APK must use the same Android application ID and signing certificate as the installed app. Android must verify both before opening the system installer.</p>
            <input type="file" accept=".apk,application/vnd.android.package-archive" onChange={(event) => void uploadAsset('native', event.target.files?.[0])} className="mt-3 block w-full text-xs"/>
            {apkAsset ? <p className="mt-2 break-all font-mono text-[10px] text-emerald-300">{apkAsset.storagePath}<br/>SHA-256 {apkAsset.sha256}</p> : null}
            <label className="mt-3 block text-xs">Expected signing certificate SHA-256
              <input value={certificateSha} onChange={(event) => setCertificateSha(event.target.value)} maxLength={64} placeholder="64 lowercase hex characters" className="mt-1 w-full rounded-lg border border-[#333843] bg-[#101319] p-2.5 font-mono text-xs"/>
            </label>
          </div>
        </div>

        {uploading ? <p role="status" className="text-xs text-amber-200">Uploading {uploading} asset privately…</p> : null}
        {uploadMessage ? <p role="status" className="text-xs text-emerald-300">{uploadMessage}</p> : null}
        {uploadError ? <p role="alert" className="text-xs text-red-300">{uploadError}</p> : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#252830] pt-4">
          <p className="muted max-w-xl text-[11px] leading-5">Published manifests are immutable and signed server-side. Rollback is a new release with a higher number; asset URLs are short-lived and never public.</p>
          <button type="submit" disabled={uploading !== null} className="btn btn-primary disabled:opacity-50">Sign &amp; publish release</button>
        </div>
      </form>
    </section>
  );
}
