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

Configure only the browser-safe project values in .env.local:

~~~env
NEXT_PUBLIC_SUPABASE_URL=https://shwqsljicmhflnvjqjah.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PROJECT_PUBLISHABLE_KEY
# Do not add the Owner Auth identifier here as a browser variable.
# Set ADMIN_OWNER_EMAIL separately in the server-only hosting environment.
~~~

The publishable key is designed for browser use and is not a privileged credential. Set `ADMIN_OWNER_EMAIL` separately as a server-only environment variable on Render; never prefix it with `NEXT_PUBLIC_`. The Owner PIN is the existing Auth account password and must not be stored in an environment file. Never add SUPABASE_SERVICE_ROLE_KEY, database passwords, access tokens or the recipe-signing private key to source control, browser bundles or Android resources.

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

The hosting provider must use Node.js 22.23.4, install from the root package-lock.json, run npm ci, build with npm run build, and start with npm run start. Configure its assigned port through the platform's standard PORT environment variable. The current Render Web Service is `mahi-repair-admin`, tracks branch `main`, and serves https://mahi-repair-admin.onrender.com. The Render service is configured outside this repository; CI does not deploy Supabase changes.

## 4. Supabase project and Owner PIN authentication — manual

The existing project reference is `shwqsljicmhflnvjqjah`. Confirm it is the intended project before using the CLI.

1. Install/use the Supabase CLI and authenticate interactively with `supabase login`.
2. Link this local checkout: `supabase link --project-ref shwqsljicmhflnvjqjah`.
3. Verify the intended Owner has an existing Supabase Auth account and an active `public.profiles` row with `role='owner'` and `status='active'`. New Auth users default to Member.
4. Set `ADMIN_OWNER_EMAIL` only in the Admin host's server-side environment. It is an internal identifier for the existing Owner account and is never shown in the browser.
5. Set the existing Owner Auth account password to a random 8–12 digit numeric PIN using Supabase Auth administration. Do not use a birthday, phone number, repeated digits or a predictable sequence. Do not paste the PIN into GitHub, source code or this chat.
6. Keep Supabase Auth password/token endpoint rate limits enabled. The server action submits the PIN through `signInWithPassword`, then checks the database profile. A failed, missing, suspended or Member profile is denied and the temporary Auth session is signed out.
7. Every protected console request still calls `requireOwner()`; every privileged Server Action calls the same server-side guard and invokes an allowlisted authenticated Edge Function.

The Owner login UI has no email field, Magic Link button, OTP request or email-sending cooldown. It uses the normal Supabase Auth password session for the existing Owner account; Owner authorization is never inferred from the PIN alone.

Member onboarding is separate: the Owner's `admin-invite-member` operation sends an invitation email, and Android Members use the existing six-digit Supabase Auth OTP flow. Both flows are delivered through the Supabase Send Email Auth Hook. The hook uses Resend as the primary provider and Brevo as the fallback; when the hook is enabled, Supabase's built-in SMTP delivery is not used. Verify the sender domain with SPF/DKIM (and DMARC policy) at both providers. The Owner PIN login does not send an Auth email and does not depend on this hook.

## 5. PostgreSQL migrations — manual, separately approved

The checked-in migrations are applied in timestamp order:

- 20261105171141_202611050001_initial_schema.sql
- 20261105171330_20261105180000_harden_rls_grants_and_indexes.sql
- 20261105171827_20261105183000_deny_browser_rate_limit_access.sql
- 20261106170418_private_realtime_catalog_broadcast.sql
- 20261106170438_backend_report_idempotency_and_atomic_catalog.sql
- 20261106170450_transactional_admin_mutations_audit.sql
- 20261106170509_atomic_member_catalog_and_device_registration.sql

Review the SQL and target project before applying anything. The production workflow in `.github/workflows/supabase-production.yml` is manual-only and requires an explicit `confirm_production=yes` input plus approval of the protected GitHub environment `supabase-production`. It uses two separate dispatches so a preview cannot auto-apply:
1. **Preview only:** dispatch from `main` with `apply_changes=false` (default) and `deploy_send_email_hook=false`. It links the exact commit, checks the signing-secret name, lists remote migration history and runs `supabase db push --dry-run --remote`. It performs no production mutation. Record the exact workflow source commit SHA and inspect the complete migration preview.
2. **Apply:** dispatch again from the same `main` commit with `apply_changes=true`, paste that exact preview SHA in `previewed_commit_sha`, and request the protected environment approval. If `main` changes between the two runs, the SHA comparison fails and a new preview is required. Only then does it set `ADMIN_ORIGIN`, apply migrations and deploy the 15 JWT-verified Member/Owner functions. Set `deploy_send_email_hook=true` only when the four hook/provider secrets are ready and the hook function has been reviewed.

