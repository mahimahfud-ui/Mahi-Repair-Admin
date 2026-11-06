# Mahi Repair Admin — build and manual deployment

## 1. Actual repository structure

The Next.js application lives at the repository root. Run every command in this guide from the directory containing package.json.

~~~text
.
├── package.json
├── package-lock.json
├── .nvmrc
├── src/
├── supabase/
│   ├── config.toml
│   ├── functions/
│   └── migrations/
├── schemas/
├── tests/
├── contract-tests/
├── android-contract/
└── docs/
~~~

There is no admin-panel/ directory, no checked-in Dockerfile, and no checked-in Render/Cloud Run deployment configuration in this repository. Do not prefix commands with cd admin-panel.

## 2. Runtime and local setup

Use Node.js 22.23.4, pinned in .nvmrc and the package.json engines field.

~~~bash
node --version
npm ci
cp .env.example .env.local
npm run dev
~~~

Windows PowerShell copy command:

~~~powershell
Copy-Item .env.example .env.local
~~~

Configure only the browser-safe values in .env.local:

~~~env
NEXT_PUBLIC_SUPABASE_URL=https://shwqsljicmhflnvjqjah.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PROJECT_PUBLISHABLE_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3000
~~~

The publishable key is designed for browser use and is not a privileged credential. Never add SUPABASE_SERVICE_ROLE_KEY, database passwords, access tokens or the recipe-signing private key to .env.local, browser bundles, GitHub variables, Android resources or source control.

## 3. Verify the website build

Run from the repository root:

~~~bash
npm ci --no-audit --no-fund
npm run check:scaffold
npm run typecheck
npm run lint
npm run test
npm run build
npm run start
~~~

The hosting provider must use Node.js 22.23.4, install from the root package-lock.json, run npm ci, build with npm run build, and start with npm run start. Configure its assigned port through the platform's standard PORT environment variable. The current repository does not declare a production hosting provider or production website URL.

## 4. Supabase project and authentication configuration — manual

The existing project reference is shwqsljicmhflnvjqjah. Confirm that this is the intended project before using the CLI.

1. Install/use the Supabase CLI and authenticate interactively with supabase login.
2. Link this local checkout: supabase link --project-ref shwqsljicmhflnvjqjah.
3. In Supabase Dashboard → Authentication → URL Configuration, set the Site URL to the exact deployed Admin HTTPS origin.
4. Add the exact https://YOUR-ADMIN-HOST/auth/callback URL to the redirect allow list. Keep localhost callback entries only for local development.
5. Verify that the intended Owner already has an Auth account and an active public.profiles row with role = 'owner' and status = 'active'. New Auth users default to the member role. Bootstrap an Owner only through a separately authorized, reviewed administrative operation; never make public signup an Owner path.

The callback and every protected console request independently verify the authenticated user and active Owner profile. A member or suspended/revoked account must not enter the Owner console.

## 5. PostgreSQL migrations — manual, separately approved

The checked-in migrations are applied in timestamp order:

- 20261105171141_202611050001_initial_schema.sql
- 20261105171330_20261105180000_harden_rls_grants_and_indexes.sql
- 20261105171827_20261105183000_deny_browser_rate_limit_access.sql
- 20261106120000_private_realtime_catalog_broadcast.sql

Review the SQL and target project before applying anything. The following is a manual operator procedure, not an automated GitHub workflow:

~~~bash
supabase db push --dry-run
~~~

Inspect the pending migration list and confirm it targets the intended project. Only after a separate explicit production-change approval should an operator run:

~~~bash
supabase db push
~~~

Do not run this command as part of ordinary application CI. Do not assume that a migration present in Git has already been applied to Supabase.

The migrations enable RLS and remove browser write grants. Authenticated browser access is read-only; data-changing operations use the server-verified Edge Functions and service-role privileges. The rate-limit table is moved to the private schema and its RPC is not executable by browser roles.

## 6. Edge Function secrets and recipe-signing key — manual

Supabase automatically injects the reserved Edge Function values SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY. Do not create custom secrets with the reserved SUPABASE_ prefix and do not copy the service-role key out of Supabase.

Configure these custom secrets directly in Supabase Dashboard → Edge Function Secrets:

