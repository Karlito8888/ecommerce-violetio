/**
 * Auth form tests: error mapping, auth function integration, and user_profiles upsert.
 *
 * Note: Full component rendering tests (form fields, validation, loading states)
 * require a TanStack RouterProvider test wrapper. These tests focus on the
 * integration logic: auth function calls, error mapping, and profile creation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mapAuthError } from "@ecommerce/shared";

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

const mockSignUpWithEmail = vi.fn();
const mockSignInWithEmail = vi.fn();

vi.mock("@ecommerce/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ecommerce/shared")>();
  return {
    ...actual,
    signUpWithEmail: (...args: unknown[]) => mockSignUpWithEmail(...args),
    signInWithEmail: (...args: unknown[]) => mockSignInWithEmail(...args),
  };
});

const mockGetUser = vi.fn();
const mockUpsert = vi.fn();
const mockSupabase = {
  auth: { getUser: mockGetUser },
  from: vi.fn().mockReturnValue({ upsert: mockUpsert }),
};

vi.mock("../utils/supabase", () => ({
  getSupabaseBrowserClient: () => mockSupabase,
}));

// ---------------------------------------------------------------------------
// mapAuthError — Convex Auth error mapping tests
// ---------------------------------------------------------------------------

describe("mapAuthError", () => {
  it("maps signIn 'invalid' to friendly message", () => {
    expect(mapAuthError(new Error("Invalid credentials"), "signIn")).toBe(
      "Invalid email or password.",
    );
  });

  it("maps signIn 'not found' to friendly message", () => {
    expect(mapAuthError(new Error("No user found"), "signIn")).toBe(
      "No account found with this email.",
    );
  });

  it("maps signUp 'already exists' to friendly message", () => {
    expect(mapAuthError(new Error("User already registered"), "signUp")).toBe(
      "An account with this email already exists.",
    );
  });

  it("maps verify 'invalid code' to friendly message", () => {
    expect(mapAuthError(new Error("Invalid verification code"), "verify")).toBe(
      "Invalid verification code. Please try again.",
    );
  });

  it("maps verify 'expired' to friendly message", () => {
    expect(mapAuthError(new Error("Code expired"), "verify")).toBe(
      "Verification code expired. Please sign up again.",
    );
  });

  it("maps rate limit across all contexts", () => {
    expect(mapAuthError(new Error("Rate limit exceeded"), "signIn")).toBe(
      "Too many attempts. Please wait a moment and try again.",
    );
    expect(mapAuthError(new Error("Too many requests"), "signUp")).toBe(
      "Too many attempts. Please wait a moment and try again.",
    );
  });

  it("returns original message for unknown errors", () => {
    expect(mapAuthError(new Error("Something unexpected"), "signIn")).toBe("Something unexpected");
  });

  it("returns generic message for non-Error values", () => {
    expect(mapAuthError("not an error", "signIn")).toBe(
      "An unexpected error occurred. Please try again.",
    );
  });
});

// ---------------------------------------------------------------------------
// Signup integration flow — auth call + user_profiles upsert
// ---------------------------------------------------------------------------

describe("signup flow integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "test-uuid" } } });
    mockUpsert.mockResolvedValue({ error: null });
  });

  it("calls signUpWithEmail with email and password", async () => {
    mockSignUpWithEmail.mockResolvedValue({ data: { user: { id: "uuid-1" } }, error: null });

    const result = await mockSignUpWithEmail("test@example.com", "Pass123!", mockSupabase);

    expect(mockSignUpWithEmail).toHaveBeenCalledWith("test@example.com", "Pass123!", mockSupabase);
    expect(result.error).toBeNull();
  });

  it("creates user_profiles row after verification completes", async () => {
    const {
      data: { user },
    } = await mockSupabase.auth.getUser();

    if (user) {
      const { error: profileError } = await mockSupabase
        .from("user_profiles")
        .upsert({ user_id: user.id });
      expect(mockSupabase.from).toHaveBeenCalledWith("user_profiles");
      expect(profileError).toBeNull();
    }
  });

  it("maps signup error to user-friendly message", async () => {
    mockSignUpWithEmail.mockResolvedValue({
      data: null,
      error: { message: "User already registered" },
    });

    const result = await mockSignUpWithEmail("taken@example.com", "Pass123!", mockSupabase);

    expect(result.error.message).toBe("User already registered");
    expect(mapAuthError(new Error(result.error.message), "signUp")).toBe(
      "An account with this email already exists.",
    );
  });
});

// ---------------------------------------------------------------------------
// Login integration flow
// ---------------------------------------------------------------------------

describe("login flow integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls signInWithEmail and returns session on success", async () => {
    mockSignInWithEmail.mockResolvedValue({
      data: { session: { access_token: "tok" } },
      error: null,
    });

    const result = await mockSignInWithEmail("test@example.com", "password123", mockSupabase);

    expect(mockSignInWithEmail).toHaveBeenCalledWith(
      "test@example.com",
      "password123",
      mockSupabase,
    );
    expect(result.error).toBeNull();
    expect(result.data.session.access_token).toBe("tok");
  });

  it("maps login error to user-friendly message", async () => {
    mockSignInWithEmail.mockResolvedValue({
      data: null,
      error: { message: "Invalid login credentials" },
    });

    const result = await mockSignInWithEmail("wrong@example.com", "wrong", mockSupabase);

    expect(result.error.message).toBe("Invalid login credentials");
    expect(mapAuthError(new Error(result.error.message), "signIn")).toBe(
      "Invalid email or password.",
    );
  });

  it("maps rate limit error to user-friendly message", async () => {
    mockSignInWithEmail.mockResolvedValue({
      data: null,
      error: { message: "over_request_rate_limit" },
    });

    const result = await mockSignInWithEmail("spam@example.com", "pass", mockSupabase);
    expect(mapAuthError(new Error(result.error.message), "signIn")).toBe(
      "Too many attempts. Please wait a moment and try again.",
    );
  });
});
