import { ConsoleShell } from '@/components/console-shell';
import { TestLabClient } from '@/components/test-lab-client';
import { requireOwner } from '@/lib/auth/require-owner';
export const dynamic='force-dynamic';
export default async function TestLabPage(){const {supabase}=await requireOwner();const {data}=await supabase.from('recipe_test_history').select('id,recipe_hash,validation_status,simulated_step_count,tested_at,issues').order('tested_at',{ascending:false}).limit(12);return <ConsoleShell active="/test-lab" title="Test Lab" subtitle="Static validation and dry-run preview — not real-device testing"><TestLabClient history={data||[]}/></ConsoleShell>}
