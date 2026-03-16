/**
 * Webhook authentication utilities for Violet HMAC signature validation.
 *
 * This module is the security gate for the webhook processing pipeline. It runs
 * as Step 5 in the handle-webhook flow, AFTER header extraction but BEFORE
 * idempotency checks or payload processing.
 *
 * ## How Violet signs webhooks
 *
 * Violet computes HMAC-SHA256 of the raw request body using the App Secret
 * as the key, then Base64-encodes the result and sends it in the
 * `X-Violet-Hmac` header. We recompute the HMAC locally and compare.
 *
 * Algorithm: `Base64(HMAC-SHA256(VIOLET_APP_SECRET, rawRequestBody))`
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
 * The main handler reads `req.text()` first, validates HMAC, then parses.
 *
 * ## Error handling
 *
 * HMAC failure is the ONLY case where handle-webhook returns non-2xx (401).
 * This signals a configuration problem to Violet (wrong app secret).
 * All other errors return 200 to prevent Violet's retry/disable mechanism:
 * - 10 retries over 24 hours with exponential backoff
 * - Auto-disable after 50+ failures in 30 minutes
 * - Permanent disable after 3 rounds of temporary suspension
 *
 * ## Violet webhook headers reference
 *
 * | Header                  | Purpose                                    |
 * |-------------------------|--------------------------------------------|
 * | X-Violet-Hmac           | HMAC-SHA256 signature (Base64)             |
 * | X-Violet-Event-Id       | Unique event ID for idempotency            |
 * | X-Violet-Topic          | Event type (e.g., "ORDER_UPDATED")         |
 * | X-Violet-Bag-Id         | Which bag triggered the event              |
 * | X-Violet-Webhook-Id     | Webhook configuration ID                   |
 * | X-Violet-Entity-Length  | Entity size in bytes                       |
 *
 * @module webhookAuth
 * @see https://docs.violet.io/prism/webhooks/handling-webhooks — HMAC validation
 * @see https://docs.violet.io/prism/webhooks/managing-webhook-headers — Header reference
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
