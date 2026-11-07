"use client";
import { Reorder } from "framer-motion";
import { GripVertical, MoreHorizontal, Pencil, Plus, Power, Rocket, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Btn, Chips, Drawer, Dropdown, Empty, Field, inputCls, MenuItem, Modal, PageHeader, SearchInput, TableCard, TableSkeleton, Td, Th, Tr, useLoading, useToast } from "@/components/ui";
import { RecipeStep, Tool, ToolStatus, tools as seed } from "@/lib/mock-data";

const filters = ["All", "Published", "Draft", "Disabled"] as const;
const blank = (): Tool => ({ id: "new", name: "", category: "System", status: "Draft", version: "0.1.0", updated: "Just now", runs: 0, successRate: 0, description: "", steps: [{ id: "n1", title: "", command: "" }] });

export default function ToolsPage() {
  const loading = useLoading(); const toast = useToast();
  const [items, setItems] = useState<Tool[]>(seed);
  const [q, setQ] = useState(""); const [f, setF] = useState<(typeof filters)[number]>("All");
  const [edit, setEdit] = useState<Tool | null>(null);
  const [confirm, setConfirm] = useState<{ tool: Tool; action: "publish" | "disable" } | null>(null);
  const rows = useMemo(() => items.filter((t) => (f === "All" || t.status === f) && t.name.toLowerCase().includes(q.toLowerCase())), [items, q, f]);

  const setStatus = (id: string, status: ToolStatus) => setItems((s) => s.map((t) => (t.id === id ? { ...t, status, updated: "Just now" } : t)));
  const doConfirm = () => { if (!confirm) return; const p = confirm.action === "publish"; setStatus(confirm.tool.id, p ? "Published" : "Disabled"); toast(p ? `${confirm.tool.name} published` : `${confirm.tool.name} disabled`); setConfirm(null); };
  const save = () => {
    if (!edit || !edit.name.trim()) { toast("Add a tool name first", "err"); return; }
    setItems((s) => edit.id === "new" ? [{ ...edit, id: "t" + Date.now() }, ...s] : s.map((t) => (t.id === edit.id ? { ...edit, updated: "Just now" } : t)));
    toast(edit.id === "new" ? "Tool created as draft" : "Changes saved"); setEdit(null);
  };
  const upStep = (id: string, patch: Partial<RecipeStep>) => edit && setEdit({ ...edit, steps: edit.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  return <>
    <PageHeader title="Repair Tools" sub="Create, edit and publish the tools your members run.">
      <Btn variant="primary" onClick={() => setEdit(blank())}><Plus size={16} />Add tool</Btn>
    </PageHeader>
    <div className="mb-4 flex flex-wrap items-center gap-3"><SearchInput value={q} onChange={setQ} placeholder="Search tools" /><Chips options={filters} value={f} onChange={setF} /></div>
    {loading ? <TableSkeleton /> : <TableCard>
      <thead><tr><Th>Tool</Th><Th>Status</Th><Th>Version</Th><Th>Runs</Th><Th>Success</Th><Th>Updated</Th><Th /></tr></thead>
      <tbody>{rows.map((t) => <Tr key={t.id} onClick={() => setEdit(t)}>
        <Td><p className="font-medium">{t.name}</p><p className="text-xs text-muted">{t.category}</p></Td>
        <Td><Badge label={t.status} /></Td><Td className="text-muted">{t.version}</Td><Td>{t.runs.toLocaleString()}</Td>
        <Td>{t.runs ? `${t.successRate}%` : "—"}</Td><Td className="text-muted">{t.updated}</Td>
        <Td><div onClick={(e) => e.stopPropagation()}><Dropdown label={`Actions for ${t.name}`} trigger={<span className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-[#2a2d33] hover:text-ink"><MoreHorizontal size={18} /></span>}>
          {(close) => <>
            <MenuItem icon={<Pencil size={15} />} onClick={() => { setEdit(t); close(); }}>Edit tool</MenuItem>
            {t.status !== "Published" && <MenuItem icon={<Rocket size={15} />} onClick={() => { setConfirm({ tool: t, action: "publish" }); close(); }}>Publish</MenuItem>}
            {t.status === "Published" && <MenuItem icon={<Power size={15} />} danger onClick={() => { setConfirm({ tool: t, action: "disable" }); close(); }}>Disable</MenuItem>}
          </>}</Dropdown></div></Td></Tr>)}</tbody>
      {rows.length === 0 && <tbody><tr><td colSpan={7}><Empty title="No tools found" hint="Try a different search or filter, or add a new tool." /></td></tr></tbody>}
    </TableCard>}

    <Drawer open={!!edit} onClose={() => setEdit(null)} title={edit?.id === "new" ? "Add tool" : "Edit tool"} width="max-w-xl">
      {edit && <div className="space-y-5">
        <Field label="Name"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Bootloop Fix" className={inputCls} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Category"><select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} className={inputCls}>{["System", "Radio", "Security"].map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Version"><input value={edit.version} onChange={(e) => setEdit({ ...edit, version: e.target.value })} className={inputCls} /></Field></div>
        <Field label="Description"><textarea value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} rows={3} placeholder="What does this tool fix?" className={inputCls + " h-auto py-2.5"} /></Field>
        <div>
          <div className="mb-2 flex items-center justify-between"><span className="text-sm text-muted">Recipe steps</span>
            <button onClick={() => setEdit({ ...edit, steps: [...edit.steps, { id: "s" + Date.now(), title: "", command: "" }] })} className="inline-flex items-center gap-1 text-sm text-accent hover:underline"><Plus size={14} />Add step</button></div>
          <Reorder.Group axis="y" values={edit.steps} onReorder={(steps) => setEdit({ ...edit, steps })} className="space-y-2">
            {edit.steps.map((s, i) => <Reorder.Item key={s.id} value={s} className="flex items-start gap-2 rounded-xl border border-line bg-raised p-3">
              <GripVertical size={16} className="mt-2.5 shrink-0 cursor-grab text-muted" />
              <span className="mt-2 w-5 shrink-0 text-sm text-muted">{i + 1}</span>
              <div className="min-w-0 flex-1 space-y-2">
                <input value={s.title} onChange={(e) => upStep(s.id, { title: e.target.value })} placeholder="Step title" className={inputCls + " h-9 bg-panel"} />
                <input value={s.command} onChange={(e) => upStep(s.id, { command: e.target.value })} placeholder="Command" className={inputCls + " h-9 bg-panel font-mono text-xs"} /></div>
              <button onClick={() => setEdit({ ...edit, steps: edit.steps.filter((x) => x.id !== s.id) })} aria-label="Remove step" className="mt-1.5 rounded p-1.5 text-muted hover:text-danger"><Trash2 size={15} /></button>
            </Reorder.Item>)}</Reorder.Group>
          <p className="mt-2 text-xs text-muted">Drag the handle to reorder steps.</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-line pt-5"><Btn variant="ghost" onClick={() => setEdit(null)}>Cancel</Btn><Btn variant="primary" onClick={save}>Save changes</Btn></div>
      </div>}
    </Drawer>

    <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.action === "publish" ? `Publish ${confirm?.tool.name}?` : `Disable ${confirm?.tool.name}?`}
      footer={<><Btn variant="ghost" onClick={() => setConfirm(null)}>Cancel</Btn>{confirm?.action === "publish" ? <Btn variant="primary" onClick={doConfirm}>Publish</Btn> : <Btn variant="danger" onClick={doConfirm}>Disable</Btn>}</>}>
      {confirm?.action === "publish" ? "Members will be able to run this tool right away." : "Members will no longer be able to run this tool. You can publish it again later."}
    </Modal>
  </>;
}
