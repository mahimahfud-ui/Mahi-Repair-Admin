import { assertEquals } from "jsr:@std/assert@1";
import { verifyStandardWebhook } from "./standard-webhooks.ts";

const encoder = new TextEncoder();
const now = 1_800_000_000;

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

async function makeSignature(secretBytes: Uint8Array, body: string, id: string, timestamp: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(secretBytes),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const content = encoder.encode(`${id}.${timestamp}.${body}`);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, toArrayBuffer(content)));
  let binary = "";
  signature.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary);
}

function secret(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return `v1,whsec_${btoa(binary)}`;
}

Deno.test("accepts a valid Standard Webhooks v1 signature", async () => {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const body = '{"user":{"email":"member@example.com"},"email_data":{"token":"123456"}}';
  const id = "msg_test_123";
  const timestamp = now;
  const signature = await makeSignature(key, body, id, timestamp);
  const headers = new Headers({
    "webhook-id": id,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": `v1,${signature}`,
  });
  assertEquals(await verifyStandardWebhook(body, headers, secret(key), now), true);
});

Deno.test("rejects a modified raw request body", async () => {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const id = "msg_test_124";
  const timestamp = now;
  const signature = await makeSignature(key, '{"code":"111111"}', id, timestamp);
  const headers = new Headers({
    "webhook-id": id,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": `v1,${signature}`,
  });
  assertEquals(await verifyStandardWebhook('{"code":"222222"}', headers, secret(key), now), false);
});

Deno.test("accepts a matching prior secret during rotation", async () => {
  const previousKey = crypto.getRandomValues(new Uint8Array(32));
  const currentKey = crypto.getRandomValues(new Uint8Array(32));
  const id = "msg_test_125";
  const body = '{"event":"invite"}';
  const signature = await makeSignature(previousKey, body, id, now);
  const headers = new Headers({
    "webhook-id": id,
    "webhook-timestamp": String(now),
    "webhook-signature": `v1,${signature}`,
  });
  assertEquals(
    await verifyStandardWebhook(body, headers, `${secret(currentKey)}|${secret(previousKey)}`, now),
    true,
  );
});

Deno.test("rejects stale webhook timestamps to prevent replay", async () => {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const id = "msg_test_126";
  const body = '{"event":"invite"}';
  const signature = await makeSignature(key, body, id, now - 301);
  const headers = new Headers({
    "webhook-id": id,
    "webhook-timestamp": String(now - 301),
    "webhook-signature": `v1,${signature}`,
  });
  assertEquals(await verifyStandardWebhook(body, headers, secret(key), now), false);
});

Deno.test("rejects missing signature headers", async () => {
  assertEquals(
    await verifyStandardWebhook("{}", new Headers(), "v1,whsec_invalid"),
    false,
  );
});
