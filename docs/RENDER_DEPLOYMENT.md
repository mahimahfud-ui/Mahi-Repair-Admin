# Render deployment — retired

Render is no longer an approved hosting target for the Mahi Repair Admin Panel. The production architecture is:

- Native Android client: repository `app/`.
- Separate private Next.js Owner Admin Panel: `admin-panel/`.
- Backend: Supabase.
- Hosting: Google Cloud Run.

The root `render.yaml` service configuration has been removed. Do not create or promote a Render service for this application.

Use [CLOUD_RUN_DEPLOYMENT.md](./CLOUD_RUN_DEPLOYMENT.md) for the supported Google AI Studio / Cloud Run workflow. The Cloud Run build context must be `admin-panel/`; do not deploy the root legacy React prototype or the Android app with the Admin Panel.
