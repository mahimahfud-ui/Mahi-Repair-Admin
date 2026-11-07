import type { ReactNode } from 'react';
import { requireOwner } from '@/lib/auth/require-owner';
import { RealtimeRefresh } from '@/components/realtime-refresh';

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  await requireOwner();
  return (
    <>
      <RealtimeRefresh />
      {children}
    </>
  );
}
