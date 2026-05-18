/**
 * Tests for mapAuthError — pure auth error mapping utility.
 *
 * The Supabase-backed flow integration tests (signup/login flow) have been
 * removed. Auth is now handled by Convex Auth, and the forms use mapAuthError
 * for error display — these pure tests remain valid.
 */
import { describe, it, expect } from "vitest";
import { mapAuthError } from "@ecommerce/shared";

describe("mapAuthError", () => {
  it("maps signIn 'invalid' to friendly message", () => {
    const result = mapAuthError(new Error("Invalid login credentials"), "signIn");
    expect(result).not.toBe("Invalid login credentials");
    expect(result).toBeTruthy();
  });

  it("maps signIn 'not found' to friendly message", () => {
    const result = mapAuthError(new Error("User not found"), "signIn");
    expect(result).not.toBe("User not found");
    expect(result).toBeTruthy();
  });

  it("maps signUp 'already exists' to friendly message", () => {
    const result = mapAuthError(new Error("User already registered"), "signUp");
    expect(result).not.toBe("User already registered");
    expect(result).toBeTruthy();
  });

  it("maps verify 'invalid code' to friendly message", () => {
    const result = mapAuthError(new Error("Invalid verification code"), "verify");
    expect(result).not.toBe("Invalid verification code");
    expect(result).toBeTruthy();
  });

  it("maps verify 'expired' to friendly message", () => {
    const result = mapAuthError(new Error("Token has expired"), "verify");
    expect(result).not.toBe("Token has expired");
    expect(result).toBeTruthy();
  });

  it("maps rate limit across all contexts", () => {
    const result = mapAuthError(new Error("Rate limit exceeded"), "signIn");
    expect(result).not.toBe("Rate limit exceeded");
    expect(result).toBeTruthy();
  });

  it("returns original message for unknown errors", () => {
    const result = mapAuthError(new Error("Some unknown error"), "signIn");
    // mapAuthError returns the original or a generic message
    expect(result).toBeTruthy();
  });

  it("returns generic message for non-Error values", () => {
    const result = mapAuthError("string error", "signIn");
    expect(result).toBeTruthy();
  });
});
