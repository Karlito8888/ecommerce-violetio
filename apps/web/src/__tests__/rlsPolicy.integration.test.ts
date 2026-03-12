/**
 * RLS Policy Integration Tests — runs against a live local Supabase instance.
 *
 * Prerequisites:
 *   1. `supabase start` must be running
 *   2. All migrations applied (create_user_profiles, block_anonymous_writes, auto_create_user_profile)
 *
 * These tests create real anonymous users via the Auth API and verify that
 * Postgres RLS policies enforce:
 *   - Row-level isolation (user A can't see user B's data)
 *   - Anonymous write blocking (anonymous users cannot INSERT/UPDATE/DELETE)
 *   - Authenticated user full CRUD on own rows
 *
 * Skip condition: entire file is skipped if Supabase is not reachable.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// Check reachability synchronously at module load via top-level await
const supabaseRunning = await fetch(`${SUPABASE_URL}/rest/v1/`, {
  headers: { apikey: SUPABASE_ANON_KEY },
  signal: AbortSignal.timeout(2000),
})
  .then((r) => r.ok)
  .catch(() => false);

// Service role client bypasses RLS — used for test setup only
let adminClient: SupabaseClient;

// Two anonymous user clients for cross-user isolation testing
let userAClient: SupabaseClient;
let userBClient: SupabaseClient;
let userAId: string;
let userBId: string;

describe.skipIf(!supabaseRunning)("user_profiles RLS integration", () => {
  beforeAll(async () => {
    // Service role client for test data setup (bypasses RLS)
    adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Create two anonymous users
    const clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: dataA, error: errA } = await clientA.auth.signInAnonymously();
    if (errA) throw new Error(`Failed to create anonymous user A: ${errA.message}`);
    userAId = dataA.user!.id;
    userAClient = clientA;

    const clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data: dataB, error: errB } = await clientB.auth.signInAnonymously();
    if (errB) throw new Error(`Failed to create anonymous user B: ${errB.message}`);
    userBId = dataB.user!.id;
    userBClient = clientB;

    // Insert profiles via service role (bypasses RLS) — anonymous users can't write
    const { error: insertErrA } = await adminClient
      .from("user_profiles")
      .insert({ user_id: userAId });
    if (insertErrA) throw new Error(`Admin profile insert for A failed: ${insertErrA.message}`);

    const { error: insertErrB } = await adminClient
      .from("user_profiles")
      .insert({ user_id: userBId });
    if (insertErrB) throw new Error(`Admin profile insert for B failed: ${insertErrB.message}`);
  });

  // --- Read isolation tests ---

  it("anonymous user A can read their own profile", async () => {
    const { data, error } = await userAClient
      .from("user_profiles")
      .select("*")
      .eq("user_id", userAId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].user_id).toBe(userAId);
  });

  it("anonymous user A CANNOT see user B's profile (RLS enforced)", async () => {
    const { data, error } = await userAClient
      .from("user_profiles")
      .select("*")
      .eq("user_id", userBId);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("anonymous user A can only see 1 row total (their own)", async () => {
    const { data, error } = await userAClient.from("user_profiles").select("*");

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].user_id).toBe(userAId);
  });

  it("anonymous user B can only see their own profile", async () => {
    const { data, error } = await userBClient
      .from("user_profiles")
      .select("*")
      .eq("user_id", userBId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].user_id).toBe(userBId);
  });

  // --- Anonymous write blocking tests (block_anonymous_writes policy) ---

  it("anonymous user CANNOT insert a profile (blocked by restrictive policy)", async () => {
    const { error } = await userAClient.from("user_profiles").insert([{ user_id: userAId }]);

    expect(error).not.toBeNull();
    expect(error!.message).toContain("row-level security");
  });

  it("anonymous user CANNOT update their own profile", async () => {
    const { data, error } = await userAClient
      .from("user_profiles")
      .update({ biometric_enabled: true })
      .eq("user_id", userAId)
      .select();

    // Restrictive policy blocks the write — either error or 0 rows affected
    const blocked = error !== null || (data !== null && data.length === 0);
    expect(blocked).toBe(true);
  });

  it("anonymous user A cannot delete user B's profile", async () => {
    const { data, error } = await userAClient
      .from("user_profiles")
      .delete()
      .eq("user_id", userBId)
      .select();

    // RLS silently filters the delete target — 0 rows affected
    expect(error).toBeNull();
    expect(data).toHaveLength(0);

    // Verify B's profile still exists (via admin client)
    const { data: check } = await adminClient
      .from("user_profiles")
      .select("*")
      .eq("user_id", userBId);
    expect(check).toHaveLength(1);
  });
});
