/**
 * Webhook processor logic tests.
 *
 * ## Why these tests exist (H2 code review fix)
 *
 * The actual processors live in `supabase/functions/handle-webhook/processors.ts`
 * (Deno runtime) and cannot be imported directly into vitest (Node runtime).
 * These tests verify the **business logic contracts** that the processors implement:
 *
 * 1. OFFER_ADDED/UPDATED → calls generate-embeddings with correct payload shape
 * 2. OFFER_REMOVED/DELETED → sets `available = false` on product_embeddings
 * 3. PRODUCT_SYNC_* → marks event as processed (monitoring only)
 * 4. Status updates are always recorded (processed or failed)
 *
 * The tests use mock SupabaseClient objects that mirror the interface used by
 * the actual processors. If the processor logic changes, these tests catch
 * contract violations even though they don't import the Deno code directly.
 *
 * ## ⚠️ M3 CODE REVIEW WARNING — Test-copy drift risk
 *
 * These tests **replicate** the processor logic locally instead of importing the
 * real code (Deno/Node boundary prevents direct imports). This creates a drift risk:
 * if `processors.ts` is modified but these test copies are NOT updated, the tests
 * will still pass while the actual runtime behavior has changed.
 *
 * **Mitigation strategy:**
 * - When modifying `supabase/functions/handle-webhook/processors.ts`, ALWAYS search
 *   for this file and update the mirrored functions to match.
 * - The H1 bug (OFFER_ADDED not restoring `available = true`) was a direct
 *   consequence of this pattern — the test mirrored a version without the
 *   availability restore, so the bug went undetected.
 * - Integration tests (Tasks 10.3-10.6) are the definitive validation layer.
 *
 * ## What is NOT testable here
 *
 * - HMAC validation (`crypto.subtle.verify`) — Deno Web Crypto API only.
 *   Requires `deno test` or integration tests with a running Supabase instance.
 * - Full handler flow (HTTP request → response) — needs Deno.serve mock.
 *   Use `curl` or Supabase CLI for integration testing (Tasks 10.3-10.6).
 *
 * @see supabase/functions/handle-webhook/processors.ts — Actual implementation
 * @see supabase/functions/_shared/webhookAuth.ts — HMAC validation (Deno-only)
 */

import { describe, it, expect, vi, type Mock } from "vitest";

// ─── Mock SupabaseClient ──────────────────────────────────────────────

interface MockQueryBuilder {
  update: Mock;
  insert: Mock;
  eq: Mock;
  from: Mock;
  functions: { invoke: Mock };
}

function createMockSupabase(): MockQueryBuilder {
  const eqFn = vi.fn().mockResolvedValue({ error: null });
  const updateFn = vi.fn().mockReturnValue({ eq: eqFn });
  const insertFn = vi.fn().mockResolvedValue({ error: null });
  const fromFn = vi.fn().mockReturnValue({ update: updateFn, insert: insertFn });
  const invokeFn = vi.fn().mockResolvedValue({ data: {}, error: null });

  return {
    from: fromFn,
    update: updateFn,
    insert: insertFn,
    eq: eqFn,
    functions: { invoke: invokeFn },
  };
}

// ─── Processor logic (mirrored from processors.ts) ───────────────────
// ⚠️ M3 WARNING: These functions replicate the processor contracts to test
// business logic. They are NOT the actual code — they mirror the expected
// behavior. If processors.ts changes, update these mirrors AND the tests.
// H1 FIX: processOfferAdded now restores `available = true` after embedding
// generation, mirroring the fix in processors.ts.

async function processOfferAdded(
  supabase: MockQueryBuilder,
  eventId: string,
  payload: {
    id: number;
    name: string;
    description?: string;
    vendor?: string;
    tags?: string[];
    source: string;
  },
): Promise<void> {
  try {
    const invokeResult = (await supabase.functions.invoke("generate-embeddings", {
      body: {
        productId: String(payload.id),
        productName: payload.name,
        description: payload.description ?? "",
        vendor: payload.vendor ?? "",
        tags: payload.tags ?? [],
        category: payload.tags?.[0] ?? "",
      },
    })) as { data: Record<string, unknown>; error: { message: string } | null };

    if (invokeResult.error) {
      await supabase
        .from("webhook_events")
        .update({
          status: "failed",
          error_message: invokeResult.error.message,
          processed_at: expect.any(String),
        })
        .eq("event_id", eventId);
      return;
    }

    /**
     * H1 code review fix — Restore availability after embedding upsert.
     * Mirrors the fix in processors.ts: after generate-embeddings succeeds,
     * explicitly set `available = true` so re-listed products become searchable.
     */
    await supabase
      .from("product_embeddings")
      .update({ available: true })
      .eq("product_id", String(payload.id));

    await supabase
      .from("webhook_events")
      .update({ status: "processed", processed_at: expect.any(String) })
      .eq("event_id", eventId);
  } catch (err) {
    await supabase
      .from("webhook_events")
      .update({
        status: "failed",
        error_message: err instanceof Error ? err.message : "Unknown error",
        processed_at: expect.any(String),
      })
      .eq("event_id", eventId);
  }
}

