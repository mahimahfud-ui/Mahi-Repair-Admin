import type { ReactNode } from 'react';
import { requireOwner } from '@/lib/auth/require-owner';
export default async function ConsoleLayout({ children }: { children: ReactNode }) { await requireOwner(); return children; }
