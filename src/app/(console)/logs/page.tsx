import { ConsoleShell } from '@/components/console-shell';
import { requireOwner } from '@/lib/auth/require-owner';
import { formatDate } from '@/lib/utils';
import { Filter, RefreshCcw } from 'lucide-react';

export const dynamic = 'force-dynamic';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
type Search = { member?: string; device?: string; tool?: string; result?: string; from?: string; to?: string };

export default async function LogsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const filters = await searchParams;
  const { supabase } = await requireOwner();
  const [{ data: members }, { data: devices }, { data: tools }] = await Promise.all([
    supabase.from('profiles').select('id,email,display_name').eq('role', 'member').order('email'),
    supabase.from('devices').select('id,user_id,device_label').order('registered_at', { ascending: false }),
    supabase.from('repair_tools').select('id,name,slug').order('name'),
  ]);
  let query = supabase.from('repair_runs').select('id,user_id,device_id,tool_id,tool_version,result,started_at,completed_at,error_code,step_results,app_version').order('started_at', { ascending: false }).limit(200);
  if (filters.member && uuidPattern.test(filters.member)) query = query.eq('user_id', filters.member);
  if (filters.device && uuidPattern.test(filters.device)) query = query.eq('device_id', filters.device);
  if (filters.tool && uuidPattern.test(filters.tool)) query = query.eq('tool_id', filters.tool);
  if (filters.result && ['SUCCESS', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(filters.result)) query = query.eq('result', filters.result);
  if (filters.from && datePattern.test(filters.from)) query = query.gte('started_at', `${filters.from}T00:00:00.000Z`);
  if (filters.to && datePattern.test(filters.to)) query = query.lte('started_at', `${filters.to}T23:59:59.999Z`);
  const { data: runs, error } = await query;
  const memberById = new Map((members ?? []).map((member) => [member.id, member]));
  const deviceById = new Map((devices ?? []).map((device) => [device.id, device]));
  const toolById = new Map((tools ?? []).map((tool) => [tool.id, tool]));
  const activeFilters = Object.values(filters).some(Boolean);

  return <ConsoleShell active="/logs" title="Repair Logs" subtitle="Filterable repair telemetry with minimal device metadata">
    <form method="get" className="panel mb-4 grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-6">
      <label className="text-[10px] muted">MEMBER<select name="member" defaultValue={filters.member ?? ''} className="field mt-1 text-xs"><option value="">All members</option>{(members ?? []).map((member) => <option key={member.id} value={member.id}>{member.email || member.display_name || member.id}</option>)}</select></label>
      <label className="text-[10px] muted">DEVICE<select name="device" defaultValue={filters.device ?? ''} className="field mt-1 text-xs"><option value="">All devices</option>{(devices ?? []).map((device) => <option key={device.id} value={device.id}>{device.device_label || device.id.slice(0, 8)}</option>)}</select></label>
      <label className="text-[10px] muted">TOOL<select name="tool" defaultValue={filters.tool ?? ''} className="field mt-1 text-xs"><option value="">All tools</option>{(tools ?? []).map((tool) => <option key={tool.id} value={tool.id}>{tool.name}</option>)}</select></label>
      <label className="text-[10px] muted">RESULT<select name="result" defaultValue={filters.result ?? ''} className="field mt-1 text-xs"><option value="">All results</option>{['SUCCESS', 'PARTIAL', 'FAILED', 'CANCELLED'].map((result) => <option key={result}>{result}</option>)}</select></label>
      <label className="text-[10px] muted">FROM DATE<input name="from" type="date" defaultValue={filters.from ?? ''} className="field mt-1 text-xs" /></label>
      <label className="text-[10px] muted">TO DATE<input name="to" type="date" defaultValue={filters.to ?? ''} className="field mt-1 text-xs" /></label>
      <div className="flex gap-2 sm:col-span-2 xl:col-span-6"><button className="btn btn-primary"><Filter size={14} /> Apply filters</button><a href="/logs" className="btn btn-secondary"><RefreshCcw size={14} /> Clear</a></div>
    </form>

    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#252830] p-4 text-sm"><span>Execution history</span><span className="text-xs muted">{runs?.length ?? 0} records{activeFilters ? ' · filtered' : ' · latest 200'}</span></div>
      {error ? <p className="p-4 text-sm text-red-300">Repair reports are temporarily unavailable.</p> : runs?.length ? <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="text-[10px] muted"><tr>{['RESULT', 'TOOL', 'VERSION', 'MEMBER', 'DEVICE', 'STARTED', 'APP', 'ERROR', 'STEP RESULTS'].map((label) => <th key={label} className="p-4 text-left">{label}</th>)}</tr></thead><tbody className="divide-y divide-[#252830]">{runs.map((run) => { const member = memberById.get(run.user_id); const device = deviceById.get(run.device_id); const tool = toolById.get(run.tool_id); return <tr key={run.id} className="align-top"><td className="p-4"><span className={run.result === 'SUCCESS' ? 'text-emerald-300' : run.result === 'FAILED' ? 'text-red-300' : run.result === 'PARTIAL' ? 'text-amber-300' : 'muted'}>{run.result}</span></td><td className="p-4"><div>{tool?.name || run.tool_id.slice(0, 8)}</div><div className="mt-1 font-mono muted">{tool?.slug || run.tool_id}</div></td><td className="p-4">v{run.tool_version}</td><td className="p-4">{member?.email || run.user_id.slice(0, 8)}</td><td className="p-4">{device?.device_label || run.device_id.slice(0, 8)}</td><td className="whitespace-nowrap p-4 muted">{formatDate(run.started_at)}</td><td className="p-4">{run.app_version}</td><td className="p-4 text-red-300">{run.error_code || '—'}</td><td className="p-4"><details className="max-w-[260px]"><summary className="cursor-pointer text-red-300">{Array.isArray(run.step_results) ? run.step_results.length : 0} steps</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-[#0b0d11] p-2 text-[10px] text-gray-300">{JSON.stringify(run.step_results, null, 2)}</pre></details></td></tr>; })}</tbody></table></div> : <p className="p-8 text-center text-sm muted">{activeFilters ? 'No repair runs match these filters.' : 'No repair runs submitted yet.'}</p>}
    </div>
    <p className="mt-3 text-[11px] muted">Showing at most 200 matching runs. Step results contain codes and statuses only; do not submit personal data in error fields.</p>
  </ConsoleShell>;
}
