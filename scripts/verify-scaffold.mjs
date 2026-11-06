import { readFile, access, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const required = [
  'package.json', '.env.example', 'README.md', 'src/app/layout.tsx', 'src/app/login/page.tsx',
  'src/app/(console)/page.tsx', 'src/app/(console)/tools/page.tsx', 'src/app/(console)/members/page.tsx',
  'src/app/(console)/logs/page.tsx', 'src/app/(console)/analytics/page.tsx',
  'src/components/recipe-composer.tsx', 'src/components/test-lab-client.tsx',
  'src/lib/auth/require-owner.ts', 'src/lib/recipe/catalog.ts',
  'supabase/migrations/20261105171141_202611050001_initial_schema.sql',
  'supabase/functions/_shared/http.ts', 'supabase/functions/_shared/recipe.ts', 'supabase/functions/_shared/sign.ts',
  'supabase/functions/admin-publish-tool/index.ts', 'supabase/functions/admin-manage-tool-state/index.ts',
  'supabase/functions/admin-assign-tool/index.ts', 'supabase/functions/register-device/index.ts',
  'supabase/functions/get-my-repair-tools/index.ts', 'supabase/functions/get-signed-repair-tool/index.ts',
  'supabase/functions/submit-repair-run/index.ts', 'supabase/functions/get-admin-analytics/index.ts',
  'docs/ANDROID_API_CONTRACT.md', 'docs/DEPLOYMENT.md', 'docs/SECURITY_MODEL.md',
  'schemas/repair-recipe-v1.schema.json', 'android-contract/RecipeSignatureVerifier.kt',
];
let failures = 0;
function pass(message) { console.log(`PASS ${message}`); }
function fail(message) { console.error(`FAIL ${message}`); failures++; }

for (const file of required) {
  try { await access(resolve(file)); pass(`exists: ${file}`); }
  catch { fail(`missing: ${file}`); }
}

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
if (packageJson.scripts?.build && packageJson.dependencies?.next && packageJson.dependencies?.['@supabase/ssr']) pass('package and runtime scripts are configured');
else fail('package scripts/runtime dependencies missing');

const jsonSchema = JSON.parse(await readFile('schemas/repair-recipe-v1.schema.json', 'utf8'));
if (jsonSchema.$schema?.includes('2020-12') && jsonSchema.properties?.steps?.items?.allOf?.length === 13) pass('v1 JSON Schema parses and contains per-action parameter contracts');
else fail('v1 JSON Schema missing action-specific constraints');

const catalog = await readFile('src/lib/recipe/catalog.ts', 'utf8');
const denoRecipe = await readFile('supabase/functions/_shared/recipe.ts', 'utf8');
const kotlin = await readFile('android-contract/RecipeSignatureVerifier.kt', 'utf8');
const actionBlock = catalog.match(/export const ACTIONS = \{([\s\S]*?)\} as const/);
const actionIds = actionBlock ? [...actionBlock[1].matchAll(/^\s{2}([A-Z_]+):/gm)].map((m) => m[1]) : [];
const schemaActionIds = jsonSchema.properties.steps.items.properties.action.enum;
if (actionIds.length === 13 && actionIds.every((id) => schemaActionIds.includes(id) && denoRecipe.includes(`${id}:`) && kotlin.includes(`"${id}"`))) pass('13 action IDs align across frontend, Edge validation, JSON Schema and Kotlin verifier');
else fail('action catalog mismatch across frontend, Edge, JSON Schema or Kotlin');

const migration = await readFile('supabase/migrations/20261105171141_202611050001_initial_schema.sql', 'utf8');
const tableNames = ['profiles','devices','repair_tools','repair_tool_versions','repair_tool_access','device_tool_syncs','repair_runs','admin_audit_logs','recipe_test_history','rate_limit_buckets'];
for (const table of tableNames) {
  const re = new RegExp(`alter table public\\.${table} enable row level security`, 'i');
  if (re.test(migration)) pass(`RLS enabled: ${table}`); else fail(`RLS missing: ${table}`);
}
const policies = [...migration.matchAll(/create policy[\s\S]*?;/gi)].map((m) => m[0]);
if (policies.length > 0 && policies.every((policy) => /\sfor\sselect\s/i.test(policy))) pass('all authenticated RLS policies are read-only');
else fail('unexpected RLS write policy found');
for (const token of ['revoke insert, update, delete', 'commit_repair_tool_version', 'replace_repair_tool_access', 'get_admin_analytics', 'consume_rate_limit', 'repair_tool_versions_immutable', 'admin_audit_logs_append_only']) {
  if (migration.toLowerCase().includes(token.toLowerCase())) pass(`database hardening present: ${token}`); else fail(`database hardening missing: ${token}`);
}

const publish = await readFile('supabase/functions/admin-publish-tool/index.ts', 'utf8');
for (const token of ['RecipeSchema.safeParse', 'canonicalJson', 'signCanonicalPayload', 'commit_repair_tool_version']) {
  if (publish.includes(token)) pass(`publishing path includes ${token}`); else fail(`publishing path missing ${token}`);
}
const catalogDelivery = await readFile('supabase/functions/get-my-repair-tools/index.ts', 'utf8');
if (catalogDelivery.includes('publishedIds.has(id)')) pass('catalog delivery excludes unpublished assigned tools'); else fail('catalog delivery may expose an unpublished assigned tool');
if ((await readFile('supabase/functions/_shared/http.ts', 'utf8')).includes("'Cache-Control': 'no-store, max-age=0'")) pass('API responses are explicitly non-cacheable'); else fail('API responses lack no-store cache controls');
const signer = await readFile('supabase/functions/_shared/sign.ts', 'utf8');
if (signer.includes('RECIPE_SIGNING_PRIVATE_KEY_PEM') && !signer.includes('NEXT_PUBLIC_')) pass('signing key is loaded from Edge Function secret only');
else fail('private signing key configuration is unsafe');

const srcFiles = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) await collect(full);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) srcFiles.push(full);
  }
}
await collect('src');
let secretAccessFound = false;
for (const file of srcFiles) {
  const content = await readFile(file, 'utf8');
  const secretAccess = /(?:process\.env|Deno\.env\.get|import\.meta\.env)\s*(?:\(\s*)?['\"](?:SUPABASE_SERVICE_ROLE_KEY|RECIPE_SIGNING_PRIVATE_KEY_PEM)['\"]/;
  if (secretAccess.test(content)) { fail(`server secret environment access found in browser app source: ${file}`); secretAccessFound = true; }
}
if (!secretAccessFound) pass('no service-role or RSA private-key environment access in browser app source');

const edgeDirs = (await readdir('supabase/functions', { withFileTypes: true })).filter((entry) => entry.isDirectory() && !entry.name.startsWith('_')).map((entry) => entry.name);
if (edgeDirs.length >= 15 && edgeDirs.every((name) => name === 'admin-manage-tool-state' || !name.includes(' '))) pass(`${edgeDirs.length} Edge Function directories found`);
else fail('Edge Function directory set is incomplete');

const envExample = await readFile('.env.example', 'utf8');
if (!/NEXT_PUBLIC_SUPABASE_URL=/.test(envExample) || !/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=/.test(envExample)) fail('browser environment template is missing Supabase public configuration');
if (/^NEXT_PUBLIC_.*(SERVICE_ROLE|PRIVATE_KEY)/m.test(envExample)) fail('secret appears in NEXT_PUBLIC template');
else pass('environment template does not expose backend secrets');

if (failures) {
  console.error(`\n${failures} scaffold audit check(s) failed.`);
  process.exit(1);
}
console.log('\nAll static scaffold/security-integrity checks passed. This does not replace compiler, database, Edge Function or Android device testing.');
