/**
 * Webhook event processors for Violet TRANSFER_* events.
 *
 * Handles fund movement tracking: TRANSFER_SENT, TRANSFER_FAILED,
 * TRANSFER_REVERSED, TRANSFER_PARTIALLY_REVERSED.
 *
 * ## Why these processors matter
 *
 * Failed transfers mean a merchant hasn't been paid. These processors:
 * - Persist transfer status in `order_transfers` table
 * - Log errors for admin dashboard visibility
 * - Enable alerting and retry workflows
 *
 * ## Architecture
 *
 * Follows the same pattern as orderProcessors.ts — separate file for
 * transfer domain logic isolation.
 *
 * @see https://docs.violet.io/prism/payments/payments-during-checkout/guides/handling-failed-transfers
 * @see https://docs.violet.io/prism/payments/payments-during-checkout/transfer-reversals
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { VioletTransferPayload } from "../_shared/schemas.ts";
import { updateEventStatus } from "./processors.ts";

/**
 * Upserts a transfer record from webhook payload.
 *
 * Resolves the internal order_id from violet_order_id for the FK relationship.
 * Falls back to storing just violet_order_id if the order isn't in our DB yet
 * (race condition with webhook ordering).
 */
async function upsertTransfer(
  supabase: SupabaseClient,
  payload: VioletTransferPayload,
): Promise<void> {
  const violetTransferId = String(payload.id);
  const violetOrderId = payload.related_orders?.[0]
    ? String(payload.related_orders[0])
    : null;
  const violetBagId = payload.related_bags?.[0]
    ? String(payload.related_bags[0])
    : null;

  // Resolve internal order_id
  let orderId: string | null = null;
  if (violetOrderId) {
    const { data: orderRow } = await supabase
      .from("orders")
      .select("id")
      .eq("violet_order_id", violetOrderId)
      .single();
    orderId = orderRow?.id ?? null;
  }

  const row: Record<string, unknown> = {
    violet_transfer_id: violetTransferId,
    order_id: orderId,
    violet_order_id: violetOrderId ?? "",
    violet_bag_id: violetBagId,
    merchant_id: String(payload.merchant_id),
    payment_provider_transfer_id: payload.payment_provider_transfer_id ?? null,
    status: payload.status ?? "PENDING",
    amount_cents: payload.amount ?? 0,
    currency: payload.currency ?? "USD",
    errors: payload.errors?.length ? payload.errors : null,
    synced_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("order_transfers")
    .upsert(row, { onConflict: "violet_transfer_id" });

  if (error) {
    console.error(
      `[transferProcessors] Failed to upsert transfer ${violetTransferId}: ${error.message}`,
    );
  } else {
    console.log(
      `[transferProcessors] Upserted transfer ${violetTransferId} status=${payload.status ?? "PENDING"} merchant=${payload.merchant_id}`,
    );
  }
}

/**
 * Processes TRANSFER_SENT events — merchant payout succeeded.
 *
 * Updates the transfer record to SENT status. This confirms the merchant
 * has received their funds.
 */
export async function processTransferSent(
  supabase: SupabaseClient,
  eventId: string,
  payload: VioletTransferPayload,
): Promise<void> {
  try {
    await upsertTransfer(supabase, payload);
    await updateEventStatus(supabase, eventId, "processed");
  } catch (err) {
    await updateEventStatus(
      supabase,
      eventId,
      "failed",
      err instanceof Error ? err.message : "Unknown error in processTransferSent",
    );
  }
}

/**
 * Processes TRANSFER_FAILED events — merchant payout failed.
 *
 * This is the critical processor. A failed transfer means a merchant is owed money
 * but hasn't received it. Common causes:
 * - Missing payout account (merchant hasn't set up Stripe Connect)
 * - KYC incomplete (verification pending)
 * - Insufficient platform funds
 * - Regulatory restrictions
 *
 * The errors array contains detailed failure reasons for admin diagnosis.
 *
 * @see https://docs.violet.io/prism/payments/payments-during-checkout/guides/handling-failed-transfers
 */
export async function processTransferFailed(
  supabase: SupabaseClient,
  eventId: string,
  payload: VioletTransferPayload,
): Promise<void> {
  try {
    await upsertTransfer(supabase, payload);

    // Log detailed error info for admin visibility
    const errorSummary = payload.errors
      ?.map((e) => `[${e.error_code ?? "unknown"}] ${e.error_message ?? "No message"}`)
      .join("; ") ?? "No error details provided";

    console.warn(
      `[transferProcessors] TRANSFER_FAILED: transfer=${payload.id} merchant=${payload.merchant_id} amount=${payload.amount} errors: ${errorSummary}`,
    );

    await updateEventStatus(supabase, eventId, "processed");
  } catch (err) {
    await updateEventStatus(
      supabase,
      eventId,
      "failed",
      err instanceof Error ? err.message : "Unknown error in processTransferFailed",
    );
  }
}

/**
 * Processes TRANSFER_REVERSED events — full reversal of a previously sent transfer.
 *
 * Occurs when a full refund is processed and the merchant's payout needs to be
 * clawed back entirely.
 */
export async function processTransferReversed(
  supabase: SupabaseClient,
  eventId: string,
  payload: VioletTransferPayload,
): Promise<void> {
  try {
    await upsertTransfer(supabase, payload);
    await updateEventStatus(supabase, eventId, "processed");
  } catch (err) {
    await updateEventStatus(
      supabase,
      eventId,
      "failed",
      err instanceof Error ? err.message : "Unknown error in processTransferReversed",
    );
  }
}

/**
 * Processes TRANSFER_PARTIALLY_REVERSED events — partial reversal of a transfer.
 *
 * Occurs when a partial refund is processed. Only part of the original transfer
 * amount is clawed back from the merchant.
 */
export async function processTransferPartiallyReversed(
  supabase: SupabaseClient,
  eventId: string,
  payload: VioletTransferPayload,
): Promise<void> {
  try {
    await upsertTransfer(supabase, payload);
    await updateEventStatus(supabase, eventId, "processed");
  } catch (err) {
    await updateEventStatus(
      supabase,
      eventId,
      "failed",
      err instanceof Error
        ? err.message
        : "Unknown error in processTransferPartiallyReversed",
    );
  }
}
