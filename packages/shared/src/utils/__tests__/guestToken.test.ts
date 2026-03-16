import { describe, it, expect } from "vitest";
import { generateOrderLookupToken, hashOrderLookupToken } from "../guestToken";

describe("generateOrderLookupToken", () => {
  it("returns a base64url-encoded string", () => {
    const token = generateOrderLookupToken();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
    // base64url chars only: A-Z, a-z, 0-9, -, _
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates unique tokens on each call", () => {
    const token1 = generateOrderLookupToken();
    const token2 = generateOrderLookupToken();
    expect(token1).not.toBe(token2);
  });

  it("generates tokens of consistent length (32 bytes → 43 chars base64url)", () => {
    const token = generateOrderLookupToken();
    expect(token.length).toBe(43);
  });
});

describe("hashOrderLookupToken", () => {
  it("returns a 64-character hex string (SHA-256)", () => {
    const hash = hashOrderLookupToken("test-token");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces consistent hashes for the same input", () => {
    const hash1 = hashOrderLookupToken("same-token");
    const hash2 = hashOrderLookupToken("same-token");
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different inputs", () => {
    const hash1 = hashOrderLookupToken("token-a");
    const hash2 = hashOrderLookupToken("token-b");
    expect(hash1).not.toBe(hash2);
  });
});
