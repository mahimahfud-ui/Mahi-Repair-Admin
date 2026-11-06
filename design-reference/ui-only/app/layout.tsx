import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Mahi Repair Control Center", description: "Admin interface for Mahi Repair" };
export const viewport: Viewport = { themeColor: "#0e0f11" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className="font-sans antialiased">{children}</body></html>;
}
