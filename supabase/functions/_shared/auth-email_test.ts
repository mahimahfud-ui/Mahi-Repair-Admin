import { assertEquals, assertMatch, assertStringIncludes } from "jsr:@std/assert@1";
import { buildAuthEmailMessages } from "./auth-email.ts";

Deno.test("member OTP email contains the six-digit code", () => {
  const [message] = buildAuthEmailMessages(
    { email: "Member@Example.com" },
    {
      token: "123456",
      token_hash: "0123456789abcdef0123456789abcdef",
      redirect_to: "http://localhost:3000",
      email_action_type: "email",
    },
    "https://project.supabase.co",
  );

  assertEquals(message.to, "member@example.com");
  assertMatch(message.text, /123456/);
  assertStringIncludes(message.html, "123456");
  assertEquals(message.subject, "Your Mahi Repair verification code");
});

Deno.test("invitation email builds a Supabase verification URL with Admin redirect", () => {
  const [message] = buildAuthEmailMessages(
    { email: "invitee@example.com" },
    {
      token: "",
      token_hash: "0123456789abcdef0123456789abcdef",
      redirect_to: "https://mahi-repair-admin.onrender.com/auth/callback",
      email_action_type: "invite",
    },
    "https://shwqsljicmhflnvjqjah.supabase.co",
  );

  assertStringIncludes(
    message.text,
    "https://shwqsljicmhflnvjqjah.supabase.co/auth/v1/verify?",
  );
  assertStringIncludes(message.text, "redirect_to=https");
  assertStringIncludes(message.html, "Continue to Mahi Repair");
});

Deno.test("HTML-sensitive content is escaped", () => {
  const [message] = buildAuthEmailMessages(
    { email: "member@example.com" },
    {
      token: "123456",
      token_hash: "",
      redirect_to: "",
      email_action_type: "email",
    },
    "https://project.supabase.co",
  );
  assertStringIncludes(message.html, "123456");
  assertEquals(message.html.includes("<script>"), false);
});

Deno.test("secure email change sends both correctly mapped code/hash pairs", () => {
  const messages = buildAuthEmailMessages(
    { email: "old@example.com", new_email: "new@example.com" },
    {
      token: "111111",
      token_hash_new: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      token_new: "222222",
      token_hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      redirect_to: "https://mahi-repair-admin.onrender.com/auth/callback",
      email_action_type: "email_change",
    },
    "https://project.supabase.co",
  );

  assertEquals(messages.map((message) => message.to), ["old@example.com", "new@example.com"]);
  assertStringIncludes(messages[0].text, "token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assertStringIncludes(messages[1].text, "token=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  assertMatch(messages[0].text, /111111/);
  assertMatch(messages[1].text, /222222/);
});

Deno.test("notification emails do not require an OTP", () => {
  const [message] = buildAuthEmailMessages(
    { email: "member@example.com" },
    { email_action_type: "password_changed_notification" },
    "https://project.supabase.co",
  );
  assertStringIncludes(message.subject, "password was changed");
  assertEquals(message.text.includes("one-time code"), false);
});

Deno.test("unknown action types are rejected", () => {
  let rejected = false;
  try {
    buildAuthEmailMessages(
      { email: "member@example.com" },
      { email_action_type: "arbitrary_action" },
      "https://project.supabase.co",
    );
  } catch {
    rejected = true;
  }
  assertEquals(rejected, true);
});
