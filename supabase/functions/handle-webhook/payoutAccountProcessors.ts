/**
 * Webhook event processors for Violet MERCHANT_PAYOUT_ACCOUNT_* events.
 *
 * Handles:
 * - MERCHANT_PAYOUT_ACCOUNT_CREATED: New PPA created during merchant onboarding
 * - MERCHANT_PAYOUT_ACCOUNT_REQUIREMENTS_UPDATED: Stripe KYC requirements changed
 *
 * ## Why these processors matter
 *
 * Without PPA tracking, we have no visibility into merchant payout readiness:
 * - A merchant may be connected but unable to receive payouts (KYC incomplete)
 * - Stripe may add new requirements over time (past_due = urgent action needed)
 * - EXTERNAL accounts indicate manual payout handling is required
 *
 * ## KYC Alerting Strategy
 *
 * After persisting the PPA data, the processor checks for critical conditions
 * and logs them to `error_logs` for admin dashboard visibility:
 *
 * | Condition                  | Severity | Log type                             |
 * |----------------------------|----------|--------------------------------------|
 * | `past_due` non-empty       | CRITICAL | PAYOUT_ACCOUNT_KYC_PAST_DUE          |
 * | `currently_due` non-empty  | WARNING  | PAYOUT_ACCOUNT_KC_DUE                |
 * | `charges_enabled = false`  | WARNING  | PAYOUT_ACCOUNT_CHarges_DISABLED      |
 * | `payouts_enabled = false`  | WARNING  | PAYOUT_ACCOUNT_PAYOUTS_DISABLED      |
 * | EXTERNAL account           | INFO     | PAYOUT_ACCOUNT_EXTERNAL              |
 *
 * @see https://docs.violet.io/prism/payments/payouts/prism-payout-accounts
 * @see supabase/migrations/20260416000000_merchant_payout_accounts.sql
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { VioletPayoutAccountPayload } from "../_shared/schemas.ts";
import { updateEventStatus } from "./processors.ts";

/**
 * Extracts a consistent merchant_id from the PPA payload.
 *
 * Violet may send `merchant_id` or `account_id` (when account_type = "MERCHANT").
 * Falls back to empty string if neither is present.
 */
function extractMerchantId(payload: VioletPayoutAccountPayload): string {
  return String(payload.merchant_id ?? payload.account_id ?? "");
}

/**
 * Maps PPA webhook payload to a merchant_payout_accounts upsert row.
 */
function mapToRow(payload: VioletPayoutAccountPayload) {
  const providerAccount = payload.payment_provider_account;
  const requirements = providerAccount?.requirements;

  return {
    violet_payout_account_id: String(payload.id),
    merchant_id: extractMerchantId(payload),
    app_id: payload.app_id != null ? String(payload.app_id) : null,
    is_active: payload.is_active ?? false,
    country_code: payload.country_code ?? providerAccount?.banking_country ?? null,
    payment_provider: (payload.payment_provider ?? "STRIPE").toUpperCase(),
    payment_provider_account_id: payload.payment_provider_account_id ?? null,
    account_type: providerAccount?.account_type ?? null,
    charges_enabled: providerAccount?.charges_enabled ?? null,
    payouts_enabled: providerAccount?.payouts_enabled ?? null,
    banking_country: providerAccount?.banking_country ?? null,
    banking_currency: providerAccount?.banking_currency ?? null,
    requirements: requirements ?? null,
    currently_due: requirements?.currently_due ?? [],
    past_due: requirements?.past_due ?? [],
    pending_verification: requirements?.pending_verification ?? [],
    errors: payload.errors ?? [],
    date_created: payload.date_created ?? new Date().toISOString(),
    date_last_modified: payload.date_last_modified ?? new Date().toISOString(),
    synced_at: new Date().toISOString(),
  };
}

/**
 * Checks for critical KYC conditions and logs them to error_logs.
 */
