/**
 * Guest order lookup token utilities.
 *
 * **Server-only module** — imports `node:crypto`, which is not available in
 * browser bundles. Do not import from client-side code.
 *
 * ## Purpose
 * Guest buyers (no Supabase Auth account) need a way to look up their order
 * after checkout. We generate a cryptographically random token, show it once
 * on the confirmation page, and store only the SHA-256 hash in the database.
 *
 * ## Security model
 * - Token: 32 random bytes encoded as base64url (43 characters, ~256 bits entropy)
 * - Storage: Only the SHA-256 hex digest is persisted in `orders.order_lookup_token_hash`
 * - Lookup: Guest provides token → we hash it → compare with stored hash
 * - The plaintext token is returned exactly once in {@link PersistOrderResult}
 *   and is never logged or stored server-side
 *
 * ## Flow
 * 1. {@link persistOrder} calls {@link generateOrderLookupToken} for guest orders
 * 2. Hash is stored in the `orders` table via {@link hashOrderLookupToken}
 * 3. Plaintext token is returned to the client and displayed on confirmation page
 * 4. Guest uses token + email to look up their order (Story 5.4)
 *
 * @module guestToken
 * @see {@link persistOrder} — the consumer of these utilities
 */
/**
 * Generates a cryptographically random order lookup token for guest checkouts.
 *
 * Uses the Web Crypto API (`crypto.getRandomValues`) for 256 bits of entropy,
 * encoded as base64url (URL-safe, no padding) for safe display and transmission.
 * Works in Node 18+, browsers, Deno, and edge runtimes — no `node:` import.
 *
 * @returns A 43-character base64url-encoded random token
 */
export function generateOrderLookupToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // Manual base64url encoding to avoid Node-specific Buffer
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Hashes a guest lookup token with SHA-256 for secure storage.
 *
 * Only the hash is persisted in `orders.order_lookup_token_hash` — if the
 * database is compromised, the attacker cannot derive the original token.
 *
 * Uses the Web Crypto API (`crypto.subtle.digest`) — works everywhere.
 *
 * @param token - The plaintext base64url token from {@link generateOrderLookupToken}
 * @returns SHA-256 hex digest (64 lowercase hex characters)
 */
export async function hashOrderLookupToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
