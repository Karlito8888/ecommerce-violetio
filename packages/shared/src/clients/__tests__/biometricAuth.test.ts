import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase module before importing
vi.mock("../supabase.js", () => ({
  createSupabaseClient: vi.fn(),
}));

import { getBiometricPreference, setBiometricPreference } from "../biometricAuth.js";
import { createSupabaseClient } from "../supabase.js";

function createMockClient(overrides?: {
  selectData?: Record<string, unknown> | null;
  selectError?: { message: string } | null;
  upsertError?: { message: string } | null;
}) {
  const singleFn = vi.fn().mockResolvedValue({
    data: overrides?.selectData ?? null,
    error: overrides?.selectError ?? null,
  });
  const eqFn = vi.fn().mockReturnValue({ single: singleFn });
  const selectFn = vi.fn().mockReturnValue({ eq: eqFn });
  const upsertFn = vi.fn().mockResolvedValue({
    error: overrides?.upsertError ?? null,
  });

  return {
    from: vi.fn().mockReturnValue({
      select: selectFn,
      upsert: upsertFn,
    }),
    _internal: { selectFn, eqFn, singleFn, upsertFn },
  };
}

describe("getBiometricPreference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when biometric_enabled is true in profile", async () => {
    const mockClient = createMockClient({
      selectData: { biometric_enabled: true },
    });

    const result = await getBiometricPreference("user-123", mockClient as never);

    expect(result).toBe(true);
    expect(mockClient.from).toHaveBeenCalledWith("user_profiles");
  });

  it("returns false when biometric_enabled is false in profile", async () => {
    const mockClient = createMockClient({
      selectData: { biometric_enabled: false },
    });

    const result = await getBiometricPreference("user-123", mockClient as never);

    expect(result).toBe(false);
  });

  it("returns false when no profile row exists", async () => {
    const mockClient = createMockClient({
      selectData: null,
      selectError: { message: "Row not found" },
    });

    const result = await getBiometricPreference("user-123", mockClient as never);

    expect(result).toBe(false);
  });

  it("uses shared client when no client provided", async () => {
    const mockClient = createMockClient({ selectData: { biometric_enabled: false } });
    vi.mocked(createSupabaseClient).mockReturnValue(mockClient as never);

    await getBiometricPreference("user-123");

    expect(createSupabaseClient).toHaveBeenCalled();
  });
});

describe("setBiometricPreference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts biometric_enabled=true and returns no error", async () => {
    const mockClient = createMockClient();

    const result = await setBiometricPreference("user-123", true, mockClient as never);

    expect(result.error).toBeNull();
    expect(mockClient.from).toHaveBeenCalledWith("user_profiles");
    expect(mockClient._internal.upsertFn).toHaveBeenCalledWith(
      { user_id: "user-123", biometric_enabled: true },
      { onConflict: "user_id" },
    );
  });

  it("upserts biometric_enabled=false", async () => {
    const mockClient = createMockClient();

    const result = await setBiometricPreference("user-123", false, mockClient as never);

    expect(result.error).toBeNull();
  });

  it("returns error message on Supabase failure", async () => {
    const mockClient = createMockClient({
      upsertError: { message: "RLS violation" },
    });

    const result = await setBiometricPreference("user-123", true, mockClient as never);

    expect(result.error).toBe("RLS violation");
  });

  it("uses shared client when no client provided", async () => {
    const mockClient = createMockClient();
    vi.mocked(createSupabaseClient).mockReturnValue(mockClient as never);

    await setBiometricPreference("user-123", true);

    expect(createSupabaseClient).toHaveBeenCalled();
  });
});
