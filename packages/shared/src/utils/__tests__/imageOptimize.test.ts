import { describe, it, expect } from "vitest";
import {
  optimizeImageUrl,
  optimizeWithPreset,
  IMAGE_PRESETS,
} from "../imageOptimize.js";

// ─── optimizeImageUrl ──────────────────────────────────────────────────

describe("optimizeImageUrl", () => {
  // ─── Null / empty / no options ────────────────────────────────────

  it("returns null for null input", () => {
    expect(optimizeImageUrl(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(optimizeImageUrl(undefined)).toBeNull();
  });

  it("returns empty string for empty string input", () => {
    expect(optimizeImageUrl("")).toBeNull();
  });

  it("returns original URL when no options provided", () => {
    const url = "https://cdn.shopify.com/some/image.jpeg";
    expect(optimizeImageUrl(url)).toBe(url);
  });

  it("returns original URL when options are empty", () => {
    const url = "https://cdn.shopify.com/some/image.jpeg";
    expect(optimizeImageUrl(url, {})).toBe(url);
  });

  // ─── Shopify CDN ─────────────────────────────────────────────────

  it("adds width and height to Shopify CDN URL", () => {
    const result = optimizeImageUrl(
      "https://cdn.shopify.com/some/image.jpeg",
      { width: 300, height: 400 },
    );
    expect(result).toBe(
      "https://cdn.shopify.com/some/image.jpeg?width=300&height=400",
    );
  });

  it("adds only width to Shopify CDN URL", () => {
    const result = optimizeImageUrl(
      "https://cdn.shopify.com/some/image.jpeg",
      { width: 300 },
    );
    expect(result).toBe(
      "https://cdn.shopify.com/some/image.jpeg?width=300",
    );
  });

  it("preserves existing query params on Shopify URL", () => {
    const result = optimizeImageUrl(
      "https://cdn.shopify.com/some/image.jpeg?v=123",
      { width: 300, height: 400 },
    );
    expect(result).toBe(
      "https://cdn.shopify.com/some/image.jpeg?v=123&width=300&height=400",
    );
  });

  it("overwrites existing width/height params on Shopify URL", () => {
    const result = optimizeImageUrl(
      "https://cdn.shopify.com/some/image.jpeg?width=100&height=100",
      { width: 300, height: 400 },
    );
    expect(result).toBe(
      "https://cdn.shopify.com/some/image.jpeg?width=300&height=400",
    );
  });

  it("handles cdn2.shopify.io domain", () => {
    const result = optimizeImageUrl(
      "https://cdn2.shopify.io/some/image.jpeg",
      { width: 200 },
    );
    expect(result).toContain("width=200");
  });

  // ─── Cloudinary CDN ──────────────────────────────────────────────

  it("inserts dimensions after /upload/ in Cloudinary URL", () => {
    const result = optimizeImageUrl(
      "https://res.cloudinary.com/violetlocal/image/upload/v1691555244/offer_media/10116.jpg",
      { width: 100, height: 150 },
    );
    expect(result).toBe(
      "https://res.cloudinary.com/violetlocal/image/upload/w_100,h_150/v1691555244/offer_media/10116.jpg",
    );
  });

  it("prepends dimensions to existing Cloudinary transforms", () => {
    const result = optimizeImageUrl(
      "https://res.cloudinary.com/violetlocal/image/upload/c_limit,f_auto/v1691555244/offer_media/10116.jpg",
      { width: 100, height: 150 },
    );
    expect(result).toBe(
      "https://res.cloudinary.com/violetlocal/image/upload/w_100,h_150,c_limit,f_auto/v1691555244/offer_media/10116.jpg",
    );
  });

  // ─── Swell CDN ───────────────────────────────────────────────────

  it("adds width and height to Swell CDN URL", () => {
    const result = optimizeImageUrl(
      "https://cdn.schema.io/violet/some/image.jpeg",
      { width: 100, height: 150 },
    );
    expect(result).toBe(
      "https://cdn.schema.io/violet/some/image.jpeg?width=100&height=150",
    );
  });

  // ─── Wix CDN ─────────────────────────────────────────────────────

  it("inserts dimensions in Wix /fit/ URL", () => {
    const result = optimizeImageUrl(
      "https://static.wixstatic.com/media/abc123/v1/fit/w_999,h_999/file.jpg",
      { width: 100, height: 150 },
    );
    expect(result).toBe(
      "https://static.wixstatic.com/media/abc123/v1/fit/w_100,h_150/file.jpg",
    );
  });

  // ─── Unsupported platforms ────────────────────────────────────────

  it("returns original URL for unsupported platforms", () => {
    const url = "https://cdn.bigcommerce.com/some/image.jpeg";
    expect(optimizeImageUrl(url, { width: 300 })).toBe(url);
  });

  it("returns original URL for unknown domains", () => {
    const url = "https://example.com/image.jpeg";
    expect(optimizeImageUrl(url, { width: 300 })).toBe(url);
  });

  // ─── Invalid URLs ────────────────────────────────────────────────

  it("returns original string for unparseable URL", () => {
    const url = "not-a-valid-url";
    expect(optimizeImageUrl(url, { width: 300 })).toBe(url);
  });
});

// ─── optimizeWithPreset ────────────────────────────────────────────────

describe("optimizeWithPreset", () => {
  it("applies productCard preset to Shopify URL", () => {
    const result = optimizeWithPreset(
      "https://cdn.shopify.com/some/image.jpeg",
      "productCard",
    );
    expect(result).toContain(`width=${IMAGE_PRESETS.productCard.width}`);
    expect(result).toContain(`height=${IMAGE_PRESETS.productCard.height}`);
  });

  it("returns null for null input", () => {
    expect(optimizeWithPreset(null, "productCard")).toBeNull();
  });
});

// ─── IMAGE_PRESETS ─────────────────────────────────────────────────────

describe("IMAGE_PRESETS", () => {
  it("has all expected presets", () => {
    expect(Object.keys(IMAGE_PRESETS)).toEqual([
      "productCard",
      "collectionCard",
      "pdpThumb",
      "collectionHero",
      "recommendation",
      "recentlyViewed",
    ]);
  });

  it("each preset has width and height", () => {
    for (const [, preset] of Object.entries(IMAGE_PRESETS)) {
      expect(preset.width).toBeGreaterThan(0);
      expect(preset.height).toBeGreaterThan(0);
    }
  });
});
