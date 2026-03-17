/** User profile types for the user_profiles Supabase table (Story 6.1). */

/** Row shape from the user_profiles table after Story 6.1 migration. */
export interface UserProfile {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  preferences: UserPreferences;
  biometric_enabled: boolean;
  created_at: string;
  updated_at: string;
}

/** JSON shape stored in user_profiles.preferences column. */
export interface UserPreferences {
  theme?: "light" | "dark" | "system";
  newsletter_opt_in?: boolean;
  /** Personalized search results toggle (Story 6.3). Default: true (undefined = true). */
  personalized_search?: boolean;
}

/** Payload for updating profile fields via updateProfile(). */
export interface UpdateProfilePayload {
  display_name?: string | null;
  avatar_url?: string | null;
  preferences?: Partial<UserPreferences>;
}
