/**
 * Cart sync Server Functions — cross-device cart lookup, merge, and claim.
 *
 * These functions support Story 4.6 (Cross-Device Cart Sync):
 * - `getUserCartFn` — finds an authenticated user's active cart in Supabase
 * - `mergeAnonymousCartFn` — merges items from anonymous cart into authenticated cart via Violet
 * - `claimCartFn` — transfers ownership of an anonymous cart to an authenticated user
 *
 * All use the service-role Supabase client to bypass RLS (server-side only).
 *
 * @see apps/web/src/server/cartActions.ts — core cart CRUD
 * @see packages/shared/src/hooks/useCartSync.ts — Realtime subscription hook
 */

import { createServerFn } from "@tanstack/react-start";
import { setCookie } from "@tanstack/react-start/server";
import { getAdapter } from "./violetAdapter";
import { getSupabaseServer } from "./supabaseServer";

/**
 * Finds the active cart for an authenticated user.
 * Returns the most recently updated active cart's violet_cart_id, or null.
 */
export const getUserCartFn = createServerFn({ method: "GET" })
  .inputValidator((data: { userId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = getSupabaseServer();
    const { data: cart } = await supabase
      .from("carts")
      .select("violet_cart_id")
      .eq("user_id", data.userId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { violetCartId: cart?.violet_cart_id ?? null };
  });

/**
 * Merges items from an anonymous cart into an authenticated cart via Violet API.
 *
 * Strategy:
 * - For each item in the anonymous cart:
 *   - If the SKU already exists in the target → increase quantity
 *   - If the SKU is new → add to target cart
 * - After merge, mark the anonymous cart as "merged" in Supabase
 *
 * Merge is NOT atomic — each item is added individually via Violet API.
 * Partial failures are collected and returned (non-blocking).
 */
export const mergeAnonymousCartFn = createServerFn({ method: "POST" })
  .inputValidator((data: { anonymousVioletCartId: string; targetVioletCartId: string }) => data)
  .handler(async ({ data }) => {
    const adapter = getAdapter();

    // 1. Fetch both carts from Violet
    const [anonResult, targetResult] = await Promise.all([
      adapter.getCart(data.anonymousVioletCartId),
      adapter.getCart(data.targetVioletCartId),
    ]);

    if (anonResult.error || !anonResult.data) {
      return { success: false, error: "Failed to fetch anonymous cart" };
    }
    if (targetResult.error || !targetResult.data) {
      return { success: false, error: "Failed to fetch target cart" };
    }

    const anonCart = anonResult.data;
    const targetCart = targetResult.data;

    // 2. Build map of existing SKU IDs → quantity in target cart
    const existingSkus = new Map<string, number>();
    for (const bag of targetCart.bags) {
      for (const item of bag.items) {
        existingSkus.set(item.skuId, item.quantity);
      }
    }

    // 3. For each anonymous item, add to target or update qty
    const errors: string[] = [];
    let mergedCount = 0;
    for (const bag of anonCart.bags) {
      for (const item of bag.items) {
        const existingQty = existingSkus.get(item.skuId);
        if (existingQty !== undefined) {
          // SKU exists in target — increase quantity
          const updateResult = await adapter.updateCartItem(
            data.targetVioletCartId,
            item.skuId,
            existingQty + item.quantity,
          );
          if (updateResult.error) {
            errors.push(
              `Failed to update qty for SKU ${item.skuId}: ${updateResult.error.message}`,
            );
          } else {
            mergedCount++;
          }
        } else {
          // New SKU — add to target cart
          const addResult = await adapter.addToCart(data.targetVioletCartId, {
            skuId: item.skuId,
            quantity: item.quantity,
          });
          if (addResult.error) {
            errors.push(`Failed to add SKU ${item.skuId}: ${addResult.error.message}`);
          } else {
            mergedCount++;
          }
        }
      }
    }

    // 4. Only mark anonymous cart as merged if at least one item transferred.
    // If all items failed, keep the cart active so the user can retry.
    const supabase = getSupabaseServer();
    if (mergedCount > 0) {
      await supabase
        .from("carts")
        .update({ status: "merged" })
        .eq("violet_cart_id", data.anonymousVioletCartId);
    }

    // 5. Update the cookie to point to the target cart
    setCookie("violet_cart_id", data.targetVioletCartId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return {
      success: mergedCount > 0,
      targetVioletCartId: data.targetVioletCartId,
      mergedItemCount: mergedCount,
      errors: errors.length > 0 ? errors : undefined,
    };
  });

/**
 * Transfers ownership of an anonymous cart to an authenticated user.
 * Used when a guest logs in and has no prior authenticated cart.
 */
export const claimCartFn = createServerFn({ method: "POST" })
  .inputValidator((data: { violetCartId: string; userId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = getSupabaseServer();
    // Only claim carts that have no owner (anonymous) — prevents authenticated users
    // from stealing another user's cart by guessing sequential Violet cart IDs.
    const { error } = await supabase
      .from("carts")
      .update({ user_id: data.userId, session_id: null })
      .eq("violet_cart_id", data.violetCartId)
      .is("user_id", null);
    return { success: !error, error: error?.message };
  });
