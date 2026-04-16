/**
 * Violet Payout Account API operations.
 *
 * Fetches Prism Pay Account (PPA) data from Violet's API:
 * - `GET /payments/{account_type}/{account_id}/payout_account` — active PPA
 * - `GET /payments/{account_type}/{account_id}/payout_accounts` — all PPAs
 * - `GET /payments/payout_accounts/{payout_account_id}` — PPA by ID
 *
 * All endpoints support `extended=true` to include the full Stripe Connect
 * account details (KYC status, requirements, charges/payouts enabled).
 *
 * ## When to use these APIs vs webhooks
 *
 * Webhooks (MERCHANT_PAYOUT_ACCOUNT_*) populate the `merchant_payout_accounts` DB
 * table in real-time. These direct API calls are for:
 * - Admin manual refresh of a merchant's PPA status
 * - Fetching `extended` details not always present in webhook payloads
 * - Recovering from missed webhooks
 *
 * @see https://docs.violet.io/api-reference/payments/payout-accounts
 * @see https://docs.violet.io/api-reference/payments/payout-accounts/get-payout-account
 * @see https://docs.violet.io/api-reference/payments/payout-accounts/get-payout-accounts
 * @see https://docs.violet.io/api-reference/payments/payout-accounts/get-payout-account-by-id
 */

import { z } from "zod";
import { fetchWithRetry } from "./violetFetch.js";
import type { CatalogContext } from "./violetCatalog.js";
import type { VioletPayoutAccount, PayoutAccountError } from "../types/payoutAccount.types.js";

// ─── Zod Schemas ────────────────────────────────────────────────────

/** Error associated to a Payout Account. */
const payoutAccountErrorSchema = z.object({
  id: z.number(),
  payout_account_id: z.number(),
  error_code: z.number().nullable().optional(),
  error_message: z.string(),
  resolved: z.boolean().nullable().optional(),
  date_resolved: z.string().nullable().optional(),
  date_created: z.string().nullable().optional(),
});

/** Stripe requirements embedded in payment_provider_account. */
const stripeRequirementsSchema = z.object({
  alternatives: z.array(z.string()).optional(),
  currently_due: z.array(z.string()).optional(),
  errors: z.array(z.string()).optional(),
  eventually_due: z.array(z.string()).optional(),
  past_due: z.array(z.string()).optional(),
  pending_verification: z.array(z.string()).optional(),
});

/** Stripe Connect account details (extended=true). */
const stripeProviderAccountSchema = z.object({
  account_id: z.string().optional(),
  account_type: z.string().optional(),
  email: z.string().optional(),
  banking_country: z.string().optional(),
  banking_currency: z.string().optional(),
  charges_enabled: z.boolean().optional(),
  payouts_enabled: z.boolean().optional(),
  requirements: stripeRequirementsSchema.optional(),
  date_created: z.string().optional(),
  date_last_modified: z.string().optional(),
});

/**
 * Zod schema for Violet PayoutAccount API response.
 *
 * Matches the OpenAPI PayoutAccount schema exactly.
 * `payment_provider_account` is only populated when `extended=true`.
 *
 * @see billing-service.yaml — PayoutAccount schema
 */
export const violetPayoutAccountSchema = z.object({
  id: z.number(),
  account_type: z.enum(["MERCHANT", "DEVELOPER"]).nullable().optional(),
  account_id: z.number().nullable().optional(),
  merchant_id: z.number().nullable().optional(),
  app_id: z.number().nullable().optional(),
  is_active: z.boolean(),
  country_code: z.string().nullable().optional(),
  payment_provider: z.enum(["STRIPE", "NUVEI", "CREDOVA", "EXTERNAL"]),
  payment_provider_account_id: z.string().nullable().optional(),
  payment_provider_account_type: z
    .enum(["EXPRESS", "CUSTOM", "STANDARD", "PLATFORM"])
    .nullable()
    .optional(),
  payment_provider_metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  payment_provider_account: stripeProviderAccountSchema.nullable().optional(),
  date_deactivated: z.string().nullable().optional(),
  errors: z.array(payoutAccountErrorSchema).optional(),
  date_created: z.string().nullable().optional(),
  date_last_modified: z.string().nullable().optional(),
});

export type VioletPayoutAccountResponse = z.infer<typeof violetPayoutAccountSchema>;

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Transforms a Violet API PayoutAccount response to our internal type.
 *
 * Converts nullable/optional fields to consistent internal representation.
 */
