import { ConsoleShell } from '@/components/console-shell';
import { requireOwner } from '@/lib/auth/require-owner';
import { formatDate } from '@/lib/utils';
import { UserPlus, Smartphone } from 'lucide-react';
import { inviteMember, setMemberStatus, setDeviceRevoked } from '@/app/actions';

export const dynamic = 'force-dynamic';

export default async function MembersPage() {
  const { supabase } = await requireOwner();
  const [{ data: members, error }, { data: devices, error: deviceError }] = await Promise.all([
    supabase.from('profiles').select('id,email,display_name,role,status,created_at').eq('role', 'member').order('created_at', { ascending: false }),
    supabase.from('devices').select('id,user_id,device_label,app_version,android_version,android_api,last_seen_at,revoked_at').order('last_seen_at', { ascending: false }),
  ]);
  const memberById = new Map((members ?? []).map((member) => [member.id, member]));

  return (
    <ConsoleShell active="/members" title="Members & Devices" subtitle="Invite trusted users and control account/device access">
      <div className="panel mb-4 p-5">
        <div className="mb-4 flex items-center gap-3"><UserPlus className="text-red-400" /><div><h2 className="text-sm font-semibold">Invite a member</h2><p className="mt-1 text-xs muted">Invitation creates a member account only. Owner role is never assigned through this form.</p></div></div>
        <form action={inviteMember} className="flex flex-col gap-2 sm:flex-row"><input className="field" type="email" name="email" required maxLength={254} placeholder="family@example.com" /><button className="btn btn-primary shrink-0">Send invitation</button></form>
      </div>

      <div className="panel overflow-hidden">
        <div className="border-b border-[#252830] p-4 text-sm font-medium">Member accounts · {members?.length ?? 0}</div>
        {error ? <p className="p-4 text-sm text-red-300">Member records are temporarily unavailable.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-[10px] muted"><tr><th className="p-4 text-left">MEMBER</th><th className="p-4 text-left">STATUS</th><th className="p-4 text-left">CREATED</th><th className="p-4 text-left">ACCESS CONTROL</th></tr></thead><tbody className="divide-y divide-[#252830]">{(members ?? []).map((member) => <tr key={member.id}><td className="p-4"><div className="text-xs">{member.display_name || 'Member'}</div><div className="mt-1 text-[11px] muted">{member.email || member.id}</div></td><td className="p-4 text-xs">{member.status}</td><td className="p-4 text-xs muted">{formatDate(member.created_at)}</td><td className="p-4"><form action={setMemberStatus} className="flex gap-2"><input type="hidden" name="user_id" value={member.id} /><select name="status" defaultValue={member.status} className="field py-2 text-xs"><option value="active">Active</option><option value="suspended">Suspended</option><option value="revoked">Revoked</option></select><button className="btn btn-secondary py-2 text-xs">Save</button></form></td></tr>)}</tbody></table></div>}
      </div>

      <div className="panel mt-4 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[#252830] p-4 text-sm font-medium"><Smartphone size={15} className="text-red-400" /> Registered devices · {devices?.length ?? 0}</div>
        {deviceError ? <p className="p-4 text-sm text-red-300">Device records are temporarily unavailable.</p> : devices?.length ? <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="text-[10px] muted"><tr><th className="p-4 text-left">DEVICE</th><th className="p-4 text-left">MEMBER</th><th className="p-4 text-left">APP / ANDROID</th><th className="p-4 text-left">LAST SEEN</th><th className="p-4 text-left">STATE / CONTROL</th></tr></thead><tbody className="divide-y divide-[#252830]">{devices.map((device) => { const member = memberById.get(device.user_id); return <tr key={device.id}><td className="p-4"><div>{device.device_label || device.id.slice(0, 8)}</div><div className="mt-1 font-mono muted">{device.id.slice(0, 12)}…</div></td><td className="p-4">{member?.email || device.user_id.slice(0, 8)}</td><td className="p-4">{device.app_version} / Android {device.android_version} (API {device.android_api ?? '—'})</td><td className="p-4 muted">{formatDate(device.last_seen_at)}</td><td className="p-4"><div className="flex items-center gap-2"><span>{device.revoked_at ? 'REVOKED' : 'ACTIVE'}</span><form action={setDeviceRevoked}><input type="hidden" name="device_id" value={device.id} /><input type="hidden" name="revoked" value={device.revoked_at ? 'false' : 'true'} /><button className="btn btn-secondary px-2 py-1 text-[10px]">{device.revoked_at ? 'Restore' : 'Revoke'}</button></form></div></td></tr>; })}</tbody></table></div> : <p className="p-6 text-center text-xs muted">No Android devices have registered.</p>}
      </div>
    </ConsoleShell>
  );
}
