"use client";
import { motion } from "framer-motion";
import { useState } from "react";
import { Avatar, Btn, Card, cn, ease, Field, inputCls, PageHeader, Toggle, useToast } from "@/components/ui";

const tabs = ["Profile", "Account", "Security", "Preferences"] as const;
function Row({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4 py-4"><div><p className="text-sm font-medium">{title}</p><p className="text-sm text-muted">{hint}</p></div>{children}</div>;
}
export default function SettingsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Profile");
  const [p, setP] = useState({ twoStep: true, alerts: true, digest: false, compact: false, motion: true });
  const [name, setName] = useState("Mahi Owner");
  const save = () => toast("Settings saved");
  return <>
    <PageHeader title="Settings" sub="Manage your profile, security and preferences." />
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-line">{tabs.map((t) => <button key={t} onClick={() => setTab(t)} className={cn("relative whitespace-nowrap px-4 py-2.5 text-sm transition-colors", tab === t ? "text-ink" : "text-muted hover:text-ink")}>
      {t}{tab === t && <motion.span layoutId="settings-tab" transition={{ duration: 0.25, ease }} className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-accent" />}</button>)}</div>
    <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease }}>
      <Card className="max-w-2xl p-6">
        {tab === "Profile" && <div className="space-y-5">
          <div className="flex items-center gap-4"><Avatar name={name} size={64} /><div className="flex gap-2"><Btn onClick={() => toast("Photo upload is not connected in this preview", "info")}>Change photo</Btn><Btn variant="ghost" onClick={() => toast("Photo removed")}>Remove</Btn></div></div>
          <Field label="Display name"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>
          <Field label="Role"><input value="Owner" disabled className={inputCls + " opacity-60"} /></Field>
          <Btn variant="primary" onClick={save}>Save changes</Btn></div>}
        {tab === "Account" && <div className="space-y-5">
          <Field label="Email"><input defaultValue="owner@mahirepair.example" type="email" className={inputCls} /></Field>
          <Field label="Time zone"><select className={inputCls} defaultValue="UTC"><option>UTC</option><option>Asia/Kolkata</option><option>Europe/Rome</option><option>America/New_York</option></select></Field>
          <Btn variant="primary" onClick={save}>Save changes</Btn></div>}
        {tab === "Security" && <div className="divide-y divide-line">
          <Row title="Two-step verification" hint="Ask for a code when you sign in."><Toggle label="Two-step verification" on={p.twoStep} onChange={(v) => { setP({ ...p, twoStep: v }); toast(v ? "Two-step verification on" : "Two-step verification off", v ? "ok" : "info"); }} /></Row>
          <Row title="Password" hint="Last changed 3 months ago."><Btn onClick={() => toast("Password change is not connected in this preview", "info")}>Change password</Btn></Row>
          <Row title="Active sessions" hint="You are signed in on 2 browsers."><Btn variant="danger" onClick={() => toast("Other sessions signed out")}>Sign out others</Btn></Row></div>}
        {tab === "Preferences" && <div className="divide-y divide-line">
          <Row title="Failure alerts" hint="Notify me when a tool fails repeatedly."><Toggle label="Failure alerts" on={p.alerts} onChange={(v) => setP({ ...p, alerts: v })} /></Row>
          <Row title="Weekly summary" hint="Email a summary every Monday."><Toggle label="Weekly summary" on={p.digest} onChange={(v) => setP({ ...p, digest: v })} /></Row>
          <Row title="Compact tables" hint="Show more rows on each screen."><Toggle label="Compact tables" on={p.compact} onChange={(v) => setP({ ...p, compact: v })} /></Row>
          <Row title="Interface motion" hint="Turn animations on or off."><Toggle label="Interface motion" on={p.motion} onChange={(v) => setP({ ...p, motion: v })} /></Row></div>}
      </Card>
    </motion.div>
  </>;
}
