import { createServerFn } from "@tanstack/react-start";
import type { FaqCategory } from "@ecommerce/shared";
import { getFaqItems, createSupabaseClient } from "@ecommerce/shared";

/**
 * Server Function for fetching FAQ items grouped by category.
 * Uses anon client so RLS naturally filters unpublished items.
 */
export const getFaqItemsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<FaqCategory[]> => {
    const client = createSupabaseClient();
    return getFaqItems(client);
  },
);