function transformPayoutAccount(raw: VioletPayoutAccountResponse): VioletPayoutAccount {
  const providerAccount = raw.payment_provider_account ?? null;

  return {
    id: raw.id,
    account_type: raw.account_type ?? null,
    account_id: raw.account_id ?? null,
    merchant_id: raw.merchant_id ?? null,
    app_id: raw.app_id ?? null,
    is_active: raw.is_active ?? false,
    country_code: raw.country_code ?? null,
    payment_provider: raw.payment_provider ?? "STRIPE",
    payment_provider_account_id: raw.payment_provider_account_id ?? null,
    payment_provider_account_type: raw.payment_provider_account_type ?? null,
    payment_provider_metadata: raw.payment_provider_metadata ?? null,
    payment_provider_account: providerAccount
      ? {
          account_id: providerAccount.account_id ?? "",
          account_type: (providerAccount.account_type ??
            "EXPRESS") as VioletPayoutAccount["payment_provider_account"] extends infer T
            ? NonNullable<T> extends { account_type: infer U }
              ? U
              : never
            : never,
          email: providerAccount.email,
          banking_country: providerAccount.banking_country ?? "",
          banking_currency: providerAccount.banking_currency ?? "",
          charges_enabled: providerAccount.charges_enabled ?? false,
          payouts_enabled: providerAccount.payouts_enabled ?? false,
          requirements: {
            alternatives: providerAccount.requirements?.alternatives ?? [],
            currently_due: providerAccount.requirements?.currently_due ?? [],
            errors: providerAccount.requirements?.errors ?? [],
            eventually_due: providerAccount.requirements?.eventually_due ?? [],
            past_due: providerAccount.requirements?.past_due ?? [],
            pending_verification: providerAccount.requirements?.pending_verification ?? [],
          },
          date_created: providerAccount.date_created,
          date_last_modified: providerAccount.date_last_modified,
        }
      : null,
    date_deactivated: raw.date_deactivated ?? null,
    errors: (raw.errors ?? []) as PayoutAccountError[],
    date_created: raw.date_created ?? null,
    date_last_modified: raw.date_last_modified ?? null,
  };
}

// ─── API Calls ──────────────────────────────────────────────────────

/**
 * Fetches the active Payout Account for a merchant.
 *
 * Calls `GET /payments/MERCHANT/{merchant_id}/payout_account?extended=true&app_id={app_id}`.
 * Returns the currently active PPA for the merchant-app combination.
 * Only one PPA may be active at a time.
 *
 * @param ctx - Catalog context with API base URL and token manager
 * @param merchantId - Violet merchant ID
 * @param appId - Violet app ID (optional, targets specific app)
 * @returns The active PayoutAccount with extended Stripe details, or null if none exists
 *
 * @see https://docs.violet.io/api-reference/payments/payout-accounts/get-payout-account
 */
export async function getActivePayoutAccount(
  ctx: CatalogContext,
  merchantId: string,
  appId?: string,
): Promise<VioletPayoutAccount | null> {
  const params = new URLSearchParams({ extended: "true" });
  if (appId) params.set("app_id", appId);

  const result = await fetchWithRetry(
    `${ctx.apiBase}/payments/MERCHANT/${merchantId}/payout_account?${params}`,
    { method: "GET" },
    ctx.tokenManager,
  );

  if (result.error) {
    // 404 means no active PPA — not an error condition
    if (result.error.code === "VIOLET.NOT_FOUND") return null;
    return null;
  }

  const parsed = violetPayoutAccountSchema.safeParse(result.data);
  if (!parsed.success) return null;

  return transformPayoutAccount(parsed.data);
}

/**
 * Fetches all Payout Accounts for a merchant.
 *
 * Calls `GET /payments/MERCHANT/{merchant_id}/payout_accounts?extended=true`.
 * Returns all PPAs including inactive ones (history).
 *
 * @param ctx - Catalog context with API base URL and token manager
 * @param merchantId - Violet merchant ID
 * @param appId - Violet app ID (optional, targets specific app)
 * @returns Array of all PayoutAccounts for the merchant
 *
 * @see https://docs.violet.io/api-reference/payments/payout-accounts/get-payout-accounts
 */
export async function getAllPayoutAccounts(
  ctx: CatalogContext,
  merchantId: string,
  appId?: string,
): Promise<VioletPayoutAccount[]> {
  const params = new URLSearchParams({ extended: "true" });
  if (appId) params.set("app_id", appId);

  const result = await fetchWithRetry(
    `${ctx.apiBase}/payments/MERCHANT/${merchantId}/payout_accounts?${params}`,
    { method: "GET" },
    ctx.tokenManager,
  );

  if (result.error) return [];

  const raw = result.data;
  if (!Array.isArray(raw)) return [];

  const accounts: VioletPayoutAccount[] = [];
  for (const item of raw) {
    const parsed = violetPayoutAccountSchema.safeParse(item);
    if (parsed.success) {
      accounts.push(transformPayoutAccount(parsed.data));
    }
  }

  return accounts;
}

/**
 * Fetches a Payout Account by its Violet ID.
 *
 * Calls `GET /payments/payout_accounts/{payout_account_id}?extended=true`.
 * Useful for fetching a specific PPA when you know its ID (e.g., from a webhook).
 *
 * @param ctx - Catalog context with API base URL and token manager
 * @param payoutAccountId - Violet Payout Account ID
 * @returns The PayoutAccount with extended Stripe details, or null if not found
 *
 * @see https://docs.violet.io/api-reference/payments/payout-accounts/get-payout-account-by-id
 */
export async function getPayoutAccountById(
  ctx: CatalogContext,
  payoutAccountId: string,
): Promise<VioletPayoutAccount | null> {
  const result = await fetchWithRetry(
    `${ctx.apiBase}/payments/payout_accounts/${payoutAccountId}?extended=true`,
    { method: "GET" },
    ctx.tokenManager,
  );

  if (result.error) {
    if (result.error.code === "VIOLET.NOT_FOUND") return null;
    return null;
  }

  const parsed = violetPayoutAccountSchema.safeParse(result.data);
  if (!parsed.success) return null;

  return transformPayoutAccount(parsed.data);
}
