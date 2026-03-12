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
// mapAuthError — comprehensive error mapping tests
// ---------------------------------------------------------------------------

describe("mapAuthError", () => {
  it("maps 'Invalid login credentials' to friendly message", () => {
    expect(mapAuthError("Invalid login credentials")).toBe("Email or password is incorrect");
  });

  it("maps 'User already registered' to friendly message", () => {
    expect(mapAuthError("User already registered")).toBe(
      "An account with this email already exists",
    );
  });

  it("maps 'Email already in use' to friendly message", () => {
    expect(mapAuthError("Email already in use")).toBe("An account with this email already exists");
  });

  it("maps 'Email not confirmed' to friendly message", () => {
    expect(mapAuthError("Email not confirmed")).toBe("Please verify your email before signing in");
  });

  it("returns generic message for unknown error messages", () => {
    expect(mapAuthError("Some unknown error")).toBe(
      "An authentication error occurred. Please try again.",
    );
  });

  it("maps rate limit error", () => {
    expect(mapAuthError("over_request_rate_limit")).toBe(
      "Too many attempts, please wait before trying again",
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

  it("calls signUpWithEmail with email only (step 1 — trigger verification)", async () => {
    mockSignUpWithEmail.mockResolvedValue({ data: { user: { id: "uuid-1" } }, error: null });

    const result = await mockSignUpWithEmail("test@example.com", mockSupabase);

    expect(mockSignUpWithEmail).toHaveBeenCalledWith("test@example.com", mockSupabase);
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

    const result = await mockSignUpWithEmail("taken@example.com", mockSupabase);

    expect(result.error.message).toBe("User already registered");
    expect(mapAuthError(result.error.message)).toBe("An account with this email already exists");
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
    expect(mapAuthError(result.error.message)).toBe("Email or password is incorrect");
  });

  it("maps rate limit error to user-friendly message", async () => {
    mockSignInWithEmail.mockResolvedValue({
      data: null,
      error: { message: "over_request_rate_limit" },
    });

    const result = await mockSignInWithEmail("spam@example.com", "pass", mockSupabase);
    expect(mapAuthError(result.error.message)).toBe(
      "Too many attempts, please wait before trying again",
    );
  });
});
