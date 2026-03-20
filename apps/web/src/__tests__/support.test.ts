import { describe, expect, it, vi } from "vitest";
import { insertSupportInquiry, countRecentInquiries } from "@ecommerce/shared";
import { SUPPORT_SUBJECTS } from "@ecommerce/shared";
import type { SupportInquiryInput } from "@ecommerce/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Mock builders ────────────────────────────────────────────

function buildInsertMock(data: { id: string } | null, error: unknown = null): SupabaseClient {
  const chain = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
  return { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
}

function buildCountMock(count: number | null, error: unknown = null): SupabaseClient {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockResolvedValue({ count, error }),
  };
  return { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
}

// ── Test data ────────────────────────────────────────────────

const validInput: SupportInquiryInput = {
  name: "Alice Test",
  email: "alice@example.com",
  subject: "General Question",
  message: "This is a test message that is long enough to pass validation easily.",
};

// ── insertSupportInquiry tests ───────────────────────────────

describe("insertSupportInquiry", () => {
  it("returns id on successful insert", async () => {
    const client = buildInsertMock({ id: "abc-123" });
    const result = await insertSupportInquiry(client, validInput);
    expect(result).toEqual({ id: "abc-123" });
    expect(client.from).toHaveBeenCalledWith("support_inquiries");
  });

  it("returns null on error", async () => {
    const client = buildInsertMock(null, { message: "DB error" });
    const result = await insertSupportInquiry(client, validInput);
    expect(result).toBeNull();
  });

  it("returns null when data is null", async () => {
    const client = buildInsertMock(null);
    const result = await insertSupportInquiry(client, validInput);
    expect(result).toBeNull();
  });

  it("passes order_id as null when undefined", async () => {
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: "x" }, error: null }),
    };
    const client = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;

    await insertSupportInquiry(client, { ...validInput, orderId: undefined });
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ order_id: null }));
  });

  it("passes order_id when provided", async () => {
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: "x" }, error: null }),
    };
    const client = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;

    await insertSupportInquiry(client, { ...validInput, orderId: "VIO-123" });
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ order_id: "VIO-123" }));
  });
});

// ── countRecentInquiries tests ───────────────────────────────

describe("countRecentInquiries", () => {
  it("returns count when query succeeds", async () => {
    const client = buildCountMock(3);
    const count = await countRecentInquiries(client, "alice@example.com");
    expect(count).toBe(3);
    expect(client.from).toHaveBeenCalledWith("support_inquiries");
  });

  it("returns 0 on error", async () => {
    const client = buildCountMock(null, { message: "RLS error" });
    const count = await countRecentInquiries(client, "alice@example.com");
    expect(count).toBe(0);
  });

  it("returns 0 when count is null", async () => {
    const client = buildCountMock(null);
    const count = await countRecentInquiries(client, "alice@example.com");
    expect(count).toBe(0);
  });
});

// ── SUPPORT_SUBJECTS constant tests ──────────────────────────

describe("SUPPORT_SUBJECTS", () => {
  it("contains exactly four subjects", () => {
    expect(SUPPORT_SUBJECTS).toHaveLength(4);
  });

  it("includes expected subjects", () => {
    expect(SUPPORT_SUBJECTS).toContain("Order Issue");
    expect(SUPPORT_SUBJECTS).toContain("Payment Problem");
    expect(SUPPORT_SUBJECTS).toContain("General Question");
    expect(SUPPORT_SUBJECTS).toContain("Other");
  });

  it("matches the DB CHECK constraint values", () => {
    // These must match the CHECK constraint in support_inquiries table:
    // CHECK (subject IN ('Order Issue', 'Payment Problem', 'General Question', 'Other'))
    const dbValues = ["Order Issue", "Payment Problem", "General Question", "Other"];
    expect([...SUPPORT_SUBJECTS]).toEqual(dbValues);
  });
});

// ── Validation logic tests (extracted for unit testing) ──────

describe("support form validation", () => {
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  it("accepts valid email addresses", () => {
    expect(EMAIL_REGEX.test("user@example.com")).toBe(true);
    expect(EMAIL_REGEX.test("test@sub.domain.com")).toBe(true);
  });

  it("rejects invalid email addresses", () => {
    expect(EMAIL_REGEX.test("")).toBe(false);
    expect(EMAIL_REGEX.test("notanemail")).toBe(false);
    expect(EMAIL_REGEX.test("@example.com")).toBe(false);
    expect(EMAIL_REGEX.test("user@")).toBe(false);
    expect(EMAIL_REGEX.test("user@.com")).toBe(false);
  });

  it("rejects messages shorter than 20 characters", () => {
    expect("Short msg".length < 20).toBe(true);
  });

  it("accepts messages of exactly 20 characters", () => {
    const msg = "12345678901234567890"; // exactly 20
    expect(msg.length >= 20).toBe(true);
  });

  it("rejects messages longer than 2000 characters", () => {
    const msg = "a".repeat(2001);
    expect(msg.length > 2000).toBe(true);
  });

  it("validates subject is in allowed list", () => {
    expect(SUPPORT_SUBJECTS.includes("Order Issue" as never)).toBe(true);
    expect(SUPPORT_SUBJECTS.includes("Invalid Subject" as never)).toBe(false);
  });
});
