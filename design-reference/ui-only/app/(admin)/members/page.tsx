"use client";
import { Ban, CheckCheck, Mail } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar, Badge, Btn, Chips, Drawer, Empty, PageHeader, SearchInput, TableCard, TableSkeleton, Td, Th, Tr, useLoading, useToast } from "@/components/ui";
import { Member, members as seed } from "@/lib/mock-data";

const filters = ["All", "Active", "Pending", "Suspended"] as const;
export default function MembersPage() {
  const loading = useLoading(); const toast = useToast();
  const [items, setItems] = useState<Member[]>(seed);
  const [q, setQ] = useState(""); const [f, setF] = useState<(typeof filters)[number]>("All");
  const [sel, setSel] = useState<Member | null>(null);
  const rows = useMemo(() => items.filter((m) => (f === "All" || m.access === f) && (m.name + m.email).toLowerCase().includes(q.toLowerCase())), [items, q, f]);
  const setAccess = (m: Member, access: Member["access"]) => { setItems((s) => s.map((x) => (x.id === m.id ? { ...x, access } : x))); setSel({ ...m, access }); toast(access === "Suspended" ? `${m.name} suspended` : `${m.name} is now active`); };
  return <>
    <PageHeader title="Members" sub="See who has access and manage their status." />
    <div className="mb-4 flex flex-wrap items-center gap-3"><SearchInput value={q} onChange={setQ} placeholder="Search members" /><Chips options={filters} value={f} onChange={setF} /></div>
    {loading ? <TableSkeleton /> : <TableCard>
      <thead><tr><Th>Member</Th><Th>Access</Th><Th>Plan</Th><Th>Devices</Th><Th>Repairs</Th><Th>Last seen</Th></tr></thead>
      <tbody>{rows.map((m) => <Tr key={m.id} onClick={() => setSel(m)}>
        <Td><div className="flex items-center gap-3"><Avatar name={m.name} /><div><p className="font-medium">{m.name}</p><p className="text-xs text-muted">{m.email}</p></div></div></Td>
        <Td><Badge label={m.access} /></Td><Td><Badge label={m.plan} dot={false} /></Td><Td>{m.devices}</Td><Td>{m.repairs}</Td><Td className="text-muted">{m.lastSeen}</Td></Tr>)}</tbody>
      {rows.length === 0 && <tbody><tr><td colSpan={6}><Empty title="No members found" hint="Try a different search or filter." /></td></tr></tbody>}
    </TableCard>}
    <Drawer open={!!sel} onClose={() => setSel(null)} title="Member details">
      {sel && <div className="space-y-6">
        <div className="flex items-center gap-4"><Avatar name={sel.name} size={56} /><div><p className="text-lg font-semibold">{sel.name}</p><p className="text-sm text-muted">{sel.email}</p></div></div>
        <div className="grid grid-cols-2 gap-3">{[["Access", <Badge key="a" label={sel.access} />], ["Plan", sel.plan], ["Devices", sel.devices], ["Repairs", sel.repairs], ["Joined", sel.joined], ["Last seen", sel.lastSeen]].map(([k, v]) =>
          <div key={String(k)} className="rounded-xl border border-line bg-raised p-3"><p className="text-xs text-muted">{k}</p><div className="mt-1 text-sm font-medium">{v}</div></div>)}</div>
        <div className="flex flex-wrap gap-2">
          {sel.access === "Suspended" || sel.access === "Pending" ? <Btn variant="primary" onClick={() => setAccess(sel, "Active")}><CheckCheck size={15} />{sel.access === "Pending" ? "Approve access" : "Restore access"}</Btn> : <Btn variant="danger" onClick={() => setAccess(sel, "Suspended")}><Ban size={15} />Suspend access</Btn>}
          <Btn onClick={() => toast(`Email draft opened for ${sel.name}`, "info")}><Mail size={15} />Email member</Btn></div>
      </div>}
    </Drawer>
  </>;
}