For unattended runs, the workflow supplies `SUPABASE_DB_PASSWORD` as an environment variable. Supabase CLI v3 reads it during `supabase link`; do not pass the deprecated `link --password` flag. The same manual procedure remains available for operators who prefer the Supabase CLI:

~~~bash
supabase db push --dry-run
~~~

Inspect the pending migration list and confirm it targets the intended project. Only after a separate explicit production-change approval should an operator run:

~~~bash
supabase db push
~~~

Do not run this command as part of ordinary application CI. Do not assume that a migration present in Git has already been applied to Supabase.

The migrations enable RLS and remove browser write grants. Authenticated browser access is read-only; data-changing operations use the server-verified Edge Functions and service-role privileges. The rate-limit table is moved to the private schema and its RPC is not executable by browser roles. The report migration stores Android `run_id` directly as the existing `repair_runs.id` primary key and adds a SHA-256 `request_fingerprint`; a separate `run_id` column is not required. Atomic report/catalog/device RPCs revalidate member, device, assignment, publication, version and compatibility state under row locks.

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

## 7. Configure the Send Email Auth Hook and deploy Edge Functions — manual

There are 16 Edge Function directories in supabase/functions/:

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
send-auth-email
~~~

After the reviewed migrations and required secrets are in place, deploy the 15 member/Owner functions with JWT verification enabled:

~~~bash
for function in \
  admin-assign-tool admin-delete-draft-tool admin-disable-tool \
  admin-invite-member admin-manage-device admin-manage-member \
  admin-manage-tool-state admin-publish-tool admin-save-validation \
  admin-upsert-tool get-admin-analytics get-my-repair-tools \
  get-signed-repair-tool register-device submit-repair-run
do
  supabase functions deploy "$function" --project-ref shwqsljicmhflnvjqjah --yes
done
~~~

Keep JWT verification enabled (the Supabase CLI default) for all 15 member/Owner functions. The Send Email Auth Hook is the single exception: it is called by Supabase Auth and authenticates requests with Standard Webhooks HMAC signatures, so deploy it with JWT verification disabled:

~~~bash
supabase functions deploy send-auth-email --project-ref shwqsljicmhflnvjqjah --no-verify-jwt --yes
~~~

The checked-in `supabase/config.toml` also declares `[functions.send-auth-email]` with `verify_jwt = false`. Do not disable JWT verification on any other function. The send-auth-email handler must reject unsigned/invalid hook events before calling either provider. The remaining functions independently validate the Supabase user and active Owner/member role before privileged operations. The service-role client is created only inside those Edge Functions.

Before enabling the Auth Hook, validate provider delivery separately from the Auth flow. Deploy the function with the hook still disabled, then send a synthetic **signed Standard Webhooks** event directly to the function URL using a test recipient inbox you control. Confirm Resend delivers the message. In a non-production test deployment, force a simulated Resend failure and confirm the Brevo fallback delivers; do not invalidate the production Resend key to test fallback.

After the signed provider smoke test succeeds, open Supabase Dashboard → Authentication → Hooks → Send Email. Create or enable the HTTP hook pointing to:

`https://shwqsljicmhflnvjqjah.supabase.co/functions/v1/send-auth-email`

Generate the hook secret in that screen and keep it disabled. Save the complete `v1,whsec_...` value in both the GitHub `supabase-production` Environment secret and Supabase Edge Function Secret `SEND_EMAIL_HOOK_SECRET`; the values must match exactly. Confirm the project Email Provider is enabled. Then enable the Auth Hook and perform real end-to-end tests: an Owner invitation from the production Admin Console and an Android Member six-digit OTP. Both must land in the target inbox and successfully complete their authentication flow. When enabled, Supabase Auth routes auth emails through the hook instead of SMTP.

