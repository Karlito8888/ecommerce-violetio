/**
 * RLS Policy Integration Tests — runs against a live local Supabase instance.
 *
 * Prerequisites:
 *   1. `supabase start` must be running
 *   2. Migration 20260306000000_create_user_profiles.sql must be applied
 *
 * These tests create real anonymous users via the Auth API and verify that
 * Postgres RLS policies enforce row-level isolation on user_profiles.
 *
 * Skip condition: tests are skipped if Supabase is not reachable.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
let supabaseRunning = false;

// Two anonymous user clients for cross-user isolation testing
let userAClient: SupabaseClient;
let userBClient: SupabaseClient;
let userAId: string;
let userBId: string;

async function isSupabaseReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  supabaseRunning = await isSupabaseReachable();
  if (!supabaseRunning) return;

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

  // Each user inserts their own profile (allowed by RLS USING + WITH CHECK)
  const { error: insertErrA } = await userAClient
    .from("user_profiles")
    .insert({ user_id: userAId });
  if (insertErrA) throw new Error(`User A profile insert failed: ${insertErrA.message}`);

  const { error: insertErrB } = await userBClient
    .from("user_profiles")
    .insert({ user_id: userBId });
  if (insertErrB) throw new Error(`User B profile insert failed: ${insertErrB.message}`);
});

describe.runIf(() => supabaseRunning)("user_profiles RLS integration", () => {
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

    // RLS silently filters — no error, but no rows returned
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

  it("anonymous user A cannot insert a profile with user B's user_id (RLS WITH CHECK)", async () => {
    const { error } = await userAClient.from("user_profiles").insert([{ user_id: userBId }]);

    expect(error).not.toBeNull();
    expect(error!.message).toContain("row-level security");
  });

  it("anonymous user A cannot update user B's profile", async () => {
    const { data, error } = await userAClient
      .from("user_profiles")
      .update({ updated_at: new Date().toISOString() })
      .eq("user_id", userBId)
      .select();

    // RLS silently filters the update target — 0 rows affected, no error
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
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

    // Verify B's profile still exists (via B's own client, which can see their row)
    const { data: check } = await userBClient
      .from("user_profiles")
      .select("*")
      .eq("user_id", userBId);
    expect(check).toHaveLength(1);
  });
});
