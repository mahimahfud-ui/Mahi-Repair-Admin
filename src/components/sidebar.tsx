import Link from 'next/link';
import { BookOpen, Boxes, ChartNoAxesCombined, ClipboardList, Code2, FlaskConical, Gauge, Settings2, ShieldCheck, Users, UploadCloud, History, Cloud } from 'lucide-react';
export const navItems = [
  ['Overview','/',Gauge],['Repair Tool Library','/tools',Boxes],['Create New Tool','/tools/new',BookOpen],['Script Editor','/editor',Code2],['Test Lab','/test-lab',FlaskConical],['Members & Devices','/members',Users],['Publishing Center','/publishing',UploadCloud],['Version Control','/versions',History],['Repair Logs','/logs',ClipboardList],['Analytics','/analytics',ChartNoAxesCombined],['Security & Settings','/security',Settings2],
] as const;
export function Sidebar({ active='/' }: { active?: string }) {
 return <aside className="hidden lg:flex w-[252px] shrink-0 border-r border-[#252830] bg-[#0d0f13] flex-col min-h-screen">
  <div className="h-[76px] px-5 flex items-center gap-3 border-b border-[#252830]"><div className="rounded-xl bg-red-500/15 p-2 text-red-400"><Cloud size={19}/></div><div><div className="font-semibold text-[14px]">Mahi Repair Cloud</div><div className="text-[10px] tracking-[.16em] muted">OWNER CONSOLE</div></div></div>
  <div className="px-3 pt-5 pb-2 text-[10px] font-semibold tracking-[.18em] text-[#68707c]">WORKSPACE</div>
  <nav className="px-3 space-y-1">{navItems.map(([label,href,Icon])=><Link key={href} href={href} className={`nav-link ${active===href?'active':''}`}><Icon size={16}/><span>{label}</span></Link>)}</nav>
  <div className="mt-auto p-4"><div className="rounded-xl border border-[#292d36] bg-[#13161c] p-3"><div className="flex items-center gap-2 text-xs text-emerald-300"><ShieldCheck size={14}/> Owner session</div><p className="text-[11px] muted mt-2">Admin actions are audited. Recipe delivery is read-only for members.</p></div></div>
 </aside>;
}
