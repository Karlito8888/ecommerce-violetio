import { describe, expect, it } from "vitest";
import { webUrlToMobilePath, mobilePushDataToPath } from "@ecommerce/shared";

describe("webUrlToMobilePath", () => {
  it("maps product detail URL to mobile path", () => {
    expect(webUrlToMobilePath("https://www.maisonemile.com/products/abc123")).toBe(
      "/products/abc123",
    );
  });

  it("maps order confirmation URL to mobile path", () => {
    expect(webUrlToMobilePath("https://www.maisonemile.com/order/xyz-uuid/confirmation")).toBe(
      "/order/xyz-uuid/confirmation",
    );
  });

  it("maps order lookup URL to mobile path", () => {
    expect(webUrlToMobilePath("https://www.maisonemile.com/order/lookup")).toBe("/order/lookup");
  });

  it("maps order lookup URL with token query param", () => {
    expect(webUrlToMobilePath("https://www.maisonemile.com/order/lookup?token=abc123")).toBe(
      "/order/lookup?token=abc123",
    );
  });

  it("maps account wishlist URL to mobile /wishlist", () => {
    expect(webUrlToMobilePath("https://www.maisonemile.com/account/wishlist")).toBe("/wishlist");
  });

  it("maps account profile URL to mobile /profile", () => {
    expect(webUrlToMobilePath("https://www.maisonemile.com/account/profile")).toBe("/profile");
  });

  it("maps account orders detail URL to mobile order confirmation", () => {
    expect(webUrlToMobilePath("https://www.maisonemile.com/account/orders/oid123")).toBe(
      "/order/oid123/confirmation",
    );
  });

  it("maps account orders list to mobile /profile (fallback)", () => {
    expect(webUrlToMobilePath("https://www.maisonemile.com/account/orders")).toBe("/profile");
  });

  it("maps search URL to mobile /search", () => {
    expect(webUrlToMobilePath("https://www.maisonemile.com/search")).toBe("/search");
  });

  it("maps home URL to mobile /", () => {
    expect(webUrlToMobilePath("https://www.maisonemile.com/")).toBe("/");
  });

  it("preserves query parameters on search", () => {
    expect(webUrlToMobilePath("https://www.maisonemile.com/search?q=shoes&utm_source=email")).toBe(
      "/search?q=shoes&utm_source=email",
    );
  });

  it("returns null for auth paths", () => {
    expect(webUrlToMobilePath("https://www.maisonemile.com/auth/login")).toBeNull();
  });

  it("returns null for checkout paths", () => {
    expect(webUrlToMobilePath("https://www.maisonemile.com/checkout")).toBeNull();
  });

  it("returns null for cart path", () => {
    expect(webUrlToMobilePath("https://www.maisonemile.com/cart")).toBeNull();
  });

  it("returns null for unknown paths", () => {
    expect(webUrlToMobilePath("https://www.maisonemile.com/some/unknown/path")).toBeNull();
  });

  it("handles URLs without trailing slash on home", () => {
    expect(webUrlToMobilePath("https://www.maisonemile.com")).toBe("/");
  });

  it("handles relative paths via base URL fallback", () => {
    expect(webUrlToMobilePath("/products/abc")).toBe("/products/abc");
  });

  it("returns null for empty string", () => {
    expect(webUrlToMobilePath("")).toBe("/");
  });

  it("handles URL with trailing slash on mapped path", () => {
    expect(webUrlToMobilePath("https://www.maisonemile.com/search/")).toBe("/search");
  });
});

describe("mobilePushDataToPath", () => {
  it("maps order screen with order_id to confirmation path", () => {
    expect(mobilePushDataToPath({ screen: "order", order_id: "123" })).toBe(
      "/order/123/confirmation",
    );
  });

  it("maps product screen with product_id to product detail path", () => {
    expect(mobilePushDataToPath({ screen: "product", product_id: "abc" })).toBe("/products/abc");
  });

  it("maps wishlist screen to /wishlist", () => {
    expect(mobilePushDataToPath({ screen: "wishlist" })).toBe("/wishlist");
  });

  it("maps search screen to /search", () => {
    expect(mobilePushDataToPath({ screen: "search" })).toBe("/search");
  });

  it("returns null for unknown screen", () => {
    expect(mobilePushDataToPath({ screen: "unknown" })).toBeNull();
  });

  it("returns null when no screen is provided", () => {
    expect(mobilePushDataToPath({})).toBeNull();
  });

  it("returns null for order screen without order_id", () => {
    expect(mobilePushDataToPath({ screen: "order" })).toBeNull();
  });

  it("returns null for product screen without product_id", () => {
    expect(mobilePushDataToPath({ screen: "product" })).toBeNull();
  });

  it("maps home screen to /", () => {
    expect(mobilePushDataToPath({ screen: "home" })).toBe("/");
  });
});
