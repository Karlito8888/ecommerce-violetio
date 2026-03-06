/**
 * Unit tests for auth functions: signUpWithEmail, verifyEmailOtp,
 * setAccountPassword, signInWithEmail, signOut.
 *
 * These test the shared package functions by passing a mock Supabase client.
 * The optional `client` parameter avoids needing to mock the module factory.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  signUpWithEmail,
  verifyEmailOtp,
  setAccountPassword,
  signInWithEmail,
  signOut,
} from "@ecommerce/shared";

interface MockAuth {
  updateUser: Mock;
  verifyOtp: Mock;
  signInWithPassword: Mock;
  signOut: Mock;
}

function buildMockSupabaseClient(): SupabaseClient & { auth: MockAuth } {
  return {
    auth: {
      updateUser: vi.fn(),
      verifyOtp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
  } as unknown as SupabaseClient & { auth: MockAuth };
}

describe("signUpWithEmail", () => {
  let mockClient: ReturnType<typeof buildMockSupabaseClient>;

  beforeEach(() => {
    mockClient = buildMockSupabaseClient();
  });

  it("calls updateUser with email only (step 1 — trigger verification)", async () => {
    const mockData = { user: { id: "uuid-1", is_anonymous: true, email: "a@b.com" } };
    mockClient.auth.updateUser.mockResolvedValue({ data: mockData, error: null });

    const result = await signUpWithEmail("a@b.com", mockClient);

    expect(mockClient.auth.updateUser).toHaveBeenCalledWith({ email: "a@b.com" });
    expect(result.data).toEqual(mockData);
    expect(result.error).toBeNull();
  });

  it("returns error when updateUser fails", async () => {
    const mockError = { code: "email_exists", message: "Email already in use" };
    mockClient.auth.updateUser.mockResolvedValue({ data: null, error: mockError });

    const result = await signUpWithEmail("a@b.com", mockClient);

    expect(result.data).toBeNull();
    expect(result.error).toEqual(mockError);
  });
});

describe("verifyEmailOtp", () => {
  let mockClient: ReturnType<typeof buildMockSupabaseClient>;

  beforeEach(() => {
    mockClient = buildMockSupabaseClient();
  });

  it("calls verifyOtp with email, token, and type email_change", async () => {
    const mockData = { user: { id: "uuid-1", email: "a@b.com" } };
    mockClient.auth.verifyOtp.mockResolvedValue({ data: mockData, error: null });

    const result = await verifyEmailOtp("a@b.com", "123456", mockClient);

    expect(mockClient.auth.verifyOtp).toHaveBeenCalledWith({
      email: "a@b.com",
      token: "123456",
      type: "email_change",
    });
    expect(result.data).toEqual(mockData);
    expect(result.error).toBeNull();
  });

  it("returns error on invalid OTP", async () => {
    const mockError = { code: "otp_expired", message: "Token has expired or is invalid" };
    mockClient.auth.verifyOtp.mockResolvedValue({ data: null, error: mockError });

    const result = await verifyEmailOtp("a@b.com", "000000", mockClient);

    expect(result.error).toEqual(mockError);
  });
});

describe("setAccountPassword", () => {
  let mockClient: ReturnType<typeof buildMockSupabaseClient>;

  beforeEach(() => {
    mockClient = buildMockSupabaseClient();
  });

  it("calls updateUser with password only (step 3 — after verification)", async () => {
    const mockData = { user: { id: "uuid-1", is_anonymous: false } };
    mockClient.auth.updateUser.mockResolvedValue({ data: mockData, error: null });

    const result = await setAccountPassword("password123", mockClient);

    expect(mockClient.auth.updateUser).toHaveBeenCalledWith({ password: "password123" });
    expect(result.data).toEqual(mockData);
    expect(result.error).toBeNull();
  });

  it("returns error when password set fails", async () => {
    const mockError = { message: "Password should be at least 6 characters" };
    mockClient.auth.updateUser.mockResolvedValue({ data: null, error: mockError });

    const result = await setAccountPassword("short", mockClient);

    expect(result.error).toEqual(mockError);
  });
});

describe("signInWithEmail", () => {
  let mockClient: ReturnType<typeof buildMockSupabaseClient>;

  beforeEach(() => {
    mockClient = buildMockSupabaseClient();
  });

  it("calls signInWithPassword with email and password", async () => {
    const mockData = { session: { access_token: "tok" }, user: { id: "uuid-1" } };
    mockClient.auth.signInWithPassword.mockResolvedValue({ data: mockData, error: null });

    const result = await signInWithEmail("a@b.com", "password123", mockClient);

    expect(mockClient.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "a@b.com",
      password: "password123",
    });
    expect(result.data).toEqual(mockData);
    expect(result.error).toBeNull();
  });

  it("returns error on invalid credentials", async () => {
    const mockError = { code: "invalid_credentials", message: "Invalid login credentials" };
    mockClient.auth.signInWithPassword.mockResolvedValue({ data: null, error: mockError });

    const result = await signInWithEmail("a@b.com", "wrong", mockClient);

    expect(result.data).toBeNull();
    expect(result.error).toEqual(mockError);
  });
});

describe("signOut", () => {
  let mockClient: ReturnType<typeof buildMockSupabaseClient>;

  beforeEach(() => {
    mockClient = buildMockSupabaseClient();
  });

  it("calls supabase.auth.signOut", async () => {
    mockClient.auth.signOut.mockResolvedValue({ error: null });

    const result = await signOut(mockClient);

    expect(mockClient.auth.signOut).toHaveBeenCalled();
    expect(result.error).toBeNull();
  });

  it("returns error when signOut fails", async () => {
    const mockError = { code: "session_error", message: "Session not found" };
    mockClient.auth.signOut.mockResolvedValue({ error: mockError });

    const result = await signOut(mockClient);

    expect(result.error).toEqual(mockError);
  });
});
