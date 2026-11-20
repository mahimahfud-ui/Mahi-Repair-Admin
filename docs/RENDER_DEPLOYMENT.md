# Render hosting — standalone Mahi Repair Admin

The standalone Next.js Admin application is deployed from this repository's root. The checked-in [render.yaml](../render.yaml) is the source-controlled service definition.

## Declared Render service

- Service name: `mahi-repair-admin`
- Repository: `mahimahfud-ui/Mahi-Repair-Admin`
- Branch: `main`
- Runtime: Node.js 22.23.4 (also pinned in `.nvmrc` and `package.json`)
- Region: Singapore
- Plan: Free
- Build command: `npm ci --no-audit --no-fund && npm run build`
- Start command: `npm run start`
- Health-check path: `/api/health`
- Automatic deploy trigger: `checksPass`

The actual Render service configuration and currently deployed commit must be checked in the Render dashboard. A YAML definition or green GitHub workflow is not proof that a production deployment has completed.

## Canonical public origin

The production origin recorded in the Supabase project configuration and the production handover is:

`https://mahi-repair-admin-yy7c.onrender.com`

Owner login:

`https://mahi-repair-admin-yy7c.onrender.com/login`

Do not use the shorter `mahi-repair-admin.onrender.com` hostname or the retired Android-repository preview deployment as the canonical Owner Console.

## Environment variables

Configure in Render → `mahi-repair-admin` → Environment:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_URL` — exact canonical HTTPS origin, without a trailing slash
- `ADMIN_OWNER_EMAIL` — server-only existing Owner Auth identity; never prefix it with `NEXT_PUBLIC_`

Do not configure the Supabase service-role key, database password, Owner PIN, email-provider credentials or RSA signing private key in the Render website service.

## Post-deploy verification

1. Open the canonical Owner login page.
2. Fetch `/api/health` and confirm HTTP 200 with `ready: true`.
3. Confirm the deployed commit SHA and build logs in Render.
4. Test Owner PIN authentication and a protected Owner-only page.
5. Confirm an active Member cannot create an Owner session or access Owner pages.
6. Confirm no secret values appear in browser assets or logs.

The health endpoint verifies configuration shape, not successful database access, Owner login, invitation delivery or signing-key compatibility.

## Separate Supabase operations

A Render deployment does not apply Supabase migrations, create Storage buckets, configure Auth redirects, set Edge Function secrets, or deploy Edge Functions. These remain separately reviewed operations described in [DEPLOYMENT.md](DEPLOYMENT.md).
