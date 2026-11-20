import { ConsoleShell } from '@/components/console-shell';
import { requireOwner } from '@/lib/auth/require-owner';
import { formatDate } from '@/lib/utils';
import { ReleaseManagerForm } from '@/components/release-manager-form';

export const dynamic = 'force-dynamic';

export default async function UpdatesPage({
  searchParams,
}: {
  searchParams: Promise<{ published?: string }>;
}) {
  const [{ supabase }, params] = await Promise.all([requireOwner(), searchParams]);
  const { data, error } = await supabase
    .from('app_update_releases')
    .select('id,channel,release_number,signature,published_at,manifest')
    .order('published_at', { ascending: false })
    .limit(50);

  return (
    <ConsoleShell
      active="/updates"
      title="App Update Manager"
      subtitle="Publish signed configuration, content packages and native APK release metadata"
    >
      {params.published === '1' ? (
        <div role="status" className="panel mb-5 border border-emerald-500/30 p-4 text-sm text-emerald-200">
          Signed release published. Android accepts a release only after device authorization and RSA-SHA256 verification. Native APK installation opens the system installer and requires approval on the device.
        </div>
      ) : null}

      <ReleaseManagerForm />

      <section className="panel mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#252830] p-4">
          <div>
            <h2 className="text-sm font-semibold">Immutable release history</h2>
            <p className="muted mt-1 text-[11px]">Rollback by publishing the previous configuration as a new, higher release number.</p>
          </div>
          <span className="muted text-[11px]">{data?.length ?? 0} releases</span>
        </div>
        {error ? (
          <p className="p-4 text-sm text-red-300">Release history is temporarily unavailable.</p>
        ) : data?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="muted text-[10px]">
                <tr>
                  <th className="p-4">CHANNEL</th>
                  <th className="p-4">RELEASE</th>
                  <th className="p-4">APP BUILD</th>
                  <th className="p-4">UPDATE TYPE</th>
                  <th className="p-4">SIGNATURE</th>
                  <th className="p-4">PUBLISHED</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#252830]">
                {data.map((release) => {
                  const manifest = release.manifest as {
                    appVersionName?: string;
                    mandatory?: boolean;
                    nativeApk?: unknown;
                    packages?: unknown[];
                  };
                  const types = [
                    'Remote config',
                    ...(manifest.packages?.length ? ['Content package'] : []),
                    ...(manifest.nativeApk ? ['Native APK'] : []),
                    ...(manifest.mandatory ? ['Mandatory'] : []),
                  ];
                  return (
                    <tr key={release.id}>
                      <td className="p-4"><span className="rounded-full bg-[#252830] px-2 py-1 text-[10px] uppercase">{release.channel}</span></td>
                      <td className="p-4 font-mono">#{release.release_number}</td>
                      <td className="p-4">{manifest.appVersionName ?? '—'}</td>
                      <td className="p-4 text-xs">{types.join(' · ')}</td>
                      <td className="p-4 font-mono text-xs">{release.signature.slice(0, 18)}…</td>
                      <td className="p-4 text-xs muted">{formatDate(release.published_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted p-5 text-sm">No app releases have been published yet.</p>
        )}
      </section>
    </ConsoleShell>
  );
}
