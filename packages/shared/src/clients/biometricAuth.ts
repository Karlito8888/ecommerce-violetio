import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseClient } from "./supabase.js";

/**
 * Reads the biometric_enabled preference from user_profiles.
 * Returns false if no profile row exists.
 */
export async function getBiometricPreference(
  userId: string,
  client?: SupabaseClient,
): Promise<boolean> {
  const supabase = client ?? createSupabaseClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("biometric_enabled")
    .eq("user_id", userId)
    .single();

  if (error || !data) return false;
  return data.biometric_enabled;
}

/**
 * Updates the biometric_enabled flag in user_profiles.
 * Creates the profile row if it doesn't exist (upsert).
 */
export async function setBiometricPreference(
  userId: string,
  enabled: boolean,
  client?: SupabaseClient,
): Promise<{ error: string | null }> {
  const supabase = client ?? createSupabaseClient();
  const { error } = await supabase
    .from("user_profiles")
    .upsert({ user_id: userId, biometric_enabled: enabled }, { onConflict: "user_id" });

  return { error: error?.message ?? null };
}
