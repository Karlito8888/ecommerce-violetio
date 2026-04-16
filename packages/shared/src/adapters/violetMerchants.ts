/**
 * Violet Merchant API client — commission rate management.
 *
 * Provides functions to:
 * - Set a merchant's commission rate for the channel
 *
 * @see https://docs.violet.io/api-reference/apps/commission-rates
 */

import type { ApiResponse } from "../types/index.js";
import type { AppInstall, SetCommissionRateInput } from "../types/admin.types.js";
import { fetchWithRetry } from "./violetFetch.js";
import type { CatalogContext } from "./violetCatalog.js";

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
