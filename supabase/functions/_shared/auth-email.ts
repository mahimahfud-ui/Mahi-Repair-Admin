export type AuthEmailAction =
  | "signup"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email_change"
  | "email"
  | "reauthentication"
  | "password_changed_notification"
  | "email_changed_notification"
  | "phone_changed_notification"
  | "identity_linked_notification"
  | "identity_unlinked_notification"
  | "mfa_factor_enrolled_notification"
  | "mfa_factor_unenrolled_notification";

export type AuthEmailUser = {
  email?: string;
  new_email?: string;
};

export type AuthEmailData = {
  token?: string;
  token_hash?: string;
  redirect_to?: string;
  email_action_type: string;
  site_url?: string;
  token_new?: string;
  token_hash_new?: string;
  old_email?: string;
};

export type AuthEmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

const SUBJECTS: Record<AuthEmailAction, string> = {
  signup: "Verify your Mahi Repair account",
  invite: "You are invited to Mahi Repair",
  magiclink: "Your Mahi Repair sign-in link",
  recovery: "Reset your Mahi Repair password",
  email_change: "Confirm your Mahi Repair email change",
  email: "Your Mahi Repair verification code",
  reauthentication: "Your Mahi Repair verification code",
  password_changed_notification: "Your Mahi Repair password was changed",
  email_changed_notification: "Your Mahi Repair email was changed",
  phone_changed_notification: "Your Mahi Repair phone number was changed",
  identity_linked_notification: "A sign-in method was linked to Mahi Repair",
  identity_unlinked_notification: "A sign-in method was removed from Mahi Repair",
  mfa_factor_enrolled_notification: "Multi-factor authentication was enabled",
  mfa_factor_unenrolled_notification: "Multi-factor authentication was changed",
};

const COPY: Record<AuthEmailAction, { heading: string; intro: string; fallback: string }> = {
  signup: {
    heading: "Verify your email",
    intro: "Use the verification code below to finish setting up your Mahi Repair account.",
    fallback: "If you did not request this account, you can ignore this email.",
  },
  invite: {
    heading: "You have been invited",
    intro: "An Owner invited you to join Mahi Repair. Accept the invitation to access your repair tools.",
    fallback: "If you were not expecting this invitation, you can ignore this email.",
  },
  magiclink: {
    heading: "Sign in to Mahi Repair",
    intro: "Use the one-time code or secure link below to sign in.",
    fallback: "If you did not request this sign-in, you can ignore this email.",
  },
  recovery: {
    heading: "Reset your password",
    intro: "Use the one-time code or secure link below to continue resetting your password.",
    fallback: "If you did not request a password reset, secure your account and ignore this email.",
  },
  email_change: {
    heading: "Confirm your email address",
    intro: "Use the one-time code or secure link below to confirm this email change.",
    fallback: "If you did not request this change, do not use the code or link.",
  },
  email: {
    heading: "Your verification code",
    intro: "Enter this one-time code in the Mahi Repair app to verify your invited account.",
    fallback: "If you did not request this code, you can ignore this email.",
  },
  reauthentication: {
    heading: "Confirm it is you",
    intro: "Enter this one-time code to confirm your identity.",
    fallback: "If you did not request this verification, you can ignore this email.",
  },
  password_changed_notification: {
    heading: "Your password was changed",
    intro: "The password for your Mahi Repair account was changed.",
    fallback: "If you did not make this change, reset your password and contact the Owner.",
  },
  email_changed_notification: {
    heading: "Your email was changed",
    intro: "The email address associated with your Mahi Repair account was changed.",
    fallback: "If you did not make this change, contact the Owner immediately.",
  },
  phone_changed_notification: {
    heading: "Your phone number was changed",
    intro: "The phone number associated with your Mahi Repair account was changed.",
    fallback: "If you did not make this change, contact the Owner immediately.",
  },
  identity_linked_notification: {
    heading: "A sign-in method was linked",
    intro: "A new sign-in method was linked to your Mahi Repair account.",
    fallback: "If you did not make this change, secure your account and contact the Owner.",
  },
  identity_unlinked_notification: {
    heading: "A sign-in method was removed",
    intro: "A sign-in method was removed from your Mahi Repair account.",
    fallback: "If you did not make this change, secure your account and contact the Owner.",
  },
  mfa_factor_enrolled_notification: {
    heading: "Multi-factor authentication enabled",
    intro: "A multi-factor authentication method was enabled for your Mahi Repair account.",
    fallback: "If you did not make this change, secure your account and contact the Owner.",
  },
  mfa_factor_unenrolled_notification: {
    heading: "Multi-factor authentication changed",
    intro: "A multi-factor authentication method was removed from your Mahi Repair account.",
    fallback: "If you did not make this change, secure your account and contact the Owner.",
  },
};

