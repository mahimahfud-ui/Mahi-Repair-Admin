"use client";
import { motion } from "framer-motion";
import { LogIn, PowerOff, Rocket, Settings, ShieldOff, UserCog } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, Chips, Empty, PageHeader, SearchInput, Skeleton, useLoading } from "@/components/ui";
import { logs, LogEntry } from "@/lib/mock-data";

const icons: Record<LogEntry["kind"], typeof Rocket> = { publish: Rocket, disable: PowerOff, revoke: ShieldOff, member: UserCog, settings: Settings, login: LogIn };
const filters = ["All", "Tools", "Members", "Devices", "Account"] as const;
const group: Record<LogEntry["kind"], (typeof filters)[number]> = { publish: "Tools", disable: "Tools", member: "Members", revoke: "Devices", settings: "Account", login: "Account" };

export default function LogsPage() {
  const loading = useLoading();
  const [q, setQ] = useState(""); const [f, setF] = useState<(typeof filters)[number]>("All");
  const rows = useMemo(() => logs.filter((l) => (f === "All" || group[l.kind] === f) && (l.action + l.target).toLowerCase().includes(q.toLowerCase())), [q, f]);
  return <>
    <PageHeader title="Audit Logs" sub="A record of every important change made in the control center." />
    <div className="mb-4 flex flex-wrap items-center gap-3"><SearchInput value={q} onChange={setQ} placeholder="Search activity" /><Chips options={filters} value={f} onChange={setF} /></div>
    <Card className="p-6">
      {loading ? <div className="space-y-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div> :
        rows.length === 0 ? <Empty title="No activity found" hint="Try a different search or filter." /> :
        <ol className="relative space-y-6 border-l border-line pl-8">{rows.map((l, i) => { const I = icons[l.kind]; return <motion.li key={l.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05, duration: 0.3 }} className="relative">
          <span className="absolute -left-[50px] flex h-8 w-8 items-center justify-center rounded-full border border-line bg-raised text-accent"><I size={15} /></span>
          <p className="text-sm"><span className="font-medium">{l.action}</span> <span className="text-muted">· {l.target}</span></p>
          <p className="mt-0.5 text-xs text-muted">{l.actor} · {l.when}</p></motion.li>; })}</ol>}
    </Card>
  </>;
}
