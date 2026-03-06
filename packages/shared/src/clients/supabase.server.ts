import { createClient, SupabaseClient } from "@supabase/supabase-js";

import { getEnvVar, LOCAL_SUPABASE_URL, requireEnvVar } from "./supabase.js";

let _serviceRoleClient: SupabaseClient | null = null;

/**
 * Server-only client that bypasses Row-Level Security.
 * Never import this in client-side (browser/mobile) code.
 */
export function getServiceRoleClient(): SupabaseClient {
  if (typeof document !== "undefined") {
    throw new Error(
      "getServiceRoleClient is server-only. " +
        "The service role key bypasses RLS and must never be exposed to clients.",
    );
  }

  if (_serviceRoleClient) return _serviceRoleClient;

  const url = getEnvVar("SUPABASE_URL") || LOCAL_SUPABASE_URL;
  const key = requireEnvVar("SUPABASE_SERVICE_ROLE_KEY");

  _serviceRoleClient = createClient(url, key);
  return _serviceRoleClient;
}
