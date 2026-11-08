import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

type EmailPayload = {
  user?: { email?: string };
  email?: {
    email?: string;
    token?: string;
    token_hash?: string;
    token_new?: string;
    token_hash_new?: string;
    redirect_to?: string;
    email_action_type?: string;
    site_url?: string;
  };
  // Backward compatibility with older Auth Hook payloads.
  email_data?: {
    email?: string;
    token?: string;
    token_hash?: string;
    token_new?: string;
    token_hash_new?: string;
    redirect_to?: string;
    email_action_type?: string;
    site_url?: string;
  };
};

type Message = { to: string; subject: string; html: string; text: string };

const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function env(name: string): string {
  return Deno.env.get(name)?.trim() ?? "";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function subjectFor(action: string): string {
  switch (action.toLowerCase()) {
    case "signup": return "Confirm your Mahi Repair email";
    case "magiclink":
    case "magic_link": return "Your Mahi Repair sign-in code";
    case "invite": return "You have been invited to Mahi Repair";
    case "recovery": return "Reset your Mahi Repair password";
    case "email_change":
    case "email_change_new": return "Confirm your Mahi Repair email change";
    case "email_change_current": return "Confirm your current Mahi Repair email";
    case "reauthentication": return "Your Mahi Repair verification code";
    default: return "Your Mahi Repair verification code";
  }
}

function verificationUrl(
  supabaseUrl: string,
  tokenHash: string,
  action: string,
  redirectTo: string,
): string {
  const url = new URL("/auth/v1/verify", supabaseUrl);
  url.searchParams.set("token", tokenHash);
  url.searchParams.set("type", action);
  if (redirectTo) url.searchParams.set("redirect_to", redirectTo);
  return url.toString();
}

function makeEmail(payload: EmailPayload, supabaseUrl: string): Message | null {
  const user = payload.user ?? {};
  const data = payload.email ?? payload.email_data ?? {};
  const to = (data.email ?? user.email ?? "").trim().toLowerCase();
  const token = (data.token ?? "").trim();
  const tokenHash = (data.token_hash ?? "").trim();
  const tokenNew = (data.token_new ?? "").trim();
  const tokenHashNew = (data.token_hash_new ?? "").trim();
  const redirectTo = (data.redirect_to ?? "").trim();
  const action = (data.email_action_type ?? "magiclink").trim();

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return null;
  if (!token && !tokenHash && !tokenNew && !tokenHashNew) return null;
  if (!action || action.length > 64) return null;

  const link = tokenHash ? verificationUrl(supabaseUrl, tokenHash, action, redirectTo) : "";
  const newLink = tokenHashNew ? verificationUrl(supabaseUrl, tokenHashNew, action, redirectTo) : "";
  const safeAction = escapeHtml(action.replaceAll("_", " "));
  const safeTo = escapeHtml(to);
  const safeToken = escapeHtml(token);
  const safeTokenNew = escapeHtml(tokenNew);

  const linkBlock = link
    ? '<p><a href="' + escapeHtml(link) + '" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Continue securely</a></p>'
    : "";
  const newLinkBlock = newLink
    ? '<p><a href="' + escapeHtml(newLink) + '" style="display:inline-block;padding:12px 18px;background:#0f766e;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Confirm new email</a></p>'
    : "";
  const codeBlock = token
    ? '<p style="margin:20px 0 6px">Your one-time code:</p><div style="font-size:28px;font-weight:700;letter-spacing:6px;padding:12px 16px;background:#f1f5f9;border-radius:8px;display:inline-block">' + safeToken + '</div>'
    : "";
  const newCodeBlock = tokenNew
    ? '<p style="margin:20px 0 6px">Your new-email confirmation code:</p><div style="font-size:24px;font-weight:700;letter-spacing:5px;padding:12px 16px;background:#f1f5f9;border-radius:8px;display:inline-block">' + safeTokenNew + '</div>'
    : "";

  const subject = subjectFor(action);
  const html = '<!doctype html><html><body style="margin:0;padding:32px 16px;background:#0b1220;font-family:Arial,sans-serif;color:#172033">' +
    '<main style="max-width:520px;margin:0 auto;padding:28px;background:#fff;border-radius:16px">' +
    '<p style="margin:0 0 8px;color:#2563eb;font-weight:700;letter-spacing:1px">MAHI REPAIR</p>' +
    '<h1 style="font-size:22px;margin:0 0 16px">Secure account verification</h1>' +
    '<p style="line-height:1.6">A ' + safeAction + ' request was made for <strong>' + safeTo + '</strong>.</p>' +
    linkBlock + codeBlock + newLinkBlock + newCodeBlock +
    '<p style="font-size:12px;line-height:1.6;color:#64748b;margin-top:24px">This message contains a temporary verification method. Never share your code or link. If you did not request this, ignore the message.</p>' +
    '</main></body></html>';

  const textParts = [
    "MAHI REPAIR — Secure account verification",
    "A " + action + " request was made for " + to + ".",
    link ? "Continue: " + link : "",
    token ? "One-time code: " + token : "",
    newLink ? "Confirm new email: " + newLink : "",
    tokenNew ? "New-email confirmation code: " + tokenNew : "",
    "Never share your code or link. If you did not request this, ignore the message.",
  ].filter(Boolean);

  return { to, subject, html, text: textParts.join("\n\n") };
}

async function sendWithResend(
  message: Message,
  from: string,
  apiKey: string,
  idempotencyKey: string,
): Promise<boolean> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: "Bearer " + apiKey,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(10000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function sendWithBrevo(
  message: Message,
  senderName: string,
  senderEmail: string,
  apiKey: string,
): Promise<boolean> {
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: message.to }],
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
      }),
      signal: AbortSignal.timeout(10000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const hookSecret = env("SEND_EMAIL_HOOK_SECRET");
  if (!hookSecret) return json({ error: "HOOK_NOT_CONFIGURED" }, 503);

  const rawBody = await req.text();
  let payload: EmailPayload;
  try {
    const secret = hookSecret.replace(/^v1,whsec_/, "");
    const webhook = new Webhook(secret);
    payload = webhook.verify(rawBody, Object.fromEntries(req.headers)) as EmailPayload;
  } catch {
    return json({ error: "INVALID_WEBHOOK_SIGNATURE" }, 401);
  }

  const supabaseUrl = env("SUPABASE_URL");
  const resendKey = env("RESEND_API_KEY");
  const brevoKey = env("BREVO_API_KEY");
  const senderEmail = env("AUTH_EMAIL_FROM");
  const senderName = env("AUTH_EMAIL_FROM_NAME") || "Mahi Repair";
  const resendFrom = env("RESEND_EMAIL_FROM") || (senderName + " <" + senderEmail + ">");

  if (!supabaseUrl.startsWith("https://") ||
      !senderEmail ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail) ||
      (!resendKey && !brevoKey)) {
    return json({ error: "EMAIL_PROVIDER_NOT_CONFIGURED" }, 503);
  }

  const message = makeEmail(payload, supabaseUrl);
  if (!message) return json({ error: "INVALID_EMAIL_PAYLOAD" }, 422);

  // Hash the Auth token before using it as an idempotency identifier. Never log it.
  const emailData = payload.email ?? payload.email_data ?? {};
  const tokenIdentity = emailData.token_hash ?? emailData.token_hash_new ??
    emailData.token ?? emailData.token_new ?? "";
  const idempotencyKey = "mahi-auth-" +
    (tokenIdentity ? await sha256Hex(tokenIdentity) : crypto.randomUUID());

  if (resendKey) {
    const delivered = await sendWithResend(message, resendFrom, resendKey, idempotencyKey);
    if (delivered) return json({});
    console.warn("Auth email primary provider failed; attempting configured fallback.");
  }

  if (brevoKey) {
    const delivered = await sendWithBrevo(message, senderName, senderEmail, brevoKey);
    if (delivered) return json({});
    console.error("Auth email fallback provider failed.");
  }

  return json({ error: "EMAIL_DELIVERY_FAILED" }, 502);
});
