"use client";
import { CheckCircle2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Chips, Drawer, Empty, PageHeader, SearchInput, TableCard, TableSkeleton, Td, Th, Tr, useLoading } from "@/components/ui";
import { Report, reports } from "@/lib/mock-data";

const filters = ["All", "Success", "Failed"] as const;
export default function ReportsPage() {
  const loading = useLoading();
  const [q, setQ] = useState(""); const [f, setF] = useState<(typeof filters)[number]>("All");
  const [sel, setSel] = useState<Report | null>(null);
  const rows = useMemo(() => reports.filter((r) => (f === "All" || r.result === f) && (r.tool + r.member + r.device).toLowerCase().includes(q.toLowerCase())), [q, f]);
  return <>
    <PageHeader title="Repair Reports" sub="Every repair run, with its result and details." />
    <div className="mb-4 flex flex-wrap items-center gap-3"><SearchInput value={q} onChange={setQ} placeholder="Search reports" /><Chips options={filters} value={f} onChange={setF} /></div>
    {loading ? <TableSkeleton /> : <TableCard>
      <thead><tr><Th>Result</Th><Th>Tool</Th><Th>Member</Th><Th>Device</Th><Th>Duration</Th><Th>When</Th></tr></thead>
      <tbody>{rows.map((r) => <Tr key={r.id} onClick={() => setSel(r)}>
        <Td><Badge label={r.result} /></Td><Td className="font-medium">{r.tool}</Td><Td>{r.member}</Td><Td className="text-muted">{r.device}</Td><Td className="text-muted">{r.duration}</Td><Td className="text-muted">{r.when}</Td></Tr>)}</tbody>
      {rows.length === 0 && <tbody><tr><td colSpan={6}><Empty title="No reports found" hint="Try a different search or filter." /></td></tr></tbody>}
    </TableCard>}
    <Drawer open={!!sel} onClose={() => setSel(null)} title="Report details">
      {sel && <div className="space-y-6">
        <div className="flex items-center gap-3">{sel.result === "Success" ? <CheckCircle2 className="text-accent" size={28} /> : <XCircle className="text-danger" size={28} />}
          <div><p className="text-lg font-semibold">{sel.tool}</p><p className="text-sm text-muted">{sel.result === "Success" ? "Completed successfully" : "Did not complete"}</p></div></div>
        <div className="grid grid-cols-2 gap-3">{[["Member", sel.member], ["Device", sel.device], ["Duration", sel.duration], ["When", sel.when]].map(([k, v]) =>
          <div key={k} className="rounded-xl border border-line bg-raised p-3"><p className="text-xs text-muted">{k}</p><p className="mt-1 text-sm font-medium">{v}</p></div>)}</div>
        <div><p className="mb-2 text-sm text-muted">Notes</p><p className="rounded-xl border border-line bg-raised p-4 text-sm">{sel.notes}</p></div>
      </div>}
    </Drawer>
  </>;
}