Protected deployment workflow: `.github/workflows/supabase-production.yml`. It is triggered only with `workflow_dispatch` from `main`, requires an explicit confirmation input, and uses the protected GitHub Environment `supabase-production`. The workflow verifies the existing `RECIPE_SIGNING_PRIVATE_KEY_PEM` secret is present in Supabase without exposing its value, syncs the canonical `ADMIN_ORIGIN`, previews migration changes, applies approved migrations and deploys the 15 Member/Owner Edge Functions with JWT verification enabled. The Send Email Auth Hook is an explicit opt-in input and is deployed separately with JWT verification disabled only for that HMAC-authenticated endpoint.

Before use, a repository administrator must create GitHub Settings → Environments → `supabase-production`, add at least one required reviewer, configure Environment secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD`, and define the Environment variable `ADMIN_ORIGIN=https://mahi-repair-admin.onrender.com`. Preview-only runs also pass through this protected environment and require the same credentials, but do not alter production. The existing `RECIPE_SIGNING_PRIVATE_KEY_PEM` must be provisioned directly in Supabase Edge Function Secrets, not copied into GitHub. For optional hook deployment, also configure GitHub Environment secrets `SEND_EMAIL_HOOK_SECRET`, `RESEND_API_KEY`, `BREVO_API_KEY`, and `AUTH_EMAIL_FROM`. The Auth Hook must remain disabled in Supabase Dashboard until provider inbox tests pass. A green CI run does not deploy anything; only an approved manual workflow dispatch mutates production.

## 8. Website hosting — manual

Deploy this repository as a Node.js 22.23.4 application with the repository root as the application root:

- Install command: npm ci
- Build command: npm run build
- Start command: npm run start

Set these browser-safe environment variables in Render → `mahi-repair-admin` → Environment:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `ADMIN_OWNER_EMAIL` — the existing Owner Auth identifier; server-only, never prefixed with `NEXT_PUBLIC_`

Do not configure service-role credentials, the database password or the signing private key in the website host. Set the Supabase Auth Site URL and Edge Function `ADMIN_ORIGIN` to `https://mahi-repair-admin.onrender.com` (no trailing slash for `ADMIN_ORIGIN`). Add the Admin callback URL to the Auth redirect allowlist. Configure the Send Email Auth Hook separately as described above. The Owner PIN login does not use an Auth callback URL. Configure Android's own Auth redirect/deep-link allowlist separately. The app deployment is automatic on updates to the configured branch; Supabase migrations, secrets and Edge Function deployments remain separate manual operations.

## 9. Private Realtime and device authorization checks

The Realtime migration grants authenticated clients access only to their own private member/device broadcast topic. Events contain an opaque event ID, not recipe content. A device must still call the Edge Functions to fetch authorized recipes; the server checks member status, device ownership/revocation, publication state and assignment on every request.

After the four Realtime/backend migrations and JWT-verified Edge Functions have been deployed, verify:

1. Supabase Realtime **Allow public access** is disabled.
2. `realtime.messages` RLS allows an active Owner only on `mahi-repair:admin`, and each active member only on that member's exact non-revoked device topic.
3. The Android client receives only opaque device events, then fetches the latest catalogue through `get-my-repair-tools`.
4. The Admin Console receives opaque `admin_data_changed` invalidations and re-renders its Owner-guarded server pages. If the websocket is interrupted, the UI falls back to a 15-second refresh until the private channel reconnects.
5. A revoked device cannot fetch a catalogue or signed recipe; a suspended member cannot register, fetch or submit.
6. Assignment changes, publish/unpublish, member status, device revocation and new repair reports produce invalidations after their database transaction commits.
7. An identical Android `run_id` retry is acknowledged as a duplicate; changed report content or a different identity reusing the UUID receives a conflict.
8. Android verifies RSA-SHA256 over the exact `signed_payload` UTF-8 bytes before parsing and executes only compiled native action IDs.

Realtime messages contain no row data, PII, recipe payloads or signatures. They are invalidation hints only and never authorize execution.

## 10. Release verification boundary

A successful GitHub Actions run proves only that the code in the commit passed the automated checks. It does not prove live Owner authentication, SMTP delivery, database migration state, RLS in the target project, signing-key correctness, deployed Edge Function versions, public website health or physical Android-device behavior.

Record the deployed commit SHA, project reference, hosting service/URL, manual migration history, Edge Function deployment result, signing-key verification, Send Email Hook status, provider fallback test, and Owner/member/device acceptance results in the release record. No production deployment is implied by this guide or by CI.