async function logKycAlerts(
  supabase: SupabaseClient,
  payload: VioletPayoutAccountPayload,
): Promise<void> {
  const merchantId = extractMerchantId(payload);
  if (!merchantId) return;

  const providerAccount = payload.payment_provider_account;
  const provider = (payload.payment_provider ?? "STRIPE").toUpperCase();
  const requirements = providerAccount?.requirements;

  const baseContext: Record<string, unknown> = {
    merchant_id: merchantId,
    payout_account_id: String(payload.id),
    payment_provider: provider,
  };

  // ─── EXTERNAL account (manual payout required) ─────────────────────
  if (provider === "EXTERNAL") {
    await supabase.from("error_logs").insert({
      source: "webhook",
      error_type: "PAYOUT_ACCOUNT_EXTERNAL",
      message: `Merchant ${merchantId} has EXTERNAL payout account — transfers must be processed manually`,
      context: baseContext,
    });
    return; // No Stripe KYC checks for EXTERNAL accounts
  }

  // ─── charges_enabled = false ────────────────────────────────────────
  if (providerAccount && providerAccount.charges_enabled === false) {
    await supabase.from("error_logs").insert({
      source: "webhook",
      error_type: "PAYOUT_ACCOUNT_CHARGES_DISABLED",
      message: `Merchant ${merchantId} charges are disabled — Stripe cannot accept transfers`,
      context: { ...baseContext, charges_enabled: false },
    });
  }

  // ─── payouts_enabled = false ────────────────────────────────────────
  if (providerAccount && providerAccount.payouts_enabled === false) {
    await supabase.from("error_logs").insert({
      source: "webhook",
      error_type: "PAYOUT_ACCOUNT_PAYOUTS_DISABLED",
      message: `Merchant ${merchantId} payouts are disabled — Stripe cannot send funds to bank`,
      context: { ...baseContext, payouts_enabled: false },
    });
  }

  // ─── past_due requirements (CRITICAL) ──────────────────────────────
  if (requirements?.past_due && requirements.past_due.length > 0) {
    await supabase.from("error_logs").insert({
      source: "webhook",
      error_type: "PAYOUT_ACCOUNT_KYC_PAST_DUE",
      message: `Merchant ${merchantId} has ${requirements.past_due.length} past-due KYC requirements — account may be disabled by Stripe`,
      context: { ...baseContext, past_due: requirements.past_due },
    });
  }

  // ─── currently_due requirements (WARNING) ───────────────────────────
  if (requirements?.currently_due && requirements.currently_due.length > 0) {
    await supabase.from("error_logs").insert({
      source: "webhook",
      error_type: "PAYOUT_ACCOUNT_KYC_DUE",
      message: `Merchant ${merchantId} has ${requirements.currently_due.length} KYC requirements currently due`,
      context: { ...baseContext, currently_due: requirements.currently_due },
    });
  }
}

/**
 * Upserts a PPA record from webhook payload.
 *
 * Handles both MERCHANT_PAYOUT_ACCOUNT_CREATED and
 * MERCHANT_PAYOUT_ACCOUNT_REQUIREMENTS_UPDATED since the data model is the same.
 * Uses ON CONFLICT on violet_payout_account_id for idempotency.
 */
async function upsertPayoutAccount(
  supabase: SupabaseClient,
  payload: VioletPayoutAccountPayload,
): Promise<void> {
  const merchantId = extractMerchantId(payload);

  if (!merchantId) {
    console.warn(
      `[payoutAccount] No merchant_id in payload for PPA ${payload.id} — skipping upsert`,
    );
    return;
  }

  const row = mapToRow(payload);

  const { error } = await supabase
    .from("merchant_payout_accounts")
    .upsert(row, { onConflict: "violet_payout_account_id" });

  if (error) {
    console.error(
      `[payoutAccount] Failed to upsert PPA ${payload.id} for merchant ${merchantId}: ${error.message}`,
    );
  } else {
    console.log(
      `[payoutAccount] Upserted PPA ${payload.id} merchant=${merchantId} provider=${row.payment_provider} active=${row.is_active} charges=${row.charges_enabled} payouts=${row.payouts_enabled}`,
    );
  }
}

/**
 * Processes MERCHANT_PAYOUT_ACCOUNT_CREATED events.
 *
 * Fired when a new Prism Pay Account is created for a merchant.
 * Typically happens during Violet Connect onboarding when the merchant
 * sets up their Stripe Connect account.
 *
 * Actions:
 * 1. Upsert PPA record into merchant_payout_accounts
 * 2. Log KYC alerts if any requirements are pending
 * 3. Log creation event for admin visibility
 */
