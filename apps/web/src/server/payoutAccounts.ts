/**
 * Server functions for Violet Payout Account management.
 *
 * Used by the admin dashboard to:
 * - Fetch active PPA for a merchant (with Stripe KYC details)
 * - Fetch all PPAs for a merchant (including inactive)
 * - Fetch a specific PPA by ID
 * - Sync PPA data to the `merchant_payout_accounts` DB table
 *
 * @see https://docs.violet.io/api-reference/payments/payout-accounts
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAdapter } from "./violetAdapter";
import { getSupabaseServer } from "./supabaseServer";
import { requireAdminOrThrow } from "./adminAuthGuard";

const merchantInputSchema = z.object({
  merchantId: z.string().min(1),
  appId: z.string().optional(),
});

const payoutAccountIdSchema = z.object({
  payoutAccountId: z.string().min(1),
});

/**
 * Fetches the active Payout Account for a merchant.
 * Includes Stripe Connect KYC details (extended=true).
 *
 * @see https://docs.violet.io/api-reference/payments/payout-accounts/get-payout-account
 */
export const getActivePayoutAccountFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => merchantInputSchema.parse(input))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ data }): Promise<any> => {
    await requireAdminOrThrow();
    const adapter = getAdapter();
    return adapter.getActivePayoutAccount(data.merchantId, data.appId);
  });

/**
 * Fetches all Payout Accounts for a merchant (active + inactive history).
 *
 * @see https://docs.violet.io/api-reference/payments/payout-accounts/get-payout-accounts
 */
export const getAllPayoutAccountsFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => merchantInputSchema.parse(input))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ data }): Promise<any> => {
    await requireAdminOrThrow();
    const adapter = getAdapter();
    return adapter.getAllPayoutAccounts(data.merchantId, data.appId);
  });

/**
 * Fetches a specific Payout Account by its Violet ID.
 *
 * @see https://docs.violet.io/api-reference/payments/payout-accounts/get-payout-account-by-id
 */
export const getPayoutAccountByIdFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => payoutAccountIdSchema.parse(input))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ data }): Promise<any> => {
    await requireAdminOrThrow();
    const adapter = getAdapter();
    return adapter.getPayoutAccountById(data.payoutAccountId);
  });

/**
 * Syncs PPA data from Violet API into the merchant_payout_accounts DB table.
 *
 * Fetches all PPAs for a merchant and upserts them into the database.
 * This recovers from missed webhooks and refreshes KYC status.
 */
export const syncPayoutAccountsFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ merchantId: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    await requireAdminOrThrow();
    const adapter = getAdapter();
    const supabase = getSupabaseServer();

    const result = await adapter.getAllPayoutAccounts(data.merchantId);
    if (result.error) return { data: null, error: result.error };

    const accounts = result.data;
    if (accounts.length === 0) return { data: { synced: 0 }, error: null };

    let synced = 0;
    for (const ppa of accounts) {
      const providerAccount = ppa.payment_provider_account;
      const requirements = providerAccount?.requirements;

      const row = {
        violet_payout_account_id: String(ppa.id),
        merchant_id: String(ppa.merchant_id ?? data.merchantId),
        app_id: ppa.app_id != null ? String(ppa.app_id) : null,
        is_active: ppa.is_active,
        country_code: ppa.country_code ?? providerAccount?.banking_country ?? null,
        payment_provider: ppa.payment_provider,
        payment_provider_account_id: ppa.payment_provider_account_id ?? null,
        account_type: ppa.payment_provider_account_type ?? null,
        charges_enabled: providerAccount?.charges_enabled ?? null,
        payouts_enabled: providerAccount?.payouts_enabled ?? null,
        banking_country: providerAccount?.banking_country ?? null,
        banking_currency: providerAccount?.banking_currency ?? null,
        requirements: requirements ?? null,
        currently_due: requirements?.currently_due ?? [],
        past_due: requirements?.past_due ?? [],
        pending_verification: requirements?.pending_verification ?? [],
        errors: ppa.errors as unknown[],
        synced_at: new Date().toISOString(),
      };

      const { error: upsertError } = await supabase
        .from("merchant_payout_accounts")
        .upsert(row, { onConflict: "violet_payout_account_id" });

      if (!upsertError) synced++;
    }

    return { data: { synced }, error: null };
  });
