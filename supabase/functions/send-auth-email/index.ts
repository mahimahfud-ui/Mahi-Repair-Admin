import { buildAuthEmailMessages, type AuthEmailAction, type AuthEmailMessage } from "../_shared/auth-email.ts";
import { verifyStandardWebhook } from "../_shared/standard-webhooks.ts";

type VerifiedHook = {
  user?: { email?: string; new_email?: string };
  email_data?: {
    token?: string;
    token_hash?: string;
    redirect_to?: string;
    email_action_type?: string;
    site_url?: string;
    token_new?: string;
    token_hash_new?: string;
    old_email?: string;
  };
};

const MAX_BODY_BYTES = 64 * 1024;
const PROVIDER_TIMEOUT_MS = 10_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function parseSender(value: string): { name: string; email: string } {
  const angle = value.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  const name = angle?.[1]?.replace(/^["']|["']$/g, "").trim() || "Mahi Repair";
  const email = (angle?.[2] ?? value).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("AUTH_EMAIL_FROM must contain a valid sender email address.");
  }
  return { name, email };
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      // Do not read or log provider response bodies; they may contain recipient or request data.
      throw new Error(`provider_http_${response.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

async function sendWithResend(
  message: AuthEmailMessage,
  apiKey: string,
  sender: string,
  idempotencyKey?: string,
): Promise<void> {
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  await postJson("https://api.resend.com/emails", headers, {
    from: sender,
    to: [message.to],
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
}

async function sendWithBrevo(
  message: AuthEmailMessage,
  apiKey: string,
  sender: { name: string; email: string },
): Promise<void> {
  await postJson("https://api.brevo.com/v3/smtp/email", { "api-key": apiKey }, {
    sender,
    to: [{ email: message.to }],
    subject: message.subject,
    htmlContent: message.html,
    textContent: message.text,
  });
}

async function deliver(
  message: AuthEmailMessage,
  env: {
    resendKey: string;
    brevoKey: string;
    sender: string;
    idempotencyKey?: string;
  },
): Promise<"resend" | "brevo"> {
  const failures: string[] = [];

  if (env.resendKey) {
    try {
      await sendWithResend(message, env.resendKey, env.sender, env.idempotencyKey);
      return "resend";
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown_error";
      failures.push(`resend:${reason}`);
      console.warn("Primary auth email delivery failed; trying fallback provider.", { reason });
    }
  } else {
    failures.push("resend:not_configured");
  }

  if (env.brevoKey) {
    try {
      await sendWithBrevo(message, env.brevoKey, parseSender(env.sender));
      return "brevo";
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown_error";
      failures.push(`brevo:${reason}`);
      console.error("Fallback auth email delivery failed.", { reason });
    }
  } else {
    failures.push("brevo:not_configured");
  }

  throw new Error(`All configured auth email providers failed (${failures.join(", ")}).`);
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const hookSecret = Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "";
  if (!hookSecret) {
    console.error("SEND_EMAIL_HOOK_SECRET is not configured.");
    return json({ error: "HOOK_NOT_CONFIGURED" }, 500);
  }

  const rawPayload = await request.text();
  if (new TextEncoder().encode(rawPayload).byteLength > MAX_BODY_BYTES) {
    return json({ error: "PAYLOAD_TOO_LARGE" }, 413);
  }

  const signatureValid = await verifyStandardWebhook(rawPayload, request.headers, hookSecret);
  if (!signatureValid) return json({ error: "INVALID_HOOK_SIGNATURE_OR_PAYLOAD" }, 401);

  let event: VerifiedHook;
  try {
    event = JSON.parse(rawPayload) as VerifiedHook;
  } catch {
    return json({ error: "INVALID_AUTH_EMAIL_EVENT" }, 400);
  }
  if (!event?.user || !event?.email_data ||
      typeof event.email_data.email_action_type !== "string") {
    return json({ error: "INVALID_AUTH_EMAIL_EVENT" }, 422);
  }

  const emailData = event.email_data;
  const action = emailData.email_action_type as AuthEmailAction;
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const sender = Deno.env.get("AUTH_EMAIL_FROM") ?? "";
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const brevoKey = Deno.env.get("BREVO_API_KEY") ?? "";
  if (!supabaseUrl || !sender || (!resendKey && !brevoKey)) {
    console.error("Auth email delivery configuration is incomplete.");
    return json({ error: "EMAIL_DELIVERY_NOT_CONFIGURED" }, 500);
  }

  let messages: AuthEmailMessage[];
  try {
    messages = buildAuthEmailMessages(event.user, {
      token: emailData.token,
      token_hash: emailData.token_hash,
      redirect_to: emailData.redirect_to,
      email_action_type: action,
      site_url: emailData.site_url,
      token_new: emailData.token_new,
      token_hash_new: emailData.token_hash_new,
      old_email: emailData.old_email,
    }, supabaseUrl);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Invalid Auth email event.";
    console.warn("Auth email event rejected.", { action, reason });
    return json({ error: "INVALID_AUTH_EMAIL_EVENT" }, 422);
  }

  const hookId = request.headers.get("webhook-id")?.trim();
  const baseKey = hookId && /^[A-Za-z0-9._:-]{1,180}$/.test(hookId) ? hookId : undefined;
  try {
    const providers: string[] = [];
    for (const [index, message] of messages.entries()) {
      const key = baseKey ? `${baseKey}-${index + 1}` : undefined;
      providers.push(await deliver(message, {
        resendKey,
        brevoKey,
        sender,
        idempotencyKey: key,
      }));
    }
    return json({ delivered: true, provider: providers.length === 1 ? providers[0] : providers });
  } catch {
    console.error("Auth email delivery failed after primary and fallback attempts.", {
      action,
      messageCount: messages.length,
    });
    return json({ error: "EMAIL_DELIVERY_FAILED" }, 502);
  }
});
