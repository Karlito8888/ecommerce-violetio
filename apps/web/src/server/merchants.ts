/**
 * Server functions for Violet Merchant management.
 *
 * Used by the admin dashboard to:
 * - Set merchant commission rates
 *
 * @see https://docs.violet.io/api-reference/apps/commission-rates
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAdapter } from "./violetAdapter";
import type { ApiResponse, AppInstall } from "@ecommerce/shared";

/**
 * Set the commission rate for a merchant's app install.
 *
 * The commission rate is a percentage (0–50 for channels). When locked,
 * the merchant cannot override it. Returns the updated AppInstall record.
 *
 * @see https://docs.violet.io/api-reference/apps/commission-rates/set-merchant-app-commission-rate
 */
export const setCommissionRateFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const schema = z.object({
      merchantId: z.string().min(1),
      commissionRate: z.number().min(0).max(50),
      commissionLocked: z.boolean(),
    });
    return schema.parse(input);
  })
  .handler(async ({ data }): Promise<ApiResponse<AppInstall>> => {
    const adapter = getAdapter();
    return adapter.setCommissionRate(data);
  });
