/**
 * Violet Merchant API client — merchant listing, details, and commission rate management.
 *
 * Provides functions to:
 * - List all connected merchants (GET /merchants)
 * - Fetch individual merchant details (GET /merchants/{id})
 * - Set a merchant's commission rate for the channel
 *
 * @see https://docs.violet.io/api-reference/merchants/get-merchants
 * @see https://docs.violet.io/api-reference/merchants/get-merchant-by-id
 * @see https://docs.violet.io/api-reference/apps/commission-rates
 */

import type { ApiResponse } from "../types/index.js";
import type { MerchantDetail, MerchantRow } from "../types/orderPersistence.types.js";
import type { AppInstall, SetCommissionRateInput } from "../types/admin.types.js";
import { fetchWithRetry } from "./violetFetch.js";
import type { CatalogContext } from "./violetCatalog.js";

/**
 * List all connected merchants from Violet API.
 *
 * GET /v1/merchants?page=1&size=50
 *
 * Returns a list of merchants compatible with MerchantRow format,
 * used by the merchants listing page (web + mobile).
 *
 * When `withOfferCounts` is true, fetches the published offer count
 * for each merchant via GET /catalog/offers/merchants/{id}/count.
 * Counts are fetched in parallel (fire-and-forget on error → null).
 *
 * @see https://docs.violet.io/api-reference/merchants/get-merchants
 * @see https://docs.violet.io/api-reference/catalog/offers/count-merchant-offers
 */
export async function listMerchants(
  ctx: CatalogContext,
  withOfferCounts = false,
): Promise<ApiResponse<MerchantRow[]>> {
  const result = await fetchWithRetry(
    `${ctx.apiBase}/merchants?page=1&size=50`,
    { method: "GET" },
    ctx.tokenManager,
  );

  if (result.error) return { data: null, error: result.error };

  const data = result.data as {
    content: Array<Record<string, unknown>>;
  };

  const merchants: MerchantRow[] = (data.content ?? []).map((raw) => ({
    merchant_id: String(raw.id ?? ""),
    name: String(raw.name ?? "Unknown"),
    platform: (raw.source as string) ?? null,
    status: (raw.connection_status as string) ?? "UNKNOWN",
    commission_rate: raw.commission_rate != null ? Number(raw.commission_rate) : null,
    connected_at: (raw.date_created as string) ?? new Date().toISOString(),
    updated_at: (raw.date_last_modified as string) ?? new Date().toISOString(),
    offer_count: null,
  }));

  // Enrich with offer counts if requested
  if (withOfferCounts && merchants.length > 0) {
    const countPromises = merchants.map(async (m, i) => {
      try {
        const count = await getMerchantOfferCount(ctx, m.merchant_id);
        merchants[i] = { ...m, offer_count: count };
      } catch {
        // Fire-and-forget — count stays null
      }
    });
    await Promise.all(countPromises);
  }

  return { data: merchants, error: null };
}

/**
 * Get the number of published offers for a specific merchant.
 *
 * GET /catalog/offers/merchants/{merchant_id}/count
 *
 * Returns the count as a number, or null on error.
 *
 * @see https://docs.violet.io/api-reference/catalog/offers/count-merchant-offers
 */
export async function getMerchantOfferCount(
  ctx: CatalogContext,
  merchantId: string,
): Promise<number | null> {
  const result = await fetchWithRetry(
    `${ctx.apiBase}/catalog/offers/merchants/${merchantId}/count`,
    { method: "GET" },
    ctx.tokenManager,
  );

  if (result.error || result.data == null) return null;

  // Violet may return a plain number or { count: N }
  if (typeof result.data === "number") return result.data;
  const obj = result.data as Record<string, unknown>;
  if (typeof obj.count === "number") return obj.count;
  return null;
}

/**
 * Fetch details for a single merchant by ID.
 *
 * GET /v1/merchants/{merchant_id}
 *
 * Returns enriched merchant data including store URL, currency, and status.
 *
 * @see https://docs.violet.io/api-reference/merchants/get-merchant-by-id
 */
export async function getMerchantById(
  ctx: CatalogContext,
  merchantId: string,
): Promise<ApiResponse<MerchantDetail>> {
  const result = await fetchWithRetry(
    `${ctx.apiBase}/merchants/${merchantId}`,
    { method: "GET" },
    ctx.tokenManager,
  );

  if (result.error) return { data: null, error: result.error };

  const merchant = mapMerchantDetail(result.data);
  return { data: merchant, error: null };
}

/**
 * Set the commission rate for a merchant's app install.
 *
 * PUT /v1/apps/{app_id}/merchants/{merchant_id}/commission_rate
 *
 * The commission rate is a percentage (0–50 for channels). When locked,
 * the merchant cannot override it.
 *
 * Returns the updated AppInstall record.
 *
 * @see https://docs.violet.io/api-reference/apps/commission-rates/set-merchant-app-commission-rate
 */
export async function setCommissionRate(
  ctx: CatalogContext,
  appId: string,
  input: SetCommissionRateInput,
): Promise<ApiResponse<AppInstall>> {
  const result = await fetchWithRetry(
    `${ctx.apiBase}/apps/${appId}/merchants/${input.merchantId}/commission_rate`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        commission_rate: input.commissionRate,
        commission_locked: input.commissionLocked,
      }),
    },
    ctx.tokenManager,
  );

  if (result.error) return { data: null, error: result.error };

  const install = mapAppInstall(result.data);
  return { data: install, error: null };
}

// ─── Internal helpers ────────────────────────────────────────────────

function mapAppInstall(raw: unknown): AppInstall {
  const d = raw as Record<string, unknown>;
  return {
    id: String(d.id ?? ""),
    appId: String(d.app_id ?? ""),
    merchantId: String(d.merchant_id ?? ""),
    scope: (d.scope as string) ?? "",
    status: (d.status as string) ?? "",
    installSource: (d.install_source as string) ?? "",
    commissionRate: Number(d.commission_rate ?? 0),
    commissionLocked: (d.commission_locked as boolean) ?? false,
    dateCreated: (d.date_created as string) ?? "",
    dateLastModified: (d.date_last_modified as string) ?? "",
  };
}

function mapMerchantDetail(raw: unknown): MerchantDetail {
  const d = raw as Record<string, unknown>;
  return {
    id: String(d.id ?? ""),
    name: String(d.name ?? "Unknown"),
    platform: (d.source as string) ?? null,
    status: (d.status as string) ?? "UNKNOWN",
    commissionRate: d.commission_rate != null ? Number(d.commission_rate) : null,
    currency: (d.currency as string) ?? null,
    storeUrl: (d.store_url as string) ?? null,
    connectedAt: (d.date_created as string) ?? null,
  };
}
