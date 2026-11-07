"use client";
import { ShieldOff } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Btn, Chips, Drawer, Empty, Modal, PageHeader, SearchInput, TableCard, TableSkeleton, Td, Th, Tr, useLoading, useToast } from "@/components/ui";
import { Device, devices as seed } from "@/lib/mock-data";

const filters = ["All", "Online", "Offline", "Revoked"] as const;
export default function DevicesPage() {
  const loading = useLoading(); const toast = useToast();
  const [items, setItems] = useState<Device[]>(seed);
  const [q, setQ] = useState(""); const [f, setF] = useState<(typeof filters)[number]>("All");
  const [sel, setSel] = useState<Device | null>(null); const [revoke, setRevoke] = useState<Device | null>(null);
  const rows = useMemo(() => items.filter((d) => (f === "All" || d.status === f) && (d.name + d.owner + d.model).toLowerCase().includes(q.toLowerCase())), [items, q, f]);
  const doRevoke = () => { if (!revoke) return; setItems((s) => s.map((d) => (d.id === revoke.id ? { ...d, status: "Revoked" } : d))); setSel((s) => (s && s.id === revoke.id ? { ...s, status: "Revoked" } : s)); toast(`${revoke.name} revoked`); setRevoke(null); };
  return <>
    <PageHeader title="Devices" sub="Every computer registered to a member account." />
    <div className="mb-4 flex flex-wrap items-center gap-3"><SearchInput value={q} onChange={setQ} placeholder="Search devices" /><Chips options={filters} value={f} onChange={setF} /></div>
    {loading ? <TableSkeleton /> : <TableCard>
      <thead><tr><Th>Device</Th><Th>Owner</Th><Th>Status</Th><Th>System</Th><Th>Last seen</Th></tr></thead>
      <tbody>{rows.map((d) => <Tr key={d.id} onClick={() => setSel(d)}>
        <Td><p className="font-medium">{d.name}</p><p className="text-xs text-muted">{d.model}</p></Td><Td>{d.owner}</Td>
        <Td><span className="inline-flex items-center gap-2">{d.status === "Online" && <span className="relative flex h-2 w-2"><span className="absolute h-full w-full animate-ping2 rounded-full bg-accent" /><span className="h-2 w-2 rounded-full bg-accent" /></span>}<Badge label={d.status} dot={d.status !== "Online"} /></span></Td>
        <Td className="text-muted">{d.os}</Td><Td className="text-muted">{d.lastSeen}</Td></Tr>)}</tbody>
      {rows.length === 0 && <tbody><tr><td colSpan={5}><Empty title="No devices found" hint="Try a different search or filter." /></td></tr></tbody>}
    </TableCard>}
    <Drawer open={!!sel} onClose={() => setSel(null)} title="Device details">
      {sel && <div className="space-y-6">
        <div><p className="text-lg font-semibold">{sel.name}</p><p className="text-sm text-muted">{sel.model}</p></div>
        <div className="grid grid-cols-2 gap-3">{[["Status", <Badge key="s" label={sel.status} />], ["Owner", sel.owner], ["System", sel.os], ["Registered", sel.registered], ["Last seen", sel.lastSeen]].map(([k, v]) =>
          <div key={String(k)} className="rounded-xl border border-line bg-raised p-3"><p className="text-xs text-muted">{k}</p><div className="mt-1 text-sm font-medium">{v}</div></div>)}</div>
        {sel.status !== "Revoked" && <Btn variant="danger" onClick={() => setRevoke(sel)}><ShieldOff size={15} />Revoke device</Btn>}
      </div>}
    </Drawer>
    <Modal open={!!revoke} onClose={() => setRevoke(null)} title={`Revoke ${revoke?.name}?`} footer={<><Btn variant="ghost" onClick={() => setRevoke(null)}>Cancel</Btn><Btn variant="danger" onClick={doRevoke}>Revoke</Btn></>}>
      This device will lose access and its owner will need to register it again.
    </Modal>
  </>;
}
