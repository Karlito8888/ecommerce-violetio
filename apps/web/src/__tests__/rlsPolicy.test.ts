import { describe, it, expect, vi, beforeEach } from "vitest";
import { configureEnv, _resetSupabaseClient, createSupabaseClient } from "@ecommerce/shared";

/**
 * RLS policy integration tests.
 * These tests mock the Supabase client to verify correct RLS behavior patterns.
 * Full integration tests against a live Supabase instance require `supabase start`.
 */

vi.mock("@ecommerce/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ecommerce/shared")>();
  return {
    ...actual,
    createSupabaseClient: vi.fn(),
  };
});

function buildRlsMockSupabase(currentUserId: string) {
  const users: Record<string, { user_id: string; id: string }> = {
    [currentUserId]: { user_id: currentUserId, id: "profile-1" },
    "other-user-uuid": { user_id: "other-user-uuid", id: "profile-2" },
  };

  const from = (table: string) => {
    expect(table).toBe("user_profiles");
    return {
      select: (_cols: string) => ({
        eq: (col: string, val: string) => {
          // Simulate RLS: only return rows where user_id matches the authenticated user
          if (col === "user_id" && val !== currentUserId) {
            return Promise.resolve({ data: [], error: null });
          }
          const row = users[currentUserId];
          return Promise.resolve({ data: row ? [row] : [], error: null });
        },
      }),
      insert: (rows: { user_id: string }[]) => {
        // RLS WITH CHECK: only allow inserting own user_id
        const unauthorized = rows.filter((r) => r.user_id !== currentUserId);
        if (unauthorized.length > 0) {
          return Promise.resolve({
            data: null,
            error: { message: "new row violates row-level security policy" },
          });
        }
        return Promise.resolve({ data: rows, error: null });
      },
    };
  };

  return { from, auth: { getSession: vi.fn(), onAuthStateChange: vi.fn() } };
}

describe("user_profiles RLS policy", () => {
  const myUserId = "anon-user-uuid-1234";

  beforeEach(() => {
    _resetSupabaseClient();
    configureEnv({ SUPABASE_URL: "http://localhost:54321", SUPABASE_ANON_KEY: "test-key" });
    vi.mocked(createSupabaseClient).mockReturnValue(buildRlsMockSupabase(myUserId) as never);
  });

  it("allows anonymous user to read their own profile", async () => {
    const supabase = createSupabaseClient();
    const { data, error } = await (supabase as never as ReturnType<typeof buildRlsMockSupabase>)
      .from("user_profiles")
      .select("*")
      .eq("user_id", myUserId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].user_id).toBe(myUserId);
  });

  it("cannot read another user's profile (RLS enforced)", async () => {
    const supabase = createSupabaseClient();
    const { data } = await (supabase as never as ReturnType<typeof buildRlsMockSupabase>)
      .from("user_profiles")
      .select("*")
      .eq("user_id", "other-user-uuid");

    // RLS returns empty array — no error, just no rows visible
    expect(data).toHaveLength(0);
  });

  it("allows insert with own user_id", async () => {
    const supabase = createSupabaseClient();
    const { error } = await (supabase as never as ReturnType<typeof buildRlsMockSupabase>)
      .from("user_profiles")
      .insert([{ user_id: myUserId }]);

    expect(error).toBeNull();
  });

  it("rejects insert with another user's user_id (RLS WITH CHECK)", async () => {
    const supabase = createSupabaseClient();
    const { error } = await (supabase as never as ReturnType<typeof buildRlsMockSupabase>)
      .from("user_profiles")
      .insert([{ user_id: "other-user-uuid" }]);

    expect(error).not.toBeNull();
    expect(error?.message).toContain("row-level security");
  });
});
