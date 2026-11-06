# Mahi Repair — setup and deployment

## Production architecture

- `app/`: native Android repair client.
- `admin-panel/`: separate private Next.js Owner Admin Panel.
- Supabase: shared Auth, PostgreSQL with RLS, private Realtime and authenticated Edge Functions.
- Google Cloud Run: production hosting for the Admin Panel.

The Android APK does not contain Admin Panel routes, URLs, Owner credentials or Owner-only actions. Render is retired as a hosting target.

## Local development

The Admin Panel is pinned to Node.js **22.23.4**.

```bash
cd admin-panel
npm ci
cp .env.example .env.local
npm run dev
```

Set only these public Supabase project settings in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PROJECT_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

The URL and publishable key are not privileged credentials. The app reads them from server-only modules at runtime. Never add a Supabase service-role/secret key, database password or recipe-signing private key to this application.

## Owner authentication and security boundaries

- Login sends a Supabase email OTP/magic link with `shouldCreateUser: false`; there is no public registration action.
- The sign-in request runs in a Next.js Server Action through the Supabase SSR client.
- Auth cookies use `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` in production.
- The callback exchanges the PKCE code, calls `auth.getUser()`, and checks `profiles.role = 'owner'` plus `profiles.status = 'active'`. Other accounts are signed out.
- Every protected console request repeats the Owner check in the server layout.
- Every privileged Server Action independently calls `requireOwner()` and invokes an allowlisted authenticated Supabase Edge Function.
- Role or status values from form data and user-editable metadata are never trusted.

Public Cloud Run ingress is required so an Owner can load the login page. It does not grant console access. The Admin Panel itself enforces Supabase authentication and the active Owner profile on protected pages/actions.

## Deploy to Cloud Run

Build and deploy with the repository's Dockerfile. **Run the command from `admin-panel/`**, so the build context contains only the Next.js app and does not include Android sources or the root legacy React preview.

```bash
cd admin-panel

gcloud run deploy mahi-repair-admin \
  --source . \
  --region asia-southeast1 \
  --port 8080 \
  --allow-unauthenticated \
  --set-env-vars="NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PROJECT_KEY"
```

Cloud Run source deployment uses the Dockerfile when one is present in the source directory. The image pins Node.js **22.23.4**, builds Next.js standalone output, runs as an unprivileged user and binds to `0.0.0.0` on the Cloud Run `PORT` (defaulted to 8080 in the image). See Google's [Cloud Run source deployment documentation](https://docs.cloud.google.com/run/docs/deploying-source-code).

After the first deployment, set the canonical public origin used for magic-link callbacks:

```bash
gcloud run services update mahi-repair-admin \
  --region asia-southeast1 \
  --update-env-vars="NEXT_PUBLIC_APP_URL=https://YOUR_CLOUD_RUN_OR_CUSTOM_DOMAIN"
```

The `/api/health` endpoint returns only `{ "status": "ok" }` when the two required public Supabase settings exist. Otherwise it returns `{ "status": "not_ready" }` with HTTP 503. It never returns settings, credentials, database records or user information.

The image can also be built with Docker/Cloud Build and deployed as a prebuilt image when a controlled CI/CD pipeline is preferred.

## Supabase production configuration

After the Cloud Run service has a stable HTTPS origin:

1. Set Supabase Auth **Site URL** to that exact origin.
2. Add the exact `https://YOUR_ORIGIN/auth/callback` URL to the Supabase Auth redirect allow list.
3. Configure SMTP/email delivery and appropriate Auth rate limits.
4. Verify the intended Owner has a `profiles` row with `role = 'owner'` and `status = 'active'`.
5. Set the custom Edge Function secret `ADMIN_ORIGIN` to the exact Admin Panel HTTPS origin.

Supabase Edge Functions automatically receive their reserved runtime variables, including the service-role key. Do not copy those values to Cloud Run.

## Recipe signing key

The PKCS#8 RSA-3072 private signing key belongs only in Supabase Dashboard → Edge Function Secrets as `RECIPE_SIGNING_PRIVATE_KEY_PEM`. Only the matching X.509 public key belongs in Android release configuration. Never put the private key in Cloud Run, the Admin Panel, browser variables, GitHub or the APK.

## Release verification

```bash
cd admin-panel
npm ci
npm run check:scaffold
npm run typecheck
npm run lint
npm run test
npm run build
```

After deployment, verify:

- `GET /api/health` is status-only.
- Anonymous `GET /` redirects to `/login`.
- An active Owner can complete the email link and access the console.
- A member account is signed out/denied at callback and cannot use console pages or actions.
- Draft create/edit and recipe validation persist through Supabase.
- Publish creates a signed immutable version; unpublish/disable and rollback call the corresponding Edge Functions.
- Assignments, invitations, member suspension/reactivation, device revocation, repair reports and audit information show persisted Supabase data.
- An Edge Function error or no-row update never displays success.

A successful image build or health response does not replace an end-to-end Owner/member acceptance test.
