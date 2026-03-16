import { describe, it, expect } from "vitest";
import {
  displayNameSchema,
  avatarUrlSchema,
  updateProfileSchema,
  userPreferencesSchema,
} from "@ecommerce/shared";

describe("profile schemas", () => {
  describe("displayNameSchema", () => {
    it("accepts a valid display name", () => {
      const result = displayNameSchema.safeParse("Alice");
      expect(result.success).toBe(true);
    });

    it("accepts null", () => {
      const result = displayNameSchema.safeParse(null);
      expect(result.success).toBe(true);
    });

    it("trims whitespace", () => {
      const result = displayNameSchema.safeParse("  Alice  ");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("Alice");
      }
    });

    it("rejects empty string after trim", () => {
      const result = displayNameSchema.safeParse("   ");
      expect(result.success).toBe(false);
    });

    it("accepts exactly 100 characters", () => {
      const name = "a".repeat(100);
      const result = displayNameSchema.safeParse(name);
      expect(result.success).toBe(true);
    });

    it("rejects 101 characters", () => {
      const name = "a".repeat(101);
      const result = displayNameSchema.safeParse(name);
      expect(result.success).toBe(false);
    });
  });

  describe("avatarUrlSchema", () => {
    it("accepts a valid URL", () => {
      const result = avatarUrlSchema.safeParse("https://example.com/avatar.jpg");
      expect(result.success).toBe(true);
    });

    it("accepts null", () => {
      const result = avatarUrlSchema.safeParse(null);
      expect(result.success).toBe(true);
    });

    it("rejects an invalid URL", () => {
      const result = avatarUrlSchema.safeParse("not-a-url");
      expect(result.success).toBe(false);
    });

    it("rejects a URL exceeding 500 characters", () => {
      const url = "https://example.com/" + "a".repeat(500);
      const result = avatarUrlSchema.safeParse(url);
      expect(result.success).toBe(false);
    });
  });

  describe("userPreferencesSchema", () => {
    it("accepts valid preferences", () => {
      const result = userPreferencesSchema.safeParse({
        theme: "dark",
        newsletter_opt_in: true,
      });
      expect(result.success).toBe(true);
    });

    it("accepts empty object", () => {
      const result = userPreferencesSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("rejects invalid theme value", () => {
      const result = userPreferencesSchema.safeParse({ theme: "neon" });
      expect(result.success).toBe(false);
    });
  });

  describe("updateProfileSchema", () => {
    it("accepts a valid full payload", () => {
      const result = updateProfileSchema.safeParse({
        display_name: "Alice",
        avatar_url: "https://example.com/pic.jpg",
        preferences: { theme: "system" },
      });
      expect(result.success).toBe(true);
    });

    it("accepts an empty payload (all optional)", () => {
      const result = updateProfileSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("rejects display_name exceeding 100 chars", () => {
      const result = updateProfileSchema.safeParse({
        display_name: "x".repeat(101),
      });
      expect(result.success).toBe(false);
    });

    it("accepts null display_name and avatar_url", () => {
      const result = updateProfileSchema.safeParse({
        display_name: null,
        avatar_url: null,
      });
      expect(result.success).toBe(true);
    });
  });
});
