# AI Recipe Assistant

## What it does

The Owner Console route `/assistant` can ask Gemini to propose a Mahi Repair Recipe v1 draft from a bounded symptom description and tool metadata.

The assistant is deliberately **draft-only**:

- It does not insert or update `repair_tools`.
- It does not call the publish function, sign a recipe, write a repair-tool version, or assign a tool to a Member.
- It does not invoke any Android device, remote-support or command API.
- The Owner must copy the returned JSON to the existing tool editor, validate it, save it through the existing `admin-upsert-tool` path, test it, and separately choose whether to publish it.

The existing Owner authentication, profile-role check, rate-limit RPC, append-only audit table, shared recipe contract and normal publication controls remain in the request path.

## Runtime configuration

Configure these values in **Supabase Dashboard → Edge Functions → Secrets**. Never put them in GitHub, Render, `.env.local`, browser variables, Android configuration or chat.

| Name | Required | Purpose |
|---|---:|---|
| `GEMINI_API_KEY` | Yes | Server-side key for the Gemini Developer API. |
| `GEMINI_MODEL` | No | Model name override. Defaults to `gemini-3.8-flash`. |

Supabase provides the Edge Function's `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` runtime variables. The function uses the existing shared Owner auth helper and rate-limit/audit helpers; do not copy the service-role key into another environment.

Use a current Gemini authorization key, or a standard key that is explicitly restricted to the Gemini API. Google's September 2026 key-policy transition rejects unrestricted standard keys. The code sends the key in the `x-goog-api-key` request header and never puts it in a URL or query string.

The connected repository and Supabase source inspection can confirm that the function references the secret name; it cannot prove whether the hosted secret exists, is valid, has quota, or is linked to the expected Google project. Verify those properties in the Supabase and Google AI Studio consoles without copying the secret value into GitHub or logs.

## Request and safety boundary

`POST /functions/v1/admin-generate-repair-recipe`

- Requires a Supabase user JWT and an active `profiles.role='owner'` row.
- Uses the shared durable `consume_rate_limit` RPC (6 requests per Owner per minute).
- Accepts a maximum 1,200-character symptom description, trusted tool metadata, and an optional Android package name.
- Passes only that symptom and tool metadata to Gemini. Do not enter names, phone numbers, IMEIs, passwords, email addresses or other personal data.
- Requests structured JSON; validates the returned steps against `supabase/functions/_shared/recipe.ts` before responding.
- Caps model-generated recipes at 12 steps.
- Permits only the 13 compiled native action IDs in the shared Recipe v1 contract.
- Requires guided/permission actions to retain their explicit confirmation flags.
- If a package name is included, every generated `packageName` must match it exactly.
- Restricts host parameters to `cloudflare.com`, `connectivitycheck.gstatic.com`, `google.com` and `youtube.com`.
- Replaces model-supplied tool ID, title, category, API level and app version with validated Owner-selected input before returning the recipe.
- Writes an audit event containing model name, category, whether a package was supplied, and step count. The symptom text and Gemini key are not included in audit metadata.

The generated JSON is a proposal, not proof that any repair is safe or effective on a particular Android device. Review the steps and test compatibility before publication. The Android app remains responsible for enforcing its compiled native action allowlist, foreground confirmation and current server authorization.

## Local checks

From the Admin repository root:

~~~bash
npm run typecheck
npm run lint
npm run test
deno check supabase/functions/admin-generate-repair-recipe/index.ts
deno test supabase/functions/_shared/ai-recipe_test.ts
npm run build
~~~

The GitHub Actions workflow runs the repository-wide Edge Function checks and shared Deno tests. CI does not deploy this function or configure Supabase secrets.

## Deployment procedure

Deployment is intentionally manual and separate from code review:

1. Review and merge the source change through the normal PR process.
2. Configure `GEMINI_API_KEY` in Supabase Edge Function Secrets; optionally set `GEMINI_MODEL`.
3. Verify the key type/restriction, quota and model availability in the Google AI Studio project without exposing the key.
4. An authorized operator deploys `admin-generate-repair-recipe` to the existing project `shwqsljicmhflnvjqjah` with JWT verification enabled.
5. Use a real Owner session to test one non-personal symptom. Confirm the response is a validated draft only and audit metadata contains no prompt or key.
6. Do not publish a generated recipe until an Owner has reviewed it, run the Test Lab validation, verified signing-key compatibility and followed the existing release acceptance process.

A passing CI run is not proof that the hosted secret exists, the Edge Function is deployed, Gemini accepts the key, or the live Owner route succeeds.