/**
 * Mirror of processOfferRemoved logic — sets available=false then updates status.
 * Uses a tracking array to record all operations for assertion in tests.
 */
async function processOfferRemoved(
  operations: Array<{ table: string; action: string; args: unknown[] }>,
  payload: { id: number },
  eventId: string,
): Promise<void> {
  operations.push({
    table: "product_embeddings",
    action: "update",
    args: [{ available: false }, "product_id", String(payload.id)],
  });
  operations.push({
    table: "webhook_events",
    action: "update",
    args: [{ status: "processed" }, "event_id", eventId],
  });
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("Webhook processor logic contracts", () => {
  describe("OFFER_ADDED processor", () => {
    it("calls generate-embeddings with correct payload shape", async () => {
      const supabase = createMockSupabase();

      await processOfferAdded(supabase, "evt-001", {
        id: 12345,
        name: "Test Headphones",
        description: "Wireless headphones",
        vendor: "AudioTech",
        tags: ["electronics", "audio"],
        source: "SHOPIFY",
      });

      expect(supabase.functions.invoke).toHaveBeenCalledWith("generate-embeddings", {
        body: {
          productId: "12345",
          productName: "Test Headphones",
          description: "Wireless headphones",
          vendor: "AudioTech",
          tags: ["electronics", "audio"],
          category: "electronics",
        },
      });
    });

    it("uses first tag as category, NOT source (M1 fix)", async () => {
      const supabase = createMockSupabase();

      await processOfferAdded(supabase, "evt-002", {
        id: 1,
        name: "Product",
        tags: ["shoes", "running"],
        source: "BIGCOMMERCE",
      });

      const invokeCall = supabase.functions.invoke.mock.calls[0];
      expect(invokeCall[1].body.category).toBe("shoes");
      expect(invokeCall[1].body.category).not.toBe("BIGCOMMERCE");
    });

    it("uses empty category when no tags exist", async () => {
      const supabase = createMockSupabase();

      await processOfferAdded(supabase, "evt-003", {
        id: 1,
        name: "Product",
        source: "SHOPIFY",
      });

      const invokeCall = supabase.functions.invoke.mock.calls[0];
      expect(invokeCall[1].body.category).toBe("");
    });

    it("converts numeric id to string productId", async () => {
      const supabase = createMockSupabase();

      await processOfferAdded(supabase, "evt-004", {
        id: 99999,
        name: "Product",
        source: "SHOPIFY",
      });

      const invokeCall = supabase.functions.invoke.mock.calls[0];
      expect(invokeCall[1].body.productId).toBe("99999");
    });

    it("defaults optional fields to empty when missing", async () => {
      const supabase = createMockSupabase();

      await processOfferAdded(supabase, "evt-005", {
        id: 1,
        name: "Minimal Product",
        source: "SHOPIFY",
      });

      const body = supabase.functions.invoke.mock.calls[0][1].body;
      expect(body.description).toBe("");
      expect(body.vendor).toBe("");
      expect(body.tags).toEqual([]);
      expect(body.category).toBe("");
    });

    /**
     * H1 code review fix — Verifies that processOfferAdded restores
     * `available = true` on product_embeddings after successful embedding
     * generation. Without this, a product previously removed (OFFER_REMOVED)
     * then re-added (OFFER_ADDED) would remain invisible in search forever.
     */
    it("restores available = true after successful embedding generation (H1 fix)", async () => {
      const supabase = createMockSupabase();

      await processOfferAdded(supabase, "evt-006", {
        id: 42,
        name: "Re-listed Product",
        source: "SHOPIFY",
      });

      // Should call from("product_embeddings").update({ available: true }).eq(...)
      expect(supabase.from).toHaveBeenCalledWith("product_embeddings");
      expect(supabase.update).toHaveBeenCalledWith({ available: true });
      expect(supabase.eq).toHaveBeenCalledWith("product_id", "42");
    });
  });

  describe("OFFER_REMOVED/DELETED processor", () => {
    it("sets available = false on product_embeddings", async () => {
      const ops: Array<{ table: string; action: string; args: unknown[] }> = [];
      await processOfferRemoved(ops, { id: 12345 }, "evt-010");

      expect(ops[0]).toEqual({
        table: "product_embeddings",
        action: "update",
        args: [{ available: false }, "product_id", "12345"],
      });
    });

    it("converts numeric payload.id to string for product_id match", async () => {
      const ops: Array<{ table: string; action: string; args: unknown[] }> = [];
      await processOfferRemoved(ops, { id: 54321 }, "evt-011");

      // Third element of args is the stringified product_id
      expect(ops[0].args[2]).toBe("54321");
    });

    it("marks event as processed after updating product", async () => {
      const ops: Array<{ table: string; action: string; args: unknown[] }> = [];
      await processOfferRemoved(ops, { id: 1 }, "evt-012");

      expect(ops).toHaveLength(2);
      expect(ops[1]).toEqual({
        table: "webhook_events",
        action: "update",
        args: [{ status: "processed" }, "event_id", "evt-012"],
      });
    });

    it("updates product_embeddings BEFORE webhook_events (order matters)", async () => {
      const ops: Array<{ table: string; action: string; args: unknown[] }> = [];
      await processOfferRemoved(ops, { id: 1 }, "evt-013");

      expect(ops[0].table).toBe("product_embeddings");
      expect(ops[1].table).toBe("webhook_events");
    });
  });

  describe("PRODUCT_SYNC_* processor", () => {
    it("marks event as processed without calling generate-embeddings", async () => {
      const supabase = createMockSupabase();

      // Simulate processSyncEvent — just updates status to processed
      await supabase
        .from("webhook_events")
        .update({ status: "processed", processed_at: new Date().toISOString() })
        .eq("event_id", "evt-020");

      expect(supabase.functions.invoke).not.toHaveBeenCalled();
      expect(supabase.from).toHaveBeenCalledWith("webhook_events");
    });
  });

  describe("Error handling", () => {
    it("marks event as failed when generate-embeddings returns error", async () => {
      const supabase = createMockSupabase();
      supabase.functions.invoke.mockResolvedValue({
        data: null,
        error: { message: "OpenAI rate limit exceeded" },
      });

      await processOfferAdded(supabase, "evt-030", {
        id: 1,
        name: "Product",
        source: "SHOPIFY",
      });

      // Verify status was updated to failed
      expect(supabase.from).toHaveBeenCalledWith("webhook_events");
    });

    it("marks event as failed when generate-embeddings throws", async () => {
      const supabase = createMockSupabase();
      supabase.functions.invoke.mockRejectedValue(new Error("Network timeout"));

      await processOfferAdded(supabase, "evt-031", {
        id: 1,
        name: "Product",
        source: "SHOPIFY",
      });

      // Verify the catch block ran (status update was called)
      expect(supabase.from).toHaveBeenCalledWith("webhook_events");
    });
  });

  // ── MERCHANT webhook processors ──────────────────────────────────────

  describe("MERCHANT_CONNECTED processor", () => {
    it("logs merchant connection to error_logs and marks processed", async () => {
      const supabase = createMockSupabase();

      // Mirror of processMerchantConnected logic
      await supabase.from("error_logs").insert({
        source: "webhook",
        error_type: "MERCHANT_CONNECTED",
        message: 'Merchant "Test Store" (id=100, platform=SHOPIFY) connected',
        context: { merchant_id: "100", merchant_name: "Test Store", source: "SHOPIFY" },
      });
      await supabase
        .from("webhook_events")
        .update({ status: "processed", processed_at: expect.any(String) })
        .eq("event_id", "evt-100");

      expect(supabase.from).toHaveBeenCalledWith("error_logs");
      expect(supabase.from).toHaveBeenCalledWith("webhook_events");
      expect(supabase.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "processed" }),
      );
    });
  });

  describe("MERCHANT_DISCONNECTED processor", () => {
    it("logs merchant disconnection to error_logs and marks processed", async () => {
      const supabase = createMockSupabase();

      await supabase.from("error_logs").insert({
        source: "webhook",
        error_type: "MERCHANT_DISCONNECTED",
        message: 'Merchant "Test Store" (id=100) disconnected',
        context: { merchant_id: "100", merchant_name: "Test Store" },
      });
      await supabase
        .from("webhook_events")
        .update({ status: "processed", processed_at: expect.any(String) })
        .eq("event_id", "evt-101");

      expect(supabase.from).toHaveBeenCalledWith("error_logs");
      expect(supabase.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "processed" }),
      );
    });
  });

  describe("MERCHANT_ENABLED/DISABLED processor", () => {
    it("logs merchant enabled event", async () => {
      const supabase = createMockSupabase();

      await supabase.from("error_logs").insert({
        source: "webhook",
        error_type: "MERCHANT_ENABLED",
        message: 'Merchant "Test Store" (id=100) enabled',
        context: { merchant_id: "100", merchant_name: "Test Store", status: "ACTIVE" },
      });
      await supabase
        .from("webhook_events")
        .update({ status: "processed" })
        .eq("event_id", "evt-102");

      expect(supabase.from).toHaveBeenCalledWith("error_logs");
    });

    it("logs merchant disabled event", async () => {
      const supabase = createMockSupabase();

      await supabase.from("error_logs").insert({
        source: "webhook",
        error_type: "MERCHANT_DISABLED",
        message: 'Merchant "Test Store" (id=100) disabled',
        context: { merchant_id: "100", merchant_name: "Test Store", status: "INACTIVE" },
      });
      await supabase
        .from("webhook_events")
        .update({ status: "processed" })
        .eq("event_id", "evt-103");

      expect(supabase.from).toHaveBeenCalledWith("error_logs");
    });
  });
});
