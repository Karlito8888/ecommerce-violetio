/**
 * Server functions for Violet Transfer monitoring and retry.
 *
 * Used by the admin dashboard to:
 * - Search failed transfers
 * - Retry failed transfers (single order/bag or bulk)
 * - Sync transfer status from Violet
 *
 * @see https://docs.violet.io/prism/payments/payments-during-checkout/guides/handling-failed-transfers
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAdapter } from "./violetAdapter";
import { getSupabaseServer } from "./supabaseServer";
import type { ApiResponse, Transfer } from "@ecommerce/shared";

/**
 * Search failed transfers from Violet API.
 * Optionally filter by status, merchant, date range.
 */
export const searchTransfersFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const schema = z.object({
      status: z
        .enum([
          "PENDING",
          "SENT",
          "FAILED",
          "PARTIALLY_SENT",
          "REVERSED",
          "PARTIALLY_REVERSED",
          "BYPASSED",
        ])
        .optional(),
      merchantId: z.string().optional(),
      createdAfter: z.string().optional(),
      createdBefore: z.string().optional(),
    });
    return schema.parse(input);
  })
  .handler(async ({ data }): Promise<ApiResponse<Transfer[]>> => {
    const adapter = getAdapter();
    return adapter.searchTransfers(data);
  });

/**
 * Retry failed transfer for a single order.
 */
export const retryTransferForOrderFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    return z.object({ violetOrderId: z.string().min(1) }).parse(input);
  })
  .handler(async ({ data }): Promise<ApiResponse<{ message: string }>> => {
    const adapter = getAdapter();
    return adapter.retryTransferForOrder(data.violetOrderId);
  });

/**
 * Retry failed transfer for a single bag.
 */
export const retryTransferForBagFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    return z.object({ violetBagId: z.string().min(1) }).parse(input);
  })
  .handler(async ({ data }): Promise<ApiResponse<{ message: string }>> => {
    const adapter = getAdapter();
    return adapter.retryTransferForBag(data.violetBagId);
  });

/**
 * Sync failed transfers from Violet into order_transfers table for admin visibility.
 */
export const syncFailedTransfersFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    return z.object({}).parse(input);
  })
  .handler(async (): Promise<ApiResponse<number>> => {
    const adapter = getAdapter();
    const supabase = getSupabaseServer();

    // Search all failed transfers from Violet
    const result = await adapter.searchTransfers({ status: "FAILED" });
    if (result.error) return { data: null, error: result.error };

    if (result.data.length === 0) return { data: 0, error: null };

    // Resolve order IDs and upsert
    const rows = await Promise.all(
      result.data.map(async (t) => {
        const violetOrderId = t.relatedOrders[0] ?? "";
        let orderId: string | null = null;

        if (violetOrderId) {
          const { data: orderRow } = await supabase
            .from("orders")
            .select("id")
            .eq("violet_order_id", violetOrderId)
            .single();
          orderId = orderRow?.id ?? null;
        }

        return {
          violet_transfer_id: t.id,
          order_id: orderId,
          violet_order_id: violetOrderId,
          violet_bag_id: t.relatedBags[0] ?? null,
          merchant_id: t.merchantId,
          payment_provider_transfer_id: t.paymentProviderTransferId,
          status: t.status,
          amount_cents: t.amount,
          currency: t.currency,
          errors: t.errors.length ? t.errors : null,
          synced_at: new Date().toISOString(),
        };
      }),
    );

    // Filter out rows without order_id (orphan transfers)
    const validRows = rows.filter((r) => r.order_id !== null);

    if (validRows.length === 0) return { data: 0, error: null };

    const { error: upsertError } = await supabase
      .from("order_transfers")
      .upsert(validRows, { onConflict: "violet_transfer_id" });

    if (upsertError) {
      return { data: null, error: { code: upsertError.code, message: upsertError.message } };
    }

    return { data: validRows.length, error: null };
  });
