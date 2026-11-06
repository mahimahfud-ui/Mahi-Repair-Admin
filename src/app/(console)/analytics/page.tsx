import { ConsoleShell } from '@/components/console-shell';
import { requireOwner } from '@/lib/auth/require-owner';
import { Activity, CheckCircle2, XCircle, Users, Boxes } from 'lucide-react';
import { AnalyticsChart } from '@/components/analytics-chart';

export const dynamic = 'force-dynamic';

type AnalyticsData = {
  total_runs: number; success: number; partial: number; failed: number; cancelled: number;
  active_members: number; published_tools: number;
  most_used_tools: { tool_id: string; name: string; runs: number }[];
  common_failures: { error_code: string; occurrences: number }[];
};

export default async function AnalyticsPage() {
  const { supabase } = await requireOwner();
  const { data: response, error } = await supabase.functions.invoke('get-admin-analytics', { body: {} });
  const stats = response?.data as AnalyticsData | undefined;
  const metrics = [
    ['Total executions', stats?.total_runs ?? 0, Activity],
    ['Successful', stats?.success ?? 0, CheckCircle2],
    ['Failed', stats?.failed ?? 0, XCircle],
    ['Active members', stats?.active_members ?? 0, Users],
    ['Published tools', stats?.published_tools ?? 0, Boxes],
  ] as const;
  const chartData = [
    { result: 'SUCCESS', count: stats?.success ?? 0 },
    { result: 'PARTIAL', count: stats?.partial ?? 0 },
    { result: 'FAILED', count: stats?.failed ?? 0 },
    { result: 'CANCELLED', count: stats?.cancelled ?? 0 },
  ];

  return (
    <ConsoleShell active="/analytics" title="Analytics" subtitle="Server-aggregated repair activity and failure trends">
      {error && <div className="panel mb-4 p-4 text-sm text-red-300">Analytics are temporarily unavailable.</div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map(([label, value, Icon]) => <div className="panel p-5" key={label}><Icon className="text-red-400" size={18} /><div className="stat-value mt-4">{value.toLocaleString()}</div><div className="mt-1 text-xs muted">{label}</div></div>)}
      </div>
      <div className="panel mt-5 p-5"><h2 className="text-sm font-semibold">Repair outcomes</h2><p className="mt-1 text-xs muted">Aggregated by PostgreSQL; not limited to the most recent page of records.</p><AnalyticsChart data={chartData} /></div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <section className="panel p-5"><h2 className="text-sm font-semibold">Most frequently used tools</h2>{stats?.most_used_tools?.length ? <div className="mt-3 divide-y divide-[#252830]">{stats.most_used_tools.map((tool) => <div key={tool.tool_id} className="flex items-center justify-between gap-3 py-3 text-xs"><div><div>{tool.name}</div><div className="mt-1 font-mono muted">{tool.tool_id}</div></div><b className="tabular-nums">{tool.runs} runs</b></div>)}</div> : <p className="mt-3 text-xs muted">No tool runs recorded yet.</p>}</section>
        <section className="panel p-5"><h2 className="text-sm font-semibold">Most common failure codes</h2>{stats?.common_failures?.length ? <div className="mt-3 divide-y divide-[#252830]">{stats.common_failures.map((item) => <div key={item.error_code} className="flex items-center justify-between gap-3 py-3 text-xs"><code className="text-red-300">{item.error_code}</code><b className="tabular-nums">{item.occurrences}</b></div>)}</div> : <p className="mt-3 text-xs muted">No failure codes recorded yet.</p>}</section>
      </div>
      <p className="mt-5 text-[11px] muted">Statistics are based only on submitted repair-run telemetry. They do not establish that a device was physically repaired.</p>
    </ConsoleShell>
  );
}
