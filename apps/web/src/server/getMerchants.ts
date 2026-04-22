import { createServerFn } from "@tanstack/react-start";
import type { MerchantRow } from "@ecommerce/shared";
import { getSupabaseServer } from "./supabaseServer";

/**
 * Server Function — fetch all connected merchants from Supabase.
 *
 * Reads from the `merchants` table (populated by MERCHANT_CONNECTED webhook).
 * This is the local source of truth — no Violet API call needed.
 *
 * Returns only CONNECTED merchants, sorted alphabetically.
 */
export const getMerchantsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<MerchantRow[]> => {
    const supabase = getSupabaseServer();

    const { data, error } = await supabase
      .from("merchants")
      .select("merchant_id, name, platform, status, commission_rate, connected_at, updated_at")
      .in("status", ["CONNECTED", "ENABLED"])
      .order("name", { ascending: true });

    if (error) return [];
    return (data ?? []) as MerchantRow[];
  },
);
