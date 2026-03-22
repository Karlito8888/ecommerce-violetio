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

// NOTE: Validation logic (email regex, message length) is tested via
// submitSupportHandler tests below, which exercise the actual handler code.
// Previously, tests duplicated the regex locally — this created false coverage.

// ── submitSupportHandler tests ──────────────────────────────

vi.mock("#/server/supabaseServer", () => ({
  getSupabaseServer: vi.fn(),
}));

/**
 * Server handler tests for submitSupportHandler — the public support inquiry
 * submission endpoint. The handler is responsible for:
 * - Honeypot bot detection (silent fake success)
 * - Server-side input validation (name, email, subject, message length)
 * - Rate limiting (max 3 per email per hour)
 * - Database insert via service-role client
 * - Fire-and-forget confirmation emails
 */
describe("submitSupportHandler", () => {
  it("returns fake success when honeypot field is filled", async () => {
    const { submitSupportHandler } = await import("#/server/submitSupportHandler");
    const result = await submitSupportHandler(validInput, "bot-value");
    expect(result).toEqual({ success: true });
  });

  it("rejects when name is empty", async () => {
    const { submitSupportHandler } = await import("#/server/submitSupportHandler");
    const result = await submitSupportHandler({ ...validInput, name: "" });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Name is required");
  });

  it("rejects when name is only whitespace", async () => {
    const { submitSupportHandler } = await import("#/server/submitSupportHandler");
    const result = await submitSupportHandler({ ...validInput, name: "   " });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Name is required");
  });

  it("rejects when email is invalid", async () => {
    const { submitSupportHandler } = await import("#/server/submitSupportHandler");
    const result = await submitSupportHandler({ ...validInput, email: "notanemail" });
    expect(result.success).toBe(false);
    expect(result.error).toBe("A valid email address is required");
  });

  it("rejects when email is empty", async () => {
    const { submitSupportHandler } = await import("#/server/submitSupportHandler");
    const result = await submitSupportHandler({ ...validInput, email: "" });
    expect(result.success).toBe(false);
    expect(result.error).toBe("A valid email address is required");
  });

  it("rejects when subject is not in allowed list", async () => {
    const { submitSupportHandler } = await import("#/server/submitSupportHandler");
    const result = await submitSupportHandler({
      ...validInput,
      subject: "Invalid Subject" as never,
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Please select a valid subject");
  });

  it("rejects when message is too short (<20 chars)", async () => {
    const { submitSupportHandler } = await import("#/server/submitSupportHandler");
    const result = await submitSupportHandler({ ...validInput, message: "Short msg" });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Message must be at least 20 characters");
  });

  it("rejects when message is too long (>2000 chars)", async () => {
    const { submitSupportHandler } = await import("#/server/submitSupportHandler");
    const result = await submitSupportHandler({
      ...validInput,
      message: "a".repeat(2001),
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Message must be no more than 2000 characters");
  });

  it("rejects when rate limit exceeded (>=3 per hour)", async () => {
    const { getSupabaseServer } = await import("#/server/supabaseServer");
    const countChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({ count: 3, error: null }),
    };
    vi.mocked(getSupabaseServer).mockReturnValue({
      from: vi.fn().mockReturnValue(countChain),
    } as unknown as SupabaseClient);

    const { submitSupportHandler } = await import("#/server/submitSupportHandler");
    const result = await submitSupportHandler(validInput);
    expect(result.success).toBe(false);
    expect(result.error).toContain("too many requests");
  });

  it("returns success with inquiryId on valid submission", async () => {
    const { getSupabaseServer } = await import("#/server/supabaseServer");
    let callCount = 0;
    const countChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({ count: 0, error: null }),
    };
    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: "new-id-123" }, error: null }),
    };
    vi.mocked(getSupabaseServer).mockReturnValue({
      from: vi.fn(() => {
        callCount++;
        // First call is countRecentInquiries, second is insertSupportInquiry
        if (callCount === 1) return countChain;
        return insertChain;
      }),
      functions: {
        invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
      },
    } as unknown as SupabaseClient);

    const { submitSupportHandler } = await import("#/server/submitSupportHandler");
    const result = await submitSupportHandler(validInput);
    expect(result.success).toBe(true);
    expect(result.inquiryId).toBe("new-id-123");
  });

  it("returns error when database insert fails", async () => {
    const { getSupabaseServer } = await import("#/server/supabaseServer");
    let callCount = 0;
    const countChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({ count: 0, error: null }),
    };
    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
    };
    vi.mocked(getSupabaseServer).mockReturnValue({
      from: vi.fn(() => {
        callCount++;
        if (callCount === 1) return countChain;
        return insertChain;
      }),
    } as unknown as SupabaseClient);

    const { submitSupportHandler } = await import("#/server/submitSupportHandler");
    const result = await submitSupportHandler(validInput);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Something went wrong. Please try again.");
  });
});
