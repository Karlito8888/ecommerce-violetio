import { describe, expect, it, vi, afterEach } from "vitest";
import { useShare } from "@ecommerce/shared";

describe("useShare", () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore original navigator descriptor
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  describe("canNativeShare", () => {
    it("returns true when navigator.share is available", () => {
      Object.defineProperty(globalThis, "navigator", {
        value: { ...originalNavigator, share: vi.fn() },
        writable: true,
        configurable: true,
      });
      const { canNativeShare } = useShare();
      expect(canNativeShare).toBe(true);
    });

    it("returns false when navigator.share is not available", () => {
      Object.defineProperty(globalThis, "navigator", {
        value: { ...originalNavigator, share: undefined },
        writable: true,
        configurable: true,
      });
      const { canNativeShare } = useShare();
      expect(canNativeShare).toBe(false);
    });
  });

  describe("share — Web Share API path", () => {
    it("calls navigator.share and returns native success", async () => {
      const mockShare = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(globalThis, "navigator", {
        value: { ...originalNavigator, share: mockShare },
        writable: true,
        configurable: true,
      });

      const { share } = useShare();
      const result = await share({
        title: "Test Product",
        text: "Check this out",
        url: "https://www.maisonemile.com/products/123",
      });

      expect(mockShare).toHaveBeenCalledWith({
        title: "Test Product",
        text: "Check this out",
        url: "https://www.maisonemile.com/products/123",
      });
      expect(result).toEqual({ method: "native", success: true });
    });

    it("returns native failure on AbortError (user cancelled)", async () => {
      const abortError = Object.assign(new Error("Share cancelled"), { name: "AbortError" });
      const mockShare = vi.fn().mockRejectedValue(abortError);
      Object.defineProperty(globalThis, "navigator", {
        value: { share: mockShare, clipboard: undefined },
        writable: true,
        configurable: true,
      });

      const { share } = useShare();
      const result = await share({
        title: "Test",
        url: "https://example.com",
      });

      expect(result).toEqual({ method: "native", success: false });
    });
  });

  describe("share — clipboard fallback", () => {
    it("copies URL to clipboard when Web Share API is unavailable", async () => {
      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(globalThis, "navigator", {
        value: {
          ...originalNavigator,
          share: undefined,
          clipboard: { writeText: mockWriteText },
        },
        writable: true,
        configurable: true,
      });

      const { share } = useShare();
      const result = await share({
        title: "Test",
        url: "https://www.maisonemile.com/content/guide",
      });

      expect(mockWriteText).toHaveBeenCalledWith("https://www.maisonemile.com/content/guide");
      expect(result).toEqual({ method: "clipboard", success: true });
    });

    it("falls back to clipboard on non-AbortError from native share", async () => {
      const mockShare = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(globalThis, "navigator", {
        value: {
          ...originalNavigator,
          share: mockShare,
          clipboard: { writeText: mockWriteText },
        },
        writable: true,
        configurable: true,
      });

      const { share } = useShare();
      const result = await share({
        title: "Test",
        url: "https://example.com",
      });

      expect(mockWriteText).toHaveBeenCalledWith("https://example.com");
      expect(result).toEqual({ method: "clipboard", success: true });
    });

    it("returns unsupported when clipboard also fails", async () => {
      const mockWriteText = vi.fn().mockRejectedValue(new Error("Clipboard denied"));
      Object.defineProperty(globalThis, "navigator", {
        value: {
          ...originalNavigator,
          share: undefined,
          clipboard: { writeText: mockWriteText },
        },
        writable: true,
        configurable: true,
      });

      const { share } = useShare();
      const result = await share({
        title: "Test",
        url: "https://example.com",
      });

      expect(result).toEqual({ method: "unsupported", success: false });
    });
  });

  describe("share — no API available", () => {
    it("returns unsupported when neither share nor clipboard exist", async () => {
      Object.defineProperty(globalThis, "navigator", {
        value: { ...originalNavigator, share: undefined, clipboard: undefined },
        writable: true,
        configurable: true,
      });

      const { share } = useShare();
      const result = await share({
        title: "Test",
        url: "https://example.com",
      });

      expect(result).toEqual({ method: "unsupported", success: false });
    });
  });

  describe("share — text field is optional", () => {
    it("passes undefined text when not provided", async () => {
      const mockShare = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(globalThis, "navigator", {
        value: { ...originalNavigator, share: mockShare },
        writable: true,
        configurable: true,
      });

      const { share } = useShare();
      await share({ title: "Test", url: "https://example.com" });

      expect(mockShare).toHaveBeenCalledWith({
        title: "Test",
        text: undefined,
        url: "https://example.com",
      });
    });
  });
});
