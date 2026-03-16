import type { SupabaseClient } from "@supabase/supabase-js";
import type { PersistOrderInput, PersistOrderResult } from "../types/orderPersistence.types";
import { generateOrderLookupToken, hashOrderLookupToken } from "./guestToken";

/**
 * Persists a completed order from Violet into Supabase.
 * Inserts orders → order_bags → order_items in sequence.
 * Generates a guest lookup token if userId is null.
 *
 * Uses service_role client — must be called server-side only.
 *
 * ## Data integrity (Code Review Fix M1)
 * If bag or item inserts fail after the order row is created, the orphaned
 * order row is cleaned up (DELETE CASCADE propagates to any partial children).
 * This prevents incomplete order data from accumulating in Supabase.
 *
 * Supabase's PostgREST does not support multi-table transactions, so we
 * simulate atomicity with a try/catch + cleanup pattern. The trade-off:
 * a brief window where an incomplete row exists (between insert and cleanup).
 * This is acceptable because Violet is the source of truth — Supabase is a
 * mirror for local queries, and the caller (persistAndConfirmOrderFn) handles
 * failures gracefully without blocking the user flow.
 *
 * ## Guest token flow
 * For guest buyers (userId is null), a crypto-random 32-byte token is generated
 * using `node:crypto.randomBytes`, then SHA-256 hashed for storage. Only the
 * hash is persisted — the plaintext token is returned exactly once in the
 * `PersistOrderResult` and shown to the user on the confirmation page.
 *
 * @param supabase - Service-role SupabaseClient (from getSupabaseServer())
 * @param input - Order data mapped from Violet's OrderDetail response
 * @returns Supabase UUID + optional plaintext guest token
 * @throws Error if order insert fails or if child inserts fail after cleanup
 */
export async function persistOrder(
  supabase: SupabaseClient,
  input: PersistOrderInput,
): Promise<PersistOrderResult> {
  let orderLookupToken: string | undefined;
  let orderLookupTokenHash: string | null = null;
  if (!input.userId) {
    orderLookupToken = generateOrderLookupToken();
    orderLookupTokenHash = hashOrderLookupToken(orderLookupToken);
  }

  const { data: orderRow, error: orderError } = await supabase
    .from("orders")
    .insert({
      violet_order_id: input.violetOrderId,
      user_id: input.userId,
      session_id: input.sessionId,
      email: input.email,
      status: input.status,
      subtotal: input.subtotal,
      shipping_total: input.shippingTotal,
      tax_total: input.taxTotal,
      total: input.total,
      currency: input.currency,
      order_lookup_token_hash: orderLookupTokenHash,
    })
    .select("id")
    .single();

  if (orderError || !orderRow) {
    throw new Error(`Failed to persist order: ${orderError?.message}`);
  }

  /**
   * Insert bags and items with cleanup on failure.
   * If any child insert fails, delete the parent order row (CASCADE deletes
   * any partially-inserted bags/items) to avoid orphaned data.
   */
  try {
    for (const bag of input.bags) {
      const { data: bagRow, error: bagError } = await supabase
        .from("order_bags")
        .insert({
          order_id: orderRow.id,
          violet_bag_id: bag.violetBagId,
          merchant_name: bag.merchantName,
          status: bag.status,
          financial_status: bag.financialStatus,
          subtotal: bag.subtotal,
          shipping_total: bag.shippingTotal,
          tax_total: bag.taxTotal,
          total: bag.total,
          shipping_method: bag.shippingMethod ?? null,
          carrier: bag.carrier ?? null,
        })
        .select("id")
        .single();

      if (bagError || !bagRow) {
        throw new Error(`Failed to persist order bag: ${bagError?.message}`);
      }

      if (bag.items.length > 0) {
        const itemRows = bag.items.map((item) => ({
          order_bag_id: bagRow.id,
          sku_id: item.skuId,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          line_price: item.linePrice,
          thumbnail: item.thumbnail ?? null,
        }));

        const { error: itemsError } = await supabase.from("order_items").insert(itemRows);

        if (itemsError) {
          throw new Error(`Failed to persist order items: ${itemsError.message}`);
        }
      }
    }
  } catch (childError) {
    // Clean up orphaned order row — CASCADE deletes any partial bags/items
    await supabase.from("orders").delete().eq("id", orderRow.id);
    throw childError;
  }

  return {
    orderId: orderRow.id,
    orderLookupToken,
  };
}
