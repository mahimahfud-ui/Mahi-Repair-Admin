# Render deployment — Mahi Repair Admin Panel

## Current repository configuration: preview only

The checked-in render.yaml defines a Render Node.js Web Service for PR preview/staging. It does not define the final production Admin Panel service.

- Service: mahi-repair-admin-preview
- URL: https://mahi-repair-admin-preview.onrender.com
- Dashboard: https://dashboard.render.com/web/srv-dbmdt10u01pc73a97osg
- Repository: mahimahfud-ui/Mahi-Repair
- Branch: security-hardening/run-repair
- Plan: Free preview
- Region: Singapore
- Runtime: Node.js 22.23.4
- Build: cd admin-panel && npm ci && npm run build
- Start: cd admin-panel && npm start

The repository .node-version, admin-panel/.nvmrc, package engine and Render NODE_VERSION are pinned to Node 22.23.4. Production should be a separate service on the intended production hostname. Do not silently repurpose the PR preview as production.

## Current deployment verification boundary

Earlier repository smoke-test notes record that the preview /login page loaded and unauthenticated console routes required authentication. During Phase 4, a fresh public HTTPS probe could not be made from the execution environment because external DNS resolution was unavailable. Therefore this document does not claim that the preview is reachable now, that owner login currently works, or that a production Render service is deployed.

Current-head CI does verify the Admin Panel npm install/audit, scaffold checks, TypeScript, ESLint, Vitest and Next.js production build:
[Admin Panel CI run 42167251933](https://github.com/mahimahfud-ui/Mahi-Repair/actions/runs/42167251933).

A successful Next.js build is not proof of a successful Render deployment.

## Environment variables

Only browser-safe values belong in Render:

| Variable | Value |
|---|---|
| NODE_VERSION | 22.23.4 |
| NEXT_PUBLIC_SUPABASE_URL | https://shwqsljicmhflnvjqjah.supabase.co |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Current project's publishable key |
| NEXT_PUBLIC_APP_URL | Exact deployed HTTPS origin, no trailing slash |

Never put a service-role key, database password or recipe-signing private key in Render or in a NEXT_PUBLIC_* value.

## Supabase Auth and Edge Function origin

- Set Supabase Auth Site URL to the final deployed Admin Panel origin.
- Add the exact <origin>/auth/callback URL to Supabase Auth redirect URLs.
- Set the custom Edge Function secret ADMIN_ORIGIN to that exact origin, without a path or trailing slash.
- The protected production workflow sets Supabase's ADMIN_ORIGIN custom secret from the protected GitHub supabase-production environment variable.

Supabase automatically injects SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY into Edge Functions. The SUPABASE_ prefix is reserved; do not create custom secrets with that prefix.

## Signing key

Create a matching RSA-3072 key pair on a trusted machine. Add the PKCS#8 private key directly in Supabase Dashboard → Edge Function Secrets as RECIPE_SIGNING_PRIVATE_KEY_PEM. Do not store it in Render, GitHub, Android, source control or browser variables. Embed only the matching X.509 public PEM in Android release build configuration. The checked-in Android public-key value remains a placeholder until the real pair is configured.

## Private Realtime and Android catalogue delivery

Android subscribes only while foregrounded to a private topic scoped to its authenticated member and registered device. Events contain only an opaque event ID. On an event the app calls get-my-repair-tools, verifies each signed canonical payload, and updates Room. App launch, resume, reconnect and WorkManager sync recover missed events.

Before production:

1. Review and apply 20261106120000_private_realtime_catalog_broadcast.sql.
2. Disable Supabase Realtime Allow public access.
3. Verify realtime.messages RLS limits each authenticated session to its own active registered-device topic and rejects revoked devices.
4. Deploy all updated Edge Functions with JWT verification enabled.
5. Test publish, update, disable/unpublish, assignment removal, member suspension and device revocation.
6. Verify a revoked device cannot fetch or execute tools even if cached notifications or catalogue data remain on the device.

Realtime notification receipt never grants access or execution permission. A Render deployment does not deploy database migrations or Edge Functions.

## Production deployment procedure

1. Create a separate Render Node.js Web Service from the approved production branch/commit.
2. Use the same build/start commands and Node 22.23.4 runtime.
3. Configure only browser-safe Supabase publishable values plus the exact production origin.
4. Verify the Render deploy is healthy and the production /login route responds over HTTPS.
5. Set Supabase Auth Site URL/redirect allow list and ADMIN_ORIGIN to the exact production origin.
6. Verify owner authentication and owner-only authorization for all protected pages/actions.
7. Keep production signing keys and Supabase service-role/database credentials out of Render/browser/Android.
8. Record the Render service ID, URL, deployed commit, deploy event and smoke-test evidence in the release record.

Do not publish a production URL until the production service has actually been created and tested.
