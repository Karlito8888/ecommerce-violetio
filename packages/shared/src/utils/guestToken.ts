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
import { randomBytes, createHash } from "node:crypto";

/**
 * Generates a cryptographically random order lookup token for guest checkouts.
 *
 * Uses `node:crypto.randomBytes(32)` for 256 bits of entropy, encoded as
 * base64url (URL-safe, no padding) for safe display and transmission.
 *
 * @returns A 43-character base64url-encoded random token
 */
export function generateOrderLookupToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Hashes a guest lookup token with SHA-256 for secure storage.
 *
 * Only the hash is persisted in `orders.order_lookup_token_hash` — if the
 * database is compromised, the attacker cannot derive the original token.
 *
 * @param token - The plaintext base64url token from {@link generateOrderLookupToken}
 * @returns SHA-256 hex digest (64 lowercase hex characters)
 */
export function hashOrderLookupToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
