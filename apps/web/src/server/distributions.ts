import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAdapter } from "./violetAdapter";
import { getSupabaseServer } from "./supabaseServer";
import type { ApiResponse } from "@ecommerce/shared";
import type { DistributionRow } from "@ecommerce/shared";

/**
 * Syncs Violet distributions for an order into Supabase.
 *
 * Fetches from Violet's GET /orders/{id}/distributions and upserts into
 * order_distributions. Idempotent — safe to call multiple times.
 */
export const syncOrderDistributionsFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const schema = z.object({
      violetOrderId: z.string().min(1),
    });
    return schema.parse(input);
  })
  .handler(
    async ({
      data,
    }: {
      data: { violetOrderId: string };
    }): Promise<ApiResponse<DistributionRow[]>> => {
      const adapter = getAdapter();
      const supabase = getSupabaseServer();

      // Fetch distributions from Violet
      const distResult = await adapter.getOrderDistributions(data.violetOrderId);
      if (distResult.error) {
        return { data: null, error: distResult.error };
      }

      if (distResult.data.length === 0) {
        return { data: [], error: null };
      }

      // Resolve order_bag_id for each distribution via violet_bag_id
      const bagIds = [...new Set(distResult.data.map((d) => d.violetBagId).filter(Boolean))];

      const { data: bagRows, error: bagError } = await supabase
        .from("order_bags")
        .select("id, violet_bag_id")
        .in("violet_bag_id", bagIds.length > 0 ? bagIds : ["__none__"]);

      if (bagError) {
        return { data: null, error: { code: bagError.code, message: bagError.message } };
      }

      const bagMap = new Map((bagRows ?? []).map((b) => [b.violet_bag_id, b.id]));

      // Build upsert rows — skip distributions with no matching bag
      const rows = distResult.data
        .map((d) => {
          const orderBagId = d.violetBagId ? bagMap.get(d.violetBagId) : null;
          if (!orderBagId) return null;
          return {
            order_bag_id: orderBagId,
            violet_order_id: data.violetOrderId,
            violet_bag_id: d.violetBagId,
            type: d.type,
            status: d.status,
            channel_amount_cents: d.channelAmountCents,
            stripe_fee_cents: d.stripeFee,
            merchant_amount_cents: d.merchantAmountCents,
            subtotal_cents: d.subtotalCents,
            synced_at: new Date().toISOString(),
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (rows.length === 0) {
        return { data: [], error: null };
      }

      const { data: upserted, error: upsertError } = await supabase
        .from("order_distributions")
        .upsert(rows, { onConflict: "violet_order_id,type,violet_bag_id" })
        .select();

      if (upsertError) {
        return { data: null, error: { code: upsertError.code, message: upsertError.message } };
      }

      return { data: upserted as DistributionRow[], error: null };
    },
  );

/**
 * Search distributions across all orders with filters.
 *
 * Calls `POST /payments/DEVELOPER/{app_id}/distributions/search`.
 * Returns paginated results for admin financial reporting.
 *
 * @see https://docs.violet.io/api-reference/payments/distributions/search-distributions
 */
export const searchDistributionsFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    return z
      .object({
        orderId: z.string().optional(),
        merchantId: z.string().optional(),
        bagId: z.string().optional(),
        externalOrderId: z.string().optional(),
        payoutId: z.string().optional(),
        payoutTransferId: z.string().optional(),
        beforeDate: z.string().optional(),
        afterDate: z.string().optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      })
      .parse(input);
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ data }): Promise<any> => {
    const adapter = getAdapter();
    const { page, pageSize, ...searchInput } = data;
    return adapter.searchDistributions(searchInput, page, pageSize);
  });
