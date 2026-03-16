import { z } from "zod";

/** Validates display_name: 1-100 chars, trimmed, or null. */
export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Display name cannot be empty")
  .max(100, "Display name must be 100 characters or less")
  .nullable()
  .optional();

/** Validates avatar_url: valid URL, max 500 chars, or null. */
export const avatarUrlSchema = z
  .string()
  .url("Must be a valid URL")
  .max(500, "URL too long")
  .nullable()
  .optional();

/** Validates the preferences JSONB shape. */
export const userPreferencesSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  newsletter_opt_in: z.boolean().optional(),
});

/** Validates the updateProfile payload (all fields optional). */
export const updateProfileSchema = z.object({
  display_name: displayNameSchema,
  avatar_url: avatarUrlSchema,
  preferences: userPreferencesSchema.partial().optional(),
});
