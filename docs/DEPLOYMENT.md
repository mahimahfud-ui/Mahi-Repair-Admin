# Mahi Repair — setup and deployment

## Architecture

Mahi Repair consists of three separate components:

- `app/`: Native Android repair client. Its home screen exposes one **RUN REPAIR** action; the published-tool picker opens after it is tapped.
- `admin-panel/`: Private Next.js owner console for drafting, validating, signing and publishing recipes, and managing members/devices.
- Supabase: Auth, Postgres/RLS, private Realtime Broadcast and 15 Edge Functions.

The Android app does not contain Admin Panel navigation, owner tools or backend configuration screens.

## Node.js and local setup

The Admin Panel uses Node.js **22.23.4**. This exact version is pinned in `.node-version`, `admin-panel/.nvmrc`, `package.json` and Render's `NODE_VERSION`.

```bash
cd admin-panel
npm ci
cp .env.example .env.local
npm run dev
```

Only browser-safe values belong in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://shwqsljicmhflnvjqjah.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Supabase Edge Function environment and signing

Supabase automatically injects these reserved values into Edge Functions:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

The `SUPABASE_` prefix is reserved; do not create custom secrets with this prefix or copy the injected values to Render, Android or GitHub.

Custom Edge Function values:

- `RECIPE_SIGNING_PRIVATE_KEY_PEM`: PKCS#8 RSA-3072 private key. Add it directly in Supabase Dashboard → Edge Function Secrets.
- `ADMIN_ORIGIN`: exact HTTPS origin of the deployed Admin Panel. The guarded production workflow sets this from the GitHub environment variable with the same name.

Generate the matching key pair on a trusted local machine:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out recipe-signing-private.pem
openssl pkey -in recipe-signing-private.pem -pubout -out recipe-signing-public.pem
```

Paste the private key directly into Supabase Edge Function Secrets. Only the matching X.509 public PEM belongs in Android build configuration. Do not commit either private key material or the service-role key. The checked-in public-key value is a fail-closed placeholder until a real matching key is configured.

## Render Admin Panel preview

The current preview is a Render Node.js Web Service:

- URL: https://mahi-repair-admin-preview.onrender.com
- Dashboard: https://dashboard.render.com/web/srv-dbmdt10u01pc73a97osg
- Branch: `security-hardening/run-repair`
- Plan: Free preview; not the final production service
- Node.js: 22.23.4
- Build: `cd admin-panel && npm ci && npm run build`
- Start: `cd admin-panel && npm start`

Browser-safe Render variables:

| Name | Value |
|---|---|
| `NODE_VERSION` | `22.23.4` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://shwqsljicmhflnvjqjah.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project publishable key |
| `NEXT_PUBLIC_APP_URL` | Exact Render origin, without trailing slash |

Do not put the service-role key, database password or signing private key in Render. Configure Supabase Auth Site URL to the intended Admin Panel origin and add `<origin>/auth/callback` to the redirect allow list. The Edge Function `ADMIN_ORIGIN` must match that origin exactly.

## Protected Supabase production deployment

The workflow `.github/workflows/supabase-functions-deploy.yml` applies pending database migrations and deploys all 15 Edge Functions. It requires:

1. Workflow dispatch from `main`.
2. `confirm_production` input exactly equal to `DEPLOY`.
3. Approval from the protected GitHub `supabase-production` environment reviewer.
4. Environment secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD`.
5. Environment variable `ADMIN_ORIGIN`, set to the exact deployed HTTPS origin.
6. `RECIPE_SIGNING_PRIVATE_KEY_PEM` already added directly in Supabase Edge Function Secrets.

The workflow links the explicitly configured project, verifies the custom signing secret exists without reading it, sets `ADMIN_ORIGIN`, previews pending migrations, applies them, deploys the 15 Edge Functions with JWT verification enabled, and verifies migration history. Do not remove the branch, typed input or protected-environment gates.

## Canonical recipe and execution model

Canonical files:

- Schema: `admin-panel/schemas/repair-recipe-v1.schema.json`
- Catalog and canonical serializer: `admin-panel/src/lib/recipe/`
- Edge Function validator/signer: `admin-panel/supabase/functions/_shared/`
- Android verifier contract: `admin-panel/android-contract/RecipeSignatureVerifier.kt`

The Admin Panel signs the exact canonical UTF-8 JSON bytes using RSA-3072 / RSA-SHA256 (RSASSA-PKCS1-v1_5). Android verifies those exact bytes before parsing. Do not parse and reserialize signed payloads before verification.

Recipes are declarative JSON, not code. The APK can execute only native action IDs already compiled into it. New Kotlin capabilities, Android permission declarations or unsupported OS functionality require an APK update. No remote scripts, shell commands, DEX, JAR, APK or arbitrary code may execute.

## Private Realtime and one-install updates

Android listens while foregrounded on a private topic scoped to the authenticated member and server-issued device ID. Events contain only an opaque event ID; they never contain recipes. Android refetches the current authorized catalogue, verifies signatures and updates Room. App launch, foreground/resume, reconnect and periodic WorkManager sync recover missed events when realtime was unavailable or the process was stopped.

Realtime events are hints only and never authorize execution. The server rechecks the member, device, publication state, assignment and version before delivery/execution.

Before production:

1. Apply `20261106120000_private_realtime_catalog_broadcast.sql`.
2. Disable Realtime **Allow public access**.
3. Verify `realtime.messages` RLS and own-device topic isolation.
4. Deploy the updated Edge Functions.
5. Test publish/update/disable, assignment removal, member suspension and device revocation.

## Verification

```bash
cd admin-panel
npm run check:scaffold
npm run typecheck
npm run lint
npm run test
npm run build
```

GitHub Actions also runs Android unit/Compose UI tests, APK/source secret scans and Deno contract/type checks. CI success does not replace owner/member/device acceptance testing or testing on a physical Android device.
