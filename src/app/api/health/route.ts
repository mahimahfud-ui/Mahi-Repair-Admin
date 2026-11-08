import { NextResponse } from 'next/server';
import { getApplicationReadiness } from '@/lib/health/readiness';

export const dynamic = 'force-dynamic';

export async function GET() {
  const readiness = getApplicationReadiness();

  return NextResponse.json(
    {
      status: readiness.ready ? 'healthy' : 'degraded',
      service: 'mahi-repair-admin',
      checks: readiness.checks,
      timestamp: new Date().toISOString(),
    },
    {
      status: readiness.ready ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
