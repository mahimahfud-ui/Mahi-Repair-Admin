"use client";
import { ArrowDownRight, ArrowUpRight, FilePlus2, RefreshCw, ShieldOff, UserPlus } from "lucide-react";
import Link from "next/link";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Btn, Card, PageHeader, Skeleton, useLoading, useToast, cn } from "@/components/ui";
import { logs, repairsByTool, repairsOverTime, reports, stats } from "@/lib/mock-data";

const tip = { contentStyle: { background: "#1b1d21", border: "1px solid #25272c", borderRadius: 12, fontSize: 12 }, cursor: { stroke: "#25272c" } };

function Spark({ data }: { data: number[] }) {
  const max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${28 - ((v - min) / (max - min || 1)) * 24}`).join(" ");
  return <svg viewBox="0 0 100 30" className="h-8 w-24" preserveAspectRatio="none"><polyline points={pts} fill="none" stroke="#7cc4b0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function Overview() {
  const loading = useLoading(); const toast = useToast();
  return <>
    <PageHeader title="Overview" sub="Activity across your repair platform this week.">
      <Btn onClick={() => toast("Dashboard refreshed")}><RefreshCw size={15} />Refresh</Btn>
    </PageHeader>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {loading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[116px]" />) : stats.map((s) => <Card key={s.label} hover className="p-5">
        <p className="text-sm text-muted">{s.label}</p>
        <div className="mt-2 flex items-end justify-between"><p className="text-3xl font-semibold tracking-tight">{s.value}</p><Spark data={s.spark} /></div>
        <p className={cn("mt-2 inline-flex items-center gap-1 text-xs", s.label === "Failure rate" ? "text-accent" : "text-accent")}>{s.delta.startsWith("+") ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{s.delta} vs last week</p>
      </Card>)}
    </div>

    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <Card className="p-5 lg:col-span-2">
        <h2 className="font-medium">Repairs this week</h2><p className="text-sm text-muted">Successful and failed runs per day</p>
        {loading ? <Skeleton className="mt-4 h-64" /> : <div className="mt-4 h-64"><ResponsiveContainer><AreaChart data={repairsOverTime}>
          <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7cc4b0" stopOpacity={0.28} /><stop offset="100%" stopColor="#7cc4b0" stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid stroke="#1f2125" vertical={false} /><XAxis dataKey="day" stroke="#8a8e97" fontSize={12} tickLine={false} axisLine={false} /><YAxis stroke="#8a8e97" fontSize={12} tickLine={false} axisLine={false} width={36} />
          <Tooltip {...tip} /><Area type="monotone" dataKey="success" name="Success" stroke="#7cc4b0" strokeWidth={2} fill="url(#g)" animationDuration={900} />
          <Area type="monotone" dataKey="failed" name="Failed" stroke="#e5786d" strokeWidth={2} fill="none" animationDuration={900} /></AreaChart></ResponsiveContainer></div>}
      </Card>
      <Card className="p-5">
        <h2 className="font-medium">Most used tools</h2><p className="text-sm text-muted">Runs in the last 30 days</p>
        {loading ? <Skeleton className="mt-4 h-64" /> : <div className="mt-4 h-64"><ResponsiveContainer><BarChart data={repairsByTool} layout="vertical" margin={{ left: 8 }}>
          <XAxis type="number" hide /><YAxis type="category" dataKey="tool" stroke="#8a8e97" fontSize={12} tickLine={false} axisLine={false} width={100} />
          <Tooltip {...tip} cursor={{ fill: "#ffffff08" }} /><Bar dataKey="count" name="Runs" fill="#7cc4b0" radius={[0, 6, 6, 0]} animationDuration={900} /></BarChart></ResponsiveContainer></div>}
      </Card>
    </div>

    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <Card className="p-5 lg:col-span-2">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-medium">Latest repair reports</h2><Link href="/reports" className="text-sm text-accent hover:underline">View all</Link></div>
        {loading ? <Skeleton className="h-48" /> : <div className="divide-y divide-line/60">{reports.slice(0, 5).map((r) => <div key={r.id} className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0"><p className="truncate text-sm font-medium">{r.tool}</p><p className="truncate text-xs text-muted">{r.member} on {r.device} · {r.when}</p></div><Badge label={r.result} /></div>)}</div>}
      </Card>
      <div className="space-y-4">
        <Card className="p-5"><h2 className="mb-3 font-medium">Quick actions</h2><div className="grid gap-2">
          <Link href="/tools"><Btn className="w-full justify-start"><FilePlus2 size={15} />Add repair tool</Btn></Link>
          <Link href="/members"><Btn className="w-full justify-start"><UserPlus size={15} />Review members</Btn></Link>
          <Link href="/devices"><Btn className="w-full justify-start"><ShieldOff size={15} />Manage devices</Btn></Link></div></Card>
        <Card className="p-5"><h2 className="mb-3 font-medium">Recent activity</h2>
          {loading ? <Skeleton className="h-32" /> : <ul className="space-y-3">{logs.slice(0, 4).map((l) => <li key={l.id} className="text-sm"><span className="text-ink">{l.action}</span> <span className="text-muted">· {l.target}</span><p className="text-xs text-muted">{l.when}</p></li>)}</ul>}</Card>
      </div>
    </div>
  </>;
}
