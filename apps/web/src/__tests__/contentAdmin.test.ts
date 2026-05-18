/**
 * Tests for pure content admin utility functions.
 *
 * isValidSlug, CONTENT_FIELD_GUIDE — pure functions/values from @ecommerce/shared.
 *
 * The Supabase-backed content page tests (getRelatedContent, getContentPages)
 * have been replaced by convex/__tests__/content.test.ts (Convex queries).
 */
import { describe, expect, it } from "vitest";
import { isValidSlug, CONTENT_FIELD_GUIDE } from "@ecommerce/shared";

describe("isValidSlug", () => {
  it("accepts valid slugs", () => {
    expect(isValidSlug("best-running-shoes-2026")).toBe(true);
    expect(isValidSlug("shoe-care-101")).toBe(true);
    expect(isValidSlug("ab")).toBe(true);
    expect(isValidSlug("a1")).toBe(true);
    expect(isValidSlug("top10-picks")).toBe(true);
    expect(isValidSlug("guide-2026")).toBe(true);
  });

  it("rejects slugs with uppercase", () => {
    expect(isValidSlug("Best-Running")).toBe(false);
    expect(isValidSlug("ALLCAPS")).toBe(false);
  });

  it("rejects slugs with spaces", () => {
    expect(isValidSlug("hello world")).toBe(false);
  });

  it("rejects slugs with leading hyphen", () => {
    expect(isValidSlug("-leading")).toBe(false);
  });

  it("rejects slugs with trailing hyphen", () => {
    expect(isValidSlug("trailing-")).toBe(false);
  });

  it("rejects single character slugs", () => {
    expect(isValidSlug("a")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidSlug("")).toBe(false);
  });

  it("rejects slugs with special characters", () => {
    expect(isValidSlug("hello@world")).toBe(false);
    expect(isValidSlug("hello_world")).toBe(false);
  });
});

describe("CONTENT_FIELD_GUIDE", () => {
  it("contains all expected fields", () => {
    expect(CONTENT_FIELD_GUIDE).toHaveProperty("title");
    expect(CONTENT_FIELD_GUIDE).toHaveProperty("slug");
    expect(CONTENT_FIELD_GUIDE).toHaveProperty("body_markdown");
    expect(CONTENT_FIELD_GUIDE).toHaveProperty("type");
    expect(CONTENT_FIELD_GUIDE).toHaveProperty("status");
  });

  it("marks required fields correctly", () => {
    expect(CONTENT_FIELD_GUIDE.title.required).toBe(true);
    expect(CONTENT_FIELD_GUIDE.seoTitle?.required ?? CONTENT_FIELD_GUIDE.seo_title?.required).toBe(
      false,
    );
  });
});
