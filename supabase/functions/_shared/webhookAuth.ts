/**
 * Webhook authentication utilities for Violet HMAC signature validation.
 *
 * ## How Violet signs webhooks
 *
 * Violet computes HMAC-SHA256 of the raw request body using the App Secret
 * as the key, then Base64-encodes the result and sends it in the
 * `X-Violet-Hmac` header. We recompute the HMAC locally and compare.
 *
 * ## Why Web Crypto API (not CryptoJS)
 *
 * Deno provides `crypto.subtle` natively — no npm imports needed.
 * `crypto.subtle.verify()` performs constant-time comparison internally,
 * preventing timing attacks without manual byte-by-byte XOR.
 *
 * ## CRITICAL: Validate BEFORE parsing
 *
 * The HMAC is computed on the raw string body, NOT parsed JSON.
 * Always call `validateHmac()` before `JSON.parse()`.
 *
 * @see https://docs.violet.io/prism/webhooks/handling-webhooks — HMAC validation
 */

const encoder = new TextEncoder();

/**
 * Validates a Violet webhook HMAC-SHA256 signature.
 *
 * Uses `crypto.subtle.verify()` for constant-time comparison — this prevents
 * timing attacks where an attacker could infer correct signature bytes by
 * measuring response times from string equality checks.
 *
 * @param rawBody - The raw request body string (NOT parsed JSON)
 * @param hmacHeader - The Base64-encoded signature from X-Violet-Hmac header
 * @returns true if the signature is valid
 */
export async function validateHmac(rawBody: string, hmacHeader: string): Promise<boolean> {
  const secret = Deno.env.get("VIOLET_APP_SECRET");
  if (!secret) {
    throw new Error("Missing VIOLET_APP_SECRET environment variable");
  }

  // Import the App Secret as an HMAC-SHA256 key
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  // Decode the Base64 signature from the header into raw bytes
  const signatureBytes = Uint8Array.from(atob(hmacHeader), (c) => c.charCodeAt(0));

  // Verify using constant-time comparison (built into crypto.subtle.verify)
  return crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(rawBody));
}

/**
 * Extracts and normalizes Violet webhook headers from a Request.
 *
 * HTTP headers are case-insensitive per RFC 7230 — `Request.headers.get()`
 * handles this automatically. We extract into a flat object for Zod validation.
 *
 * The event type comes from `X-Violet-Topic` header (Violet's naming convention
 * for the webhook event type, e.g., "OFFER_ADDED").
 *
 * **Null coalescing to empty string:** `headers.get()` returns `null` for missing
 * headers. We coalesce to `""` so the Zod `.string().min(1)` validator produces
 * a clear "required" error instead of a confusing "expected string, received null".
 *
 * @see L3 code review fix — improved null→empty coercion for clearer Zod errors
 * @returns Object with { hmac, eventId, eventType } ready for Zod validation
 */
export function extractWebhookHeaders(req: Request): {
  hmac: string;
  eventId: string;
  eventType: string;
} {
  return {
    hmac: req.headers.get("x-violet-hmac") ?? "",
    eventId: req.headers.get("x-violet-event-id") ?? "",
    eventType: req.headers.get("x-violet-topic") ?? "",
  };
}
