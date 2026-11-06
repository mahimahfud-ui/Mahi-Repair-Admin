import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
export const metadata: Metadata = {
  title: 'Mahi Repair Cloud — Owner Console',
  description: 'Private owner control center for Android repair recipes.',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