export async function processPayoutAccountCreated(
  supabase: SupabaseClient,
  eventId: string,
  payload: VioletPayoutAccountPayload,
): Promise<void> {
  try {
    const merchantId = extractMerchantId(payload);
    const provider = (payload.payment_provider ?? "STRIPE").toUpperCase();
    const isActive = payload.is_active ?? false;

    console.log(
      `[payoutAccount] PPA created: id=${payload.id} merchant=${merchantId} provider=${provider} active=${isActive}`,
    );

    // 1. Upsert PPA record
    await upsertPayoutAccount(supabase, payload);

    // 2. Log KYC alerts
    await logKycAlerts(supabase, payload);

    // 3. Log creation event for admin dashboard
    await supabase.from("error_logs").insert({
      source: "webhook",
      error_type: "MERCHANT_PAYOUT_ACCOUNT_CREATED",
      message: `Payout account created for merchant ${merchantId} (${provider}, active=${isActive})`,
      context: {
        merchant_id: merchantId,
        payout_account_id: String(payload.id),
        payment_provider: provider,
        is_active: isActive,
        country_code: payload.country_code ?? null,
      },
    });

    await updateEventStatus(supabase, eventId, "processed");
  } catch (err) {
    await updateEventStatus(
      supabase,
      eventId,
      "failed",
      err instanceof Error
        ? err.message
        : "Unknown error in processPayoutAccountCreated",
    );
  }
}

/**
 * Processes MERCHANT_PAYOUT_ACCOUNT_REQUIREMENTS_UPDATED events.
 *
 * Fired when Stripe updates KYC requirements for a merchant's Connect account.
 * This is the critical webhook for proactive KYC monitoring:
 * - `past_due` fields mean the account may be disabled soon
 * - `currently_due` fields need collection before a deadline
 * - `pending_verification` fields are undergoing async checks
 *
 * Actions:
 * 1. Upsert updated PPA record (requirements may have changed)
 * 2. Log KYC alerts for any new issues
 * 3. Log update event for audit trail
 */
export async function processPayoutAccountRequirementsUpdated(
  supabase: SupabaseClient,
  eventId: string,
  payload: VioletPayoutAccountPayload,
): Promise<void> {
  try {
    const merchantId = extractMerchantId(payload);
    const requirements = payload.payment_provider_account?.requirements;

    const pastDueCount = requirements?.past_due?.length ?? 0;
    const currentlyDueCount = requirements?.currently_due?.length ?? 0;
    const pendingCount = requirements?.pending_verification?.length ?? 0;

    console.log(
      `[payoutAccount] Requirements updated: id=${payload.id} merchant=${merchantId} past_due=${pastDueCount} currently_due=${currentlyDueCount} pending=${pendingCount}`,
    );

    // 1. Upsert updated PPA record
    await upsertPayoutAccount(supabase, payload);

    // 2. Log KYC alerts (critical for past_due)
    await logKycAlerts(supabase, payload);

    // 3. Log update event for audit trail
    await supabase.from("error_logs").insert({
      source: "webhook",
      error_type: "MERCHANT_PAYOUT_ACCOUNT_REQUIREMENTS_UPDATED",
      message: `Payout account requirements updated for merchant ${merchantId}: ${pastDueCount} past-due, ${currentlyDueCount} currently-due, ${pendingCount} pending`,
      context: {
        merchant_id: merchantId,
        payout_account_id: String(payload.id),
        past_due_count: pastDueCount,
        currently_due_count: currentlyDueCount,
        pending_verification_count: pendingCount,
        past_due: requirements?.past_due ?? [],
        currently_due: requirements?.currently_due ?? [],
      },
    });

    await updateEventStatus(supabase, eventId, "processed");
  } catch (err) {
    await updateEventStatus(
      supabase,
      eventId,
      "failed",
      err instanceof Error
        ? err.message
        : "Unknown error in processPayoutAccountRequirementsUpdated",
    );
  }
}

/**
 * Processes MERCHANT_PAYOUT_ACCOUNT_DELETED events.
 *
 * Fired when a Prism Pay Account is deleted via DELETE /payout_accounts/{id}.
 * This happens when a PPA was created incorrectly (wrong country, wrong business type)
 * or during administrative cleanup.
 *
 * The payload is minimal: `{ "id": 123456 }` — just the Violet PPA ID.
 *
 * Actions:
 * 1. Soft-delete: set is_active = false on the matching row
 * 2. Log deletion event for audit trail
 *
 * @see https://docs.violet.io/prism/payments/payouts/prism-payout-accounts/delete-payout-accounts
 */
