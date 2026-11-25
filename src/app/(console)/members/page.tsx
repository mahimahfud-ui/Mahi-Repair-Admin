import { ConsoleShell } from '@/components/console-shell';
import { requireOwner } from '@/lib/auth/require-owner';
import { formatDate } from '@/lib/utils';
import { Smartphone } from 'lucide-react';
import { MembersAccessManager } from '@/components/members-access-manager';
import { setDeviceRevoked } from '@/app/actions';

export const dynamic = 'force-dynamic';

export default async function MembersPage() {
  const { supabase } = await requireOwner();
  const [{ data: members, error }, { data: devices, error: deviceError }] = await Promise.all([
    supabase.from('profiles').select('id,member_code,display_name,status,created_at').eq('role', 'member').order('created_at', { ascending: false }),
    supabase.from('devices').select('id,user_id,device_label,app_version,android_version,android_api,last_seen_at,revoked_at').order('last_seen_at', { ascending: false }),
  ]);
  const memberById = new Map((members ?? []).map((member) => [member.id, member]));

  return (
    <ConsoleShell active="/members" title="Members & Devices" subtitle="Issue Member IDs and 12-digit PINs, then manage account/device access">
      {error && <p className="panel mb-4 p-4 text-sm text-red-300">{error.message}</p>}
      <MembersAccessManager members={members ?? []} />

      <div className="panel mt-4 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[#252830] p-4 text-sm font-medium"><Smartphone size={15} className="text-red-400" /> Registered devices · {devices?.length ?? 0}</div>
        {deviceError ? <p className="p-4 text-sm text-red-300">{deviceError.message}</p> : devices?.length ? <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="text-[10px] muted"><tr><th className="p-4 text-left">DEVICE</th><th className="p-4 text-left">MEMBER</th><th className="p-4 text-left">APP / ANDROID</th><th className="p-4 text-left">LAST SEEN</th><th className="p-4 text-left">STATE / CONTROL</th></tr></thead><tbody className="divide-y divide-[#252830]">{devices.map((device) => { const member = memberById.get(device.user_id); return <tr key={device.id}><td className="p-4"><div>{device.device_label || device.id.slice(0, 8)}</div><div className="mt-1 font-mono muted">{device.id.slice(0, 12)}…</div></td><td className="p-4">{member?.display_name || member?.member_code || device.user_id.slice(0, 8)}</td><td className="p-4">{device.app_version} / Android {device.android_version} (API {device.android_api ?? '—'})</td><td className="p-4 muted">{formatDate(device.last_seen_at)}</td><td className="p-4"><div className="flex items-center gap-2"><span>{device.revoked_at ? 'REVOKED' : 'ACTIVE'}</span><form action={setDeviceRevoked}><input type="hidden" name="device_id" value={device.id} /><input type="hidden" name="revoked" value={device.revoked_at ? 'false' : 'true'} /><button className="btn btn-secondary px-2 py-1 text-[10px]">{device.revoked_at ? 'Restore' : 'Revoke'}</button></form></div></td></tr>; })}</tbody></table></div> : <p className="p-6 text-center text-xs muted">No Android devices have registered.</p>}
      </div>
    </ConsoleShell>
  );
}
