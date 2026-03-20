import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupportInquiryInput } from "@ecommerce/shared";

// ── Mocks ────────────────────────────────────────────────────

const mockInvoke = vi.hoisted(() => vi.fn().mockResolvedValue({ data: {}, error: null }));

vi.mock("@ecommerce/shared", async () => {
  const actual = await vi.importActual<typeof import("@ecommerce/shared")>("@ecommerce/shared");
  return {
    ...actual,
    insertSupportInquiry: vi.fn(),
    countRecentInquiries: vi.fn(),
  };
});

vi.mock("../server/supabaseServer", () => ({
  getSupabaseServer: vi.fn(() => ({
    functions: { invoke: mockInvoke },
  })),
}));

import { submitSupportHandler } from "../server/submitSupportHandler";
import { insertSupportInquiry, countRecentInquiries } from "@ecommerce/shared";

// ── Test data ────────────────────────────────────────────────

const validInquiry: SupportInquiryInput = {
  name: "Alice Test",
  email: "alice@example.com",
  subject: "General Question",
  message: "This is a test message that is long enough to pass validation requirements.",
};

// ── Tests ────────────────────────────────────────────────────

describe("submitSupportHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(countRecentInquiries).mockResolvedValue(0);
    vi.mocked(insertSupportInquiry).mockResolvedValue({ id: "test-id-123" });
  });

  // ── Honeypot ──────────────────────────────────────────────

  describe("honeypot", () => {
    it("returns silent success when honeypot is filled", async () => {
      const result = await submitSupportHandler(validInquiry, "bot-filled-this");
      expect(result).toEqual({ success: true });
      expect(insertSupportInquiry).not.toHaveBeenCalled();
      expect(countRecentInquiries).not.toHaveBeenCalled();
    });

    it("proceeds normally when honeypot is empty string", async () => {
      const result = await submitSupportHandler(validInquiry, "");
      expect(result.success).toBe(true);
      expect(insertSupportInquiry).toHaveBeenCalled();
    });

    it("proceeds normally when honeypot is undefined", async () => {
      const result = await submitSupportHandler(validInquiry);
      expect(result.success).toBe(true);
      expect(insertSupportInquiry).toHaveBeenCalled();
    });
  });

  // ── Validation (tests the actual validateInquiry function) ─

  describe("validation", () => {
    it("rejects empty name", async () => {
      const result = await submitSupportHandler({ ...validInquiry, name: "" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Name");
      expect(insertSupportInquiry).not.toHaveBeenCalled();
    });

    it("rejects whitespace-only name", async () => {
      const result = await submitSupportHandler({ ...validInquiry, name: "   " });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Name");
    });

    it("rejects invalid email", async () => {
      const result = await submitSupportHandler({ ...validInquiry, email: "not-an-email" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("email");
    });

    it("rejects empty email", async () => {
      const result = await submitSupportHandler({ ...validInquiry, email: "" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("email");
    });

    it("rejects invalid subject", async () => {
      const result = await submitSupportHandler({
        ...validInquiry,
        subject: "Hacking Attempt" as never,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("subject");
    });

    it("rejects message shorter than 20 characters", async () => {
      const result = await submitSupportHandler({ ...validInquiry, message: "Too short" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("20");
    });

    it("rejects message longer than 2000 characters", async () => {
      const result = await submitSupportHandler({ ...validInquiry, message: "x".repeat(2001) });
      expect(result.success).toBe(false);
      expect(result.error).toContain("2000");
    });

    it("accepts message of exactly 20 characters", async () => {
      const result = await submitSupportHandler({
        ...validInquiry,
        message: "12345678901234567890",
      });
      expect(result.success).toBe(true);
    });
  });

  // ── Rate limiting ─────────────────────────────────────────

  describe("rate limiting", () => {
    it("allows submission when under rate limit (2 of 3)", async () => {
      vi.mocked(countRecentInquiries).mockResolvedValue(2);
      const result = await submitSupportHandler(validInquiry);
      expect(result.success).toBe(true);
      expect(insertSupportInquiry).toHaveBeenCalled();
    });

    it("blocks submission when at rate limit (3 of 3)", async () => {
      vi.mocked(countRecentInquiries).mockResolvedValue(3);
      const result = await submitSupportHandler(validInquiry);
      expect(result.success).toBe(false);
      expect(result.error).toContain("too many");
      expect(insertSupportInquiry).not.toHaveBeenCalled();
    });

    it("blocks submission when over rate limit (5 of 3)", async () => {
      vi.mocked(countRecentInquiries).mockResolvedValue(5);
      const result = await submitSupportHandler(validInquiry);
      expect(result.success).toBe(false);
      expect(insertSupportInquiry).not.toHaveBeenCalled();
    });
  });

  // ── Successful submission flow ────────────────────────────

  describe("successful submission", () => {
    it("returns success with inquiry ID", async () => {
      const result = await submitSupportHandler(validInquiry);
      expect(result).toEqual({ success: true, inquiryId: "test-id-123" });
    });

    it("invokes send-support-email Edge Function", async () => {
      await submitSupportHandler(validInquiry);
      expect(mockInvoke).toHaveBeenCalledWith("send-support-email", {
        body: expect.objectContaining({
          inquiry_id: "test-id-123",
          email: "alice@example.com",
          name: "Alice Test",
          subject: "General Question",
        }),
      });
    });

    it("returns error when insert fails", async () => {
      vi.mocked(insertSupportInquiry).mockResolvedValue(null);
      const result = await submitSupportHandler(validInquiry);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Something went wrong");
    });

    it("still succeeds when email Edge Function fails", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("Edge Function down"));
      const result = await submitSupportHandler(validInquiry);
      expect(result.success).toBe(true);
      expect(result.inquiryId).toBe("test-id-123");
    });
  });
});
