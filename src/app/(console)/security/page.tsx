import { FileKey2, KeyRound, LockKeyhole, ShieldCheck, type LucideIcon } from 'lucide-react';
import { ConsoleShell } from '@/components/console-shell';

const securityCards: Array<{ Icon: LucideIcon; title: string; description: string }> = [
  {
    Icon: ShieldCheck,
    title: 'Owner-only console',
    description: 'The server checks the Supabase user and active owner profile on every protected page and Edge Function.',
  },
  {
    Icon: KeyRound,
    title: 'Signing private key',
    description: 'RECIPE_SIGNING_PRIVATE_KEY_PEM exists only in Supabase Edge Function secrets. Never add it to Vercel or NEXT_PUBLIC environment variables.',
  },
  {
    Icon: LockKeyhole,
    title: 'Service role key',
    description: 'The service role key is restricted to Edge Function secrets. Browser clients use only the publishable key and RLS.',
  },
  {
    Icon: FileKey2,
    title: 'Audit and immutable releases',
    description: 'Owner mutations create audit events. Published versions cannot be updated or deleted through normal database roles.',
  },
];

export default function SecurityPage() {
  return (
    <ConsoleShell active="/security" title="Security & Settings" subtitle="Trust boundaries and operational controls">
      <div className="grid gap-4 md:grid-cols-2">
        {securityCards.map(({ Icon, title, description }) => (
          <div key={title} className="panel p-5">
            <Icon className="text-red-400" />
            <h2 className="mt-4 text-sm font-semibold">{title}</h2>
            <p className="muted mt-2 text-xs leading-5">{description}</p>
          </div>
        ))}
      </div>
      <div className="panel mt-4 p-5">
        <h2 className="text-sm font-semibold">Required production controls</h2>
        <ul className="muted mt-3 list-disc space-y-2 pl-5 text-xs">
          <li>Enable MFA for the owner Supabase account.</li>
          <li>Restrict the admin origin and configure SMTP rate limits.</li>
          <li>Rotate any key that has ever been committed or shared.</li>
          <li>Back up signing public keys and maintain a key ID/rotation plan in the Android app.</li>
          <li>Set Edge Function rate limits and monitor audit log anomalies.</li>
        </ul>
      </div>
    </ConsoleShell>
  );
}
