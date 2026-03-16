import type { SupabaseClient } from "@supabase/supabase-js";
import type { ErrorLogEntry } from "../types/error.types.js";

/**
 * Logs an error to the Supabase `error_logs` table.
 *
 * Fire-and-forget — never throws, never blocks the user flow.
 * Uses service-role client for INSERT (error_logs RLS requires service_role).
 */
export async function logError(supabase: SupabaseClient, entry: ErrorLogEntry): Promise<void> {
  try {
    await supabase.from("error_logs").insert(entry);
  } catch {
    // Last-resort: log to console if Supabase write fails
    // eslint-disable-next-line no-console
    console.error("[errorLogger] Failed to persist error:", entry);
  }
}
