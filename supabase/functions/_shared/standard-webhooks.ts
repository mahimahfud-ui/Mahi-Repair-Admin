const DEFAULT_TOLERANCE_SECONDS = 300;

function decodeBase64(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error("Invalid base64 value.");
  }
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function parseSecrets(configuredSecrets: string): Uint8Array[] {
  return configuredSecrets
    .split("|")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((configured) => {
      let secret = configured;
      if (secret.startsWith("v1,whsec_")) secret = secret.slice("v1,whsec_".length);
      else if (secret.startsWith("whsec_")) secret = secret.slice("whsec_".length);
      else throw new Error("Auth Hook secret has an unsupported format.");

      const decoded = decodeBase64(secret);
      if (decoded.length < 24 || decoded.length > 64) {
        throw new Error("Auth Hook secret must decode to 24–64 bytes.");
      }
      return decoded;
    });
}

/**
 * Verifies Standard Webhooks v1 HMAC-SHA256 against the exact raw request body.
 * The signed content is webhook-id + "." + webhook-timestamp + "." + raw body.
 */
export async function verifyStandardWebhook(
  rawPayload: string,
  headers: Headers,
  configuredSecrets: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
): Promise<boolean> {
  const messageId = headers.get("webhook-id") ?? "";
  const timestamp = headers.get("webhook-timestamp") ?? "";
  const signatures = headers.get("webhook-signature") ?? "";

  if (!messageId || messageId.length > 200 || messageId.includes(".") ||
      !/^[A-Za-z0-9_:-]+$/.test(messageId)) return false;
  if (!/^\d{1,12}$/.test(timestamp)) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) ||
      Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds) return false;

  const candidates = signatures.split(/\s+/).filter(Boolean)
    .map((entry) => {
      const comma = entry.indexOf(",");
      return comma > 0 && entry.slice(0, comma) === "v1"
        ? entry.slice(comma + 1)
        : "";
    })
    .filter(Boolean);
  if (candidates.length === 0) return false;

  let secrets: Uint8Array[];
  try {
    secrets = parseSecrets(configuredSecrets);
  } catch {
    return false;
  }
  if (secrets.length === 0) return false;

  const signedContent = new TextEncoder().encode(
    `${messageId}.${timestamp}.${rawPayload}`,
  );

  for (const secret of secrets) {
    try {
      const key = await crypto.subtle.importKey(
        "raw",
        toArrayBuffer(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, toArrayBuffer(signedContent)));
      const expected = encodeBase64(digest);
      if (candidates.some((candidate) => constantTimeEqual(expected, candidate))) return true;
    } catch {
      return false;
    }
  }
  return false;
}
