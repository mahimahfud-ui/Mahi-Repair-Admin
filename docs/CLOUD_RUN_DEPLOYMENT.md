# Google AI Studio Web App / Cloud Run deployment

## Keep the existing Next.js application

This is a monorepo. The deployable Admin Panel is the existing application in `admin-panel/`; it is not the root Vite prototype and it is not part of the Android APK.

Keep GitHub as the source of truth. Do not regenerate the Admin Panel from a prompt, replace it with a newly scaffolded AI Studio React app, or deploy the repository root. The Admin Panel already has its own Next.js routes, Server Actions, Supabase SSR session handling, recipe editor and Owner console.

Google AI Studio Build Mode can import an existing project from GitHub and deploy web apps to Cloud Run. For this repository, preserve the `admin-panel/` working directory and its existing Next.js structure. If the imported AI Studio workspace does not retain the monorepo subdirectory as its app/build root, use the checked-in Dockerfile and deploy from `admin-panel/` directly rather than allowing the root prototype to be published. See Google's [Build apps in AI Studio](https://ai.google.dev/gemini-api/docs/aistudio-build-mode) and [Deploying from AI Studio](https://ai.google.dev/gemini-api/docs/aistudio-deploying) guides.

## Runtime contract

- Node.js image: `node:22.23.4-bookworm-slim`.
- Install: `npm ci`.
- Build: `npm run build`.
- Next.js output mode: `standalone`.
- Start: `node server.js` (also exposed as `npm start`).
- Listen interface: `0.0.0.0`.
- Listen port: `process.env.PORT`, with container default 8080.
- Container user: unprivileged `nextjs`.
- Public probe: `GET /api/health`.

The Docker build context is this directory. `.dockerignore` excludes local environment files, dependencies, build output and Git metadata. The container does not need Supabase service credentials or the RSA signing private key.

## Preferred deploy workflow

From a shell authenticated to the Google Cloud project, deploy the existing app by using the Dockerfile:

```bash
cd admin-panel

gcloud run deploy mahi-repair-admin \
  --source . \
  --region asia-southeast1 \
  --port 8080 \
  --allow-unauthenticated \
  --set-env-vars="NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PROJECT_KEY"
```

Cloud Run's source deployment uses a Dockerfile when one exists in the source directory. This command therefore builds the checked-in standalone image rather than guessing a build command from the monorepo root. Refer to [Deploy services from source code](https://docs.cloud.google.com/run/docs/deploying-source-code).

Once the service has a stable URL/custom domain, configure it as the callback origin:

```bash
gcloud run services update mahi-repair-admin \
  --region asia-southeast1 \
  --update-env-vars="NEXT_PUBLIC_APP_URL=https://YOUR_CLOUD_RUN_OR_CUSTOM_DOMAIN"
```

Use the Cloud Run console's environment settings instead of command-line variables when preferred. The two required Supabase values are public project configuration; do not configure secrets here.

## Google AI Studio Build Mode path

For a workspace that should be editable in AI Studio:

1. Open AI Studio Build Mode and choose **Import from GitHub** from the add-files menu.
2. Select the existing `mahimahfud-ui/Mahi-Repair` repository. Do not create a replacement app or repository.
3. Keep the existing Admin Panel code under `admin-panel/`; do not ask the agent to regenerate it.
4. Confirm the preview/build is running the Next.js application and that the deploy root points to `admin-panel/`.
5. Publish to Cloud Run only when the Build Mode workspace is demonstrably building this subdirectory and its existing Dockerfile/configuration.

If the Build Mode import cannot deploy a monorepo subdirectory as its app root, use the direct Cloud Run command above. This avoids publishing the unrelated root React prototype and keeps the Admin Panel code and deployment configuration in GitHub.

## Cloud Run environment variables

Required:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key (public) |

Optional:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Exact HTTPS origin for magic-link callback URLs |

The server reads these settings dynamically at runtime. The login flow uses a server action so the Supabase SSR client and session cookies are not shipped in a browser bundle. Do not set `SUPABASE_SERVICE_ROLE_KEY`, a Supabase secret key, a database password or `RECIPE_SIGNING_PRIVATE_KEY_PEM` on the Cloud Run service.

## Authentication and secrets

Cloud Run must serve the public login page, so HTTP ingress is public. Only Supabase authenticated users with an active Owner profile can reach the console. The callback signs out authenticated member accounts. Every protected Server Action checks Owner authorization again before calling its allowlisted Edge Function.

After deployment:

1. Set Supabase Auth Site URL to the final HTTPS origin.
2. Add `<origin>/auth/callback` to the Auth redirect allow list.
3. Configure Supabase SMTP and suitable email/Auth rate limits.
4. Set Supabase Edge Function secret `ADMIN_ORIGIN` to the exact origin.
5. Keep `RECIPE_SIGNING_PRIVATE_KEY_PEM` only in Supabase Edge Function Secrets.

The Admin Panel uses the public Supabase publishable key and the signed-in user's session. Edge Functions keep their server-side service credentials and perform their own Owner authorization. Never move those credentials into Cloud Run.

## Post-deploy smoke tests

```bash
curl -i https://YOUR_SERVICE_URL/api/health
curl -i https://YOUR_SERVICE_URL/login
curl -i https://YOUR_SERVICE_URL/
```

Expected:

- `/api/health`: HTTP 200 with only `{"status":"ok"}` after configuration.
- `/login`: email sign-in form loads.
- Anonymous `/`: redirects to `/login`.
- Owner magic-link callback: session is established only when the database profile is active Owner.
- Member callback: session is cleared and the user is returned to login.
- Administrative mutations use authenticated Edge Functions; failures are not translated into fake success.

Run the Admin Panel CI checks and complete Owner/member acceptance testing before using this service for production administration.
