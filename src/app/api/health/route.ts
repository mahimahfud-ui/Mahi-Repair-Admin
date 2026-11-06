import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const ready = Boolean(
    process.env['NEXT_PUBLIC_SUPABASE_URL'] &&
    process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']
  );

  return NextResponse.json(
    { status: ready ? 'ok' : 'not_ready' },
    {
      status: ready ? 200 : 503,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    }
  );
}