export async function processPayoutAccountDeleted(
  supabase: SupabaseClient,
  eventId: string,
  payload: { id: number },
): Promise<void> {
  try {
    const ppaId = String(payload.id);

    console.log(
      `[payoutAccount] PPA deleted: id=${ppaId}`,
    );

    // 1. Soft-delete: mark as inactive
    const { data: row, error: updateError } = await supabase
      .from("merchant_payout_accounts")
      .update({ is_active: false, synced_at: new Date().toISOString() })
      .eq("violet_payout_account_id", ppaId)
      .select("merchant_id")
      .maybeSingle();

    if (updateError) {
      console.error(
        `[payoutAccount] Failed to soft-delete PPA ${ppaId}: ${updateError.message}`,
      );
    } else if (row) {
      console.log(
        `[payoutAccount] Soft-deleted PPA ${ppaId} for merchant ${row.merchant_id}`,
      );
    } else {
      // PPA not in our DB — may have been deleted before we received the CREATED webhook
      console.log(
        `[payoutAccount] PPA ${ppaId} not found in DB — already absent`,
      );
    }

    // 2. Log deletion for audit trail
    await supabase.from("error_logs").insert({
      source: "webhook",
      error_type: "MERCHANT_PAYOUT_ACCOUNT_DELETED",
      message: `Payout account ${ppaId} deleted`,
      context: { payout_account_id: ppaId, merchant_id: row?.merchant_id ?? null },
    });

    await updateEventStatus(supabase, eventId, "processed");
  } catch (err) {
    await updateEventStatus(
      supabase,
      eventId,
      "failed",
      err instanceof Error
        ? err.message
        : "Unknown error in processPayoutAccountDeleted",
    );
  }
}

/**
 * Processes MERCHANT_PAYOUT_ACCOUNT_ACTIVATED events.
 *
 * Fired when a PPA is marked as the active payout account for a merchant.
 * Only one PPA can be active at any given time per merchant.
 *
 * Actions:
 * 1. Upsert PPA with is_active = true
 * 2. Deactivate other PPAs for the same merchant
 * 3. Log activation for audit trail
 *
 * @see https://docs.violet.io/prism/webhooks/events/payout-account-webhooks
 */
export async function processPayoutAccountActivated(
  supabase: SupabaseClient,
  eventId: string,
  payload: VioletPayoutAccountPayload,
): Promise<void> {
  try {
    const merchantId = extractMerchantId(payload);
    const ppaId = String(payload.id);

    console.log(
      `[payoutAccount] PPA activated: id=${ppaId} merchant=${merchantId}`,
    );

    // 1. Upsert PPA (will set is_active = true from payload)
    await upsertPayoutAccount(supabase, payload);

    // 2. Deactivate other PPAs for this merchant (only one active at a time)
    if (merchantId) {
      await supabase
        .from("merchant_payout_accounts")
        .update({ is_active: false, synced_at: new Date().toISOString() })
        .eq("merchant_id", merchantId)
        .neq("violet_payout_account_id", ppaId);
    }

    // 3. Log activation
    await supabase.from("error_logs").insert({
      source: "webhook",
      error_type: "MERCHANT_PAYOUT_ACCOUNT_ACTIVATED",
      message: `Payout account ${ppaId} activated for merchant ${merchantId}`,
      context: {
        merchant_id: merchantId,
        payout_account_id: ppaId,
        payment_provider: payload.payment_provider ?? "STRIPE",
      },
    });

    await updateEventStatus(supabase, eventId, "processed");
  } catch (err) {
    await updateEventStatus(
      supabase,
      eventId,
      "failed",
      err instanceof Error
        ? err.message
        : "Unknown error in processPayoutAccountActivated",
    );
  }
}

/**
 * Processes MERCHANT_PAYOUT_ACCOUNT_DEACTIVATED events.
 *
 * Fired when a PPA is deactivated — typically because another PPA was activated.
 * NOT an error — simply means another account is now active.
 *
 * Actions:
 * 1. Upsert PPA with is_active = false
 * 2. Log deactivation for audit trail
 *
 * @see https://docs.violet.io/prism/webhooks/events/payout-account-webhooks
 */
export async function processPayoutAccountDeactivated(
  supabase: SupabaseClient,
  eventId: string,
  payload: VioletPayoutAccountPayload,
): Promise<void> {
  try {
    const merchantId = extractMerchantId(payload);
    const ppaId = String(payload.id);

    console.log(
      `[payoutAccount] PPA deactivated: id=${ppaId} merchant=${merchantId}`,
    );

    // 1. Upsert PPA (will set is_active = false from payload)
    await upsertPayoutAccount(supabase, payload);

    // 2. Log deactivation
    await supabase.from("error_logs").insert({
      source: "webhook",
      error_type: "MERCHANT_PAYOUT_ACCOUNT_DEACTIVATED",
      message: `Payout account ${ppaId} deactivated for merchant ${merchantId}`,
      context: { merchant_id: merchantId, payout_account_id: ppaId },
    });

    await updateEventStatus(supabase, eventId, "processed");
  } catch (err) {
    await updateEventStatus(
      supabase,
      eventId,
      "failed",
      err instanceof Error
        ? err.message
        : "Unknown error in processPayoutAccountDeactivated",
    );
  }
}
