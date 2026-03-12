/**
 * Service role Supabase client for Edge Functions.
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY to bypass RLS for write operations
 * (e.g., upserting embeddings into product_embeddings table).
 *
 * SECURITY: This client has full database access — only use in
 * server-side Edge Functions, never expose to clients.
 */

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

let _client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables");
  }

  _client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  return _client;
}
