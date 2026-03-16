// Server-only — do not import from client-side code
import { randomBytes, createHash } from "node:crypto";

/** Generate a cryptographically random order lookup token */
export function generateOrderLookupToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Hash token with SHA-256 for storage (only hash is stored in DB) */
export function hashOrderLookupToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
