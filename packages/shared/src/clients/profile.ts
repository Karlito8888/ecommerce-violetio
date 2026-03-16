import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseClient } from "./supabase.js";
import type { UserProfile, UpdateProfilePayload } from "../types/profile.types.js";

/**
 * Fetches the profile for the given user.
 * Returns null if no profile row exists (should not happen — trigger auto-creates).
 */
export async function getProfile(
  userId: string,
  client?: SupabaseClient,
): Promise<UserProfile | null> {
  const supabase = client ?? createSupabaseClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // row not found
    throw error;
  }
  return data as UserProfile;
}

/**
 * Updates profile fields for the given user. Merges preferences with existing
 * values so callers can send partial preference updates.
 */
export async function updateProfile(
  userId: string,
  payload: UpdateProfilePayload,
  client?: SupabaseClient,
): Promise<UserProfile> {
  const supabase = client ?? createSupabaseClient();

  const updateData: Record<string, unknown> = {};
  if (payload.display_name !== undefined) updateData.display_name = payload.display_name;
  if (payload.avatar_url !== undefined) updateData.avatar_url = payload.avatar_url;

  if (payload.preferences !== undefined) {
    const { data: current } = await supabase
      .from("user_profiles")
      .select("preferences")
      .eq("user_id", userId)
      .single();

    updateData.preferences = {
      ...((current?.preferences as object) ?? {}),
      ...payload.preferences,
    };
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .update(updateData)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return data as UserProfile;
}