- ADMIN_ORIGIN: the exact canonical HTTPS origin of the deployed Admin website, for example https://admin.example.com. No path, query, credentials or trailing slash.
- RECIPE_SIGNING_PRIVATE_KEY_PEM: an RSA-3072 PKCS#8 private key in PEM format.

Generate the key pair on a trusted machine if one has not already been created:

~~~bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out recipe-signing-private.pem
openssl pkey -in recipe-signing-private.pem -pubout -out recipe-signing-public.pem
~~~

Paste the private key directly into Supabase Edge Function Secrets. Keep it out of GitHub, Render, browser variables and Android. Only the matching public key may be configured in the Android release build. The repository's placeholder public key is not a production key.

## 7. Deploy Edge Functions — manual

There are 15 Edge Function directories in supabase/functions/:

~~~text
admin-assign-tool
admin-delete-draft-tool
admin-disable-tool
admin-invite-member
admin-manage-device
admin-manage-member
admin-manage-tool-state
admin-publish-tool
admin-save-validation
admin-upsert-tool
get-admin-analytics
get-my-repair-tools
get-signed-repair-tool
register-device
submit-repair-run
~~~

After the reviewed migrations and required secrets are in place, an authorized operator can deploy them manually:

~~~bash
for function in \
  admin-assign-tool admin-delete-draft-tool admin-disable-tool \
  admin-invite-member admin-manage-device admin-manage-member \
  admin-manage-tool-state admin-publish-tool admin-save-validation \
  admin-upsert-tool get-admin-analytics get-my-repair-tools \
  get-signed-repair-tool register-device submit-repair-run
do
  supabase functions deploy "$function" --project-ref shwqsljicmhflnvjqjah
done
~~~

Keep JWT verification enabled (the Supabase CLI default); do not pass --no-verify-jwt. Every function independently validates the Supabase user and active Owner/member role before performing its operation. The service-role client is created only inside Edge Function code.

Automation status: this repository currently has no .github/workflows/supabase-functions-deploy.yml. No Supabase migration or Edge Function deployment is performed automatically by the checked-in GitHub Actions workflow. Deployment steps in this section are manual. Do not treat a green CI run as a Supabase deployment.

## 8. Website hosting — manual

Deploy this repository as a Node.js 22.23.4 application with the repository root as the application root:

- Install command: npm ci
- Build command: npm run build
- Start command: npm run start

Set these browser-safe environment variables in the hosting provider:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- NEXT_PUBLIC_APP_URL — exact HTTPS origin, without a trailing slash

Do not configure service-role credentials, the database password or the signing private key in the website host. After hosting is deployed, update Supabase Auth Site URL/redirect allow list and the Edge Function ADMIN_ORIGIN to the exact deployed origin. Test Owner login and denied member access before enabling real administration.

This repository currently contains no deployment workflow and no root Dockerfile/Render manifest. Hosting deployment must be configured and initiated manually in the chosen provider.

## 9. Private Realtime and device authorization checks

The Realtime migration grants authenticated clients access only to their own private member/device broadcast topic. Events contain an opaque event ID, not recipe content. A device must still call the Edge Functions to fetch authorized recipes; the server checks member status, device ownership/revocation, publication state and assignment on every request.

After a separately approved Realtime deployment, verify:

1. Supabase Realtime Allow public access is disabled.
2. realtime.messages RLS prevents a member from subscribing to another member's or device's topic.
3. A revoked device cannot fetch a catalogue or signed recipe.
4. A suspended member cannot register devices, fetch recipes or submit reports.
5. Assignment removal, disable/unpublish and device revocation block future server-side delivery.
6. Android verifies RSA-SHA256 over the exact signed_payload UTF-8 bytes before parsing and executes only compiled native action IDs.

Realtime notifications are hints only; they never authorize execution.

## 10. Release verification boundary

A successful GitHub Actions run proves only that the code in the commit passed the automated checks. It does not prove live Owner authentication, SMTP delivery, database migration state, RLS in the target project, signing-key correctness, deployed Edge Function versions, public website health or physical Android-device behavior.

Record the deployed commit SHA, project reference, hosting service/URL, manual migration history, Edge Function deployment result, key configuration verification and Owner/member/device acceptance results in the release record. No production deployment is implied by this guide or by CI.