const ACTIONS_WITH_TOKEN = new Set<AuthEmailAction>([
  "signup", "invite", "magiclink", "recovery", "email_change", "email", "reauthentication",
]);

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function validEmail(value: unknown): value is string {
  return typeof value === "string" &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function verificationUrl(
  supabaseUrl: string,
  tokenHash: string | undefined,
  action: AuthEmailAction,
  redirectTo: string | undefined,
): string | null {
  if (!tokenHash || !/^[A-Za-z0-9_-]{16,128}$/.test(tokenHash)) return null;
  try {
    const base = new URL(supabaseUrl);
    if (base.protocol !== "https:") return null;
    const url = new URL("/auth/v1/verify", base);
    url.searchParams.set("token", tokenHash);
    url.searchParams.set("type", action);
    if (redirectTo) {
      const redirect = new URL(redirectTo);
      if (redirect.protocol === "https:" ||
          (redirect.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(redirect.hostname))) {
        url.searchParams.set("redirect_to", redirect.toString());
      }
    }
    return url.toString();
  } catch {
    return null;
  }
}

function makeMessage(
  recipient: string,
  action: AuthEmailAction,
  token: string | undefined,
  tokenHash: string | undefined,
  redirectTo: string | undefined,
  supabaseUrl: string,
  recipientContext?: string,
): AuthEmailMessage {
  if (!validEmail(recipient)) throw new Error("Auth email recipient is invalid.");
  const copy = COPY[action];
  const code = token && /^\d{6}$/.test(token) ? token : null;
  const link = verificationUrl(supabaseUrl, tokenHash, action, redirectTo);
  if (ACTIONS_WITH_TOKEN.has(action) && !code && !link) {
    throw new Error("The Auth email event is missing a usable verification code or link.");
  }

  const contextLine = recipientContext ? `\n\n${recipientContext}` : "";
  const linkText = link ? `\n\nContinue securely: ${link}` : "";
  const codeText = code ? `\n\nYour one-time code: ${code}` : "";
  const text = [
    copy.heading,
    "",
    copy.intro,
    codeText,
    linkText,
    contextLine,
    "",
    copy.fallback,
    "",
    "Mahi Repair",
  ].filter(Boolean).join("\n");

  const codeHtml = code
    ? `<p style="font-size:30px;font-weight:700;letter-spacing:8px;text-align:center;background:#f4f4f5;border-radius:10px;padding:18px 12px;color:#18181b">${escapeHtml(code)}</p>`
    : "";
  const linkHtml = link
    ? `<p style="text-align:center;margin:28px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#dc3c43;color:#fff;text-decoration:none;padding:13px 22px;border-radius:8px;font-weight:700">Continue to Mahi Repair</a></p>`
    : "";
  const contextHtml = recipientContext
    ? `<p style="color:#52525b">${escapeHtml(recipientContext)}</p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border-radius:14px;padding:32px"><tr><td><p style="font-size:12px;letter-spacing:2px;font-weight:700;color:#dc3c43">MAHI REPAIR</p><h1 style="font-size:24px;margin:20px 0 12px">${escapeHtml(copy.heading)}</h1><p style="font-size:15px;line-height:1.6;color:#3f3f46">${escapeHtml(copy.intro)}</p>${contextHtml}${codeHtml}${linkHtml}<p style="font-size:13px;line-height:1.6;color:#71717a;margin-top:26px">${escapeHtml(copy.fallback)}</p><hr style="border:0;border-top:1px solid #e4e4e7;margin:24px 0"><p style="font-size:12px;color:#a1a1aa">Mahi Repair · Secure device diagnostics and repair</p></td></tr></table></td></tr></table></body></html>`;

  return { to: recipient.trim().toLowerCase(), subject: SUBJECTS[action], text, html };
}

export function buildAuthEmailMessages(
  user: AuthEmailUser,
  emailData: AuthEmailData,
  supabaseUrl: string,
): AuthEmailMessage[] {
  const action = emailData.email_action_type as AuthEmailAction;
  if (!Object.hasOwn(SUBJECTS, action)) throw new Error("Unsupported Supabase Auth email action.");
  if (!supabaseUrl) throw new Error("Supabase URL is not configured.");

  if (action === "email_change") {
    const currentEmail = user.email;
    const newEmail = user.new_email;
    const hasBothPairs = validEmail(currentEmail) &&
      validEmail(newEmail) &&
      Boolean(emailData.token) &&
      Boolean(emailData.token_hash_new) &&
      Boolean(emailData.token_new) &&
      Boolean(emailData.token_hash);

    if (hasBothPairs) {
      // Supabase's compatibility mapping is counterintuitive:
      // token_hash_new belongs to the current email; token_hash belongs to new_email.
      return [
        makeMessage(
          currentEmail!,
          action,
          emailData.token,
          emailData.token_hash_new,
          emailData.redirect_to,
          supabaseUrl,
          "This code confirms the change from your current email address.",
        ),
        makeMessage(
          newEmail!,
          action,
          emailData.token_new,
          emailData.token_hash,
          emailData.redirect_to,
          supabaseUrl,
          "This code confirms the new email address for your account.",
        ),
      ];
    }

    const recipient = validEmail(newEmail) ? newEmail : user.email;
    return [makeMessage(
      recipient ?? "",
      action,
      emailData.token_new || emailData.token,
      emailData.token_hash || emailData.token_hash_new,
      emailData.redirect_to,
      supabaseUrl,
    )];
  }

  return [makeMessage(
    user.email ?? "",
    action,
    emailData.token,
    emailData.token_hash,
    emailData.redirect_to,
    supabaseUrl,
  )];
}
