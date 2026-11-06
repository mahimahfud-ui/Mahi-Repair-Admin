import { ConsoleShell } from '@/components/console-shell';
import { requireOwner } from '@/lib/auth/require-owner';
import { formatDate } from '@/lib/utils';
import { Activity, Boxes, CheckCircle2, Users, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
export const dynamic = 'force-dynamic';

type OverviewAnalytics = { total_runs: number; success: number; partial: number; failed: number; cancelled: number };

export default async function OverviewPage() {
  const { supabase } = await requireOwner();
  const [tools, members, published, recent, analyticsResult] = await Promise.all([
    supabase.from('repair_tools').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'member').eq('status', 'active'),
    supabase.from('repair_tools').select('id', { count: 'exact', head: true }).eq('status', 'PUBLISHED'),
    supabase.from('admin_audit_logs').select('id,action,created_at,details').order('created_at', { ascending: false }).limit(6),
    supabase.functions.invoke('get-admin-analytics', { body: {} }),
  ]);
  const analytics = analyticsResult.data?.data as OverviewAnalytics | undefined;
  const stats = [
    ['Repair tools', tools.count ?? 0, Boxes, 'All lifecycle states'],
    ['Active members', members.count ?? 0, Users, 'Authorized accounts'],
    ['Executions', analytics?.total_runs ?? 0, Activity, 'Recorded repair runs'],
    ['Published tools', published.count ?? 0, CheckCircle2, 'Available for delivery'],
  ] as const;
  const success = analytics?.success ?? 0;
  const failed = analytics?.failed ?? 0;
  const partial = analytics?.partial ?? 0;
  const total = analytics?.total_runs ?? 0;

  return <ConsoleShell active="/" title="Overview" subtitle="Your private repair ecosystem at a glance">
    {analyticsResult.error && <div className="panel mb-4 p-4 text-sm text-red-300">Repair analytics are temporarily unavailable.</div>}
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map(([label, value, Icon, description]) => <div className="panel p-5" key={label}><div className="flex items-center justify-between"><span className="text-xs muted">{label}</span><Icon size={17} className="text-red-400" /></div><div className="stat-value mt-4">{value.toLocaleString()}</div><div className="mt-2 text-[11px] muted">{description}</div></div>)}</div>
    <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
      <section className="panel p-5"><div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">Execution health</h2><p className="mt-1 text-xs muted">Aggregate status from accepted run records</p></div><Link href="/logs" className="flex items-center gap-1 text-xs text-red-300">View logs <ArrowUpRight size={13} /></Link></div><div className="mt-6 grid grid-cols-3 gap-3"><div><div className="text-2xl font-bold">{success}</div><div className="mt-1 text-xs text-emerald-300">Successful</div></div><div><div className="text-2xl font-bold">{failed}</div><div className="mt-1 text-xs text-red-300">Failed</div></div><div><div className="text-2xl font-bold">{partial}</div><div className="mt-1 text-xs text-amber-300">Partial</div></div></div><div className="mt-6 flex h-2 overflow-hidden rounded-full bg-[#252830]"><div className="bg-emerald-500" style={{ width: `${total ? success / total * 100 : 0}%` }} /><div className="bg-red-500" style={{ width: `${total ? failed / total * 100 : 0}%` }} /><div className="bg-amber-400" style={{ width: `${total ? partial / total * 100 : 0}%` }} /></div><p className="mt-3 text-[11px] muted">A submitted result is telemetry, not independent proof of a successful physical repair.</p></section>
      <section className="panel p-5"><h2 className="text-sm font-semibold">Quick actions</h2><div className="mt-4 grid grid-cols-1 gap-2"><Link href="/tools/new" className="btn btn-primary justify-between">Create repair tool <ArrowUpRight size={15} /></Link><Link href="/test-lab" className="btn btn-secondary justify-between">Validate a recipe <ArrowUpRight size={15} /></Link><Link href="/members" className="btn btn-secondary justify-between">Invite a member <ArrowUpRight size={15} /></Link></div></section>
    </div>
    <section className="panel mt-5 p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-sm font-semibold">Recent administrative activity</h2><p className="mt-1 text-xs muted">Append-only audit trail</p></div><Link href="/security" className="text-xs text-red-300">Security center</Link></div>{recent.data?.length ? <div className="divide-y divide-[#252830]">{recent.data.map((row) => <div key={row.id} className="flex items-center justify-between gap-4 py-3"><div><div className="text-sm">{row.action}</div><div className="mt-1 text-[11px] muted">{row.details ? JSON.stringify(row.details) : '—'}</div></div><time className="whitespace-nowrap text-[11px] muted">{formatDate(row.created_at)}</time></div>)}</div> : <div className="py-7 text-center text-sm muted">No administrative activity has been recorded yet.</div>}</section>
  </ConsoleShell>;
}
