import { ReactNode } from 'react';
import Link from 'next/link';
import { Sidebar, navItems } from '@/components/sidebar';
import { LogOut, ShieldCheck } from 'lucide-react';
import { signOut } from '@/app/actions';
export function ConsoleShell({ children, active, title, subtitle }: { children: ReactNode; active?: string; title: string; subtitle?: string }) {
 return <div className="min-h-screen flex bg-[#090a0d]"><Sidebar active={active}/><div className="min-w-0 flex-1">
  <header className="h-[76px] border-b border-[#252830] px-5 md:px-8 flex items-center justify-between bg-[#0c0e12]/90"><div><h1 className="text-base font-semibold">{title}</h1><p className="text-xs muted mt-1">{subtitle ?? 'Private Android repair operations'}</p></div><div className="flex items-center gap-3"><span className="hidden sm:flex items-center gap-1.5 text-[11px] text-emerald-300"><ShieldCheck size={13}/> Owner verified</span><form action={signOut}><button className="btn btn-secondary"><LogOut size={15}/><span className="hidden sm:inline">Sign out</span></button></form></div></header>
  <nav aria-label="Mobile navigation" className="lg:hidden flex gap-1 overflow-x-auto border-b border-[#252830] px-3 py-2 bg-[#0d0f13]">{navItems.map(([label,href,Icon])=><Link key={href} href={href} aria-current={active===href?'page':undefined} className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] ${active===href?'bg-[#24272e] text-white':'text-[#a7adb8]'}`}><Icon size={14}/>{label}</Link>)}</nav>
  <main className="px-4 py-5 sm:px-5 md:px-8 md:py-8 max-w-[1500px] mx-auto">{children}</main>
 </div></div>;
}
