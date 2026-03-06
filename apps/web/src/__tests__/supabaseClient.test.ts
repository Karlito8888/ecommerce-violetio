import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseClient, configureEnv, _resetSupabaseClient } from "@ecommerce/shared";

beforeEach(() => {
  _resetSupabaseClient();
  configureEnv({ SUPABASE_URL: "http://localhost:54321", SUPABASE_ANON_KEY: "test-anon-key" });
});

describe("createSupabaseClient", () => {
  it("creates a client with valid env vars", () => {
    const client = createSupabaseClient();
    expect(client).toBeDefined();
    expect(typeof client.auth.signInAnonymously).toBe("function");
  });

  it("returns the same singleton on repeated calls", () => {
    const first = createSupabaseClient();
    const second = createSupabaseClient();
    expect(first).toBe(second);
  });

  it("throws when SUPABASE_ANON_KEY is missing", () => {
    _resetSupabaseClient();
    configureEnv({ SUPABASE_URL: "http://localhost:54321", SUPABASE_ANON_KEY: "" });
    expect(() => createSupabaseClient()).toThrow(
      "Missing required environment variable: SUPABASE_ANON_KEY",
    );
  });

  it("uses LOCAL_SUPABASE_URL when SUPABASE_URL is not set", () => {
    _resetSupabaseClient();
    configureEnv({ SUPABASE_ANON_KEY: "test-key" });
    // Client should be created without throwing
    const client = createSupabaseClient();
    expect(client).toBeDefined();
  });

  it("accepts custom auth storage adapter", () => {
    _resetSupabaseClient();
    const mockStorage = {
      getItem: vi.fn().mockResolvedValue(null),
      setItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
    };
    const client = createSupabaseClient({ storage: mockStorage, detectSessionInUrl: false });
    expect(client).toBeDefined();
  });
});
