import type { SupabaseClient } from "@supabase/supabase-js";
import type { ErrorLogEntry } from "../types/error.types.js";

/**
 * Logs an error to the Supabase `error_logs` table.
 *
 * Fire-and-forget — never throws, never blocks the user flow.
 * Uses service-role client for INSERT (error_logs RLS requires service_role).
 *
 * ## Two-layer error handling
 * Supabase client methods return errors in `{ error }` without throwing,
 * so a failed INSERT won't trigger the catch block. We must check both:
 * 1. The `{ error }` return value for Supabase-level failures (RLS, constraint violations)
 * 2. The try/catch for actual thrown exceptions (network errors, client misconfiguration)
 */
export async function logError(supabase: SupabaseClient, entry: ErrorLogEntry): Promise<void> {
  try {
    const { error } = await supabase.from("error_logs").insert(entry);
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[errorLogger] Insert failed:", error.message, "— Original entry:", entry);
    }
  } catch {
    // Last-resort: log to console if Supabase client throws (network error, etc.)
    // eslint-disable-next-line no-console
    console.error("[errorLogger] Failed to persist error:", entry);
  }
}
