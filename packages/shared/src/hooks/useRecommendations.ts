import { queryOptions, useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecommendationResponse } from "../types/index.js";
import { queryKeys } from "../utils/constants.js";
import { recommendationResponseSchema } from "../schemas/recommendation.schema.js";

/**
 * Creates TanStack Query options for product recommendations.
 *
 * Calls the `get-recommendations` Supabase Edge Function via `supabase.functions.invoke()`.
 * Response is validated with Zod before returning.
 *
 * Recommendations are loaded asynchronously and should NOT block the product page render.
 * If the fetch fails, consuming components should silently hide the section.
 *
 * Query key: `['recommendations', productId]`
 * staleTime: 5 minutes (recommendations are relatively stable).
 *
 * @param productId - The product to get recommendations for
 * @param supabaseClient - Supabase browser client (for `functions.invoke()`)
 * @param userId - Optional authenticated user ID for personalization
 */
export function recommendationQueryOptions(
  productId: string,
  supabaseClient: SupabaseClient,
  userId?: string,
) {
  return queryOptions({
    queryKey: queryKeys.recommendations.forProduct(productId),
    queryFn: async (): Promise<RecommendationResponse> => {
      const { data, error } = await supabaseClient.functions.invoke("get-recommendations", {
        body: {
          product_id: productId,
          ...(userId ? { user_id: userId } : {}),
        },
      });

      if (error) {
        throw new Error(error.message ?? "Recommendation request failed");
      }

      // Edge Function returns { data, error } envelope — unwrap it
      const envelope = data as { data: unknown; error: unknown };
      if (envelope.error) {
        const err = envelope.error as { message?: string };
        throw new Error(err.message ?? "Recommendations failed");
      }

      const parsed = recommendationResponseSchema.safeParse(envelope.data);
      if (!parsed.success) {
        throw new Error(`Invalid recommendation response: ${parsed.error.message}`);
      }

      return parsed.data as RecommendationResponse;
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!productId,
  });
}

/**
 * React hook for product recommendations.
 *
 * Wraps `recommendationQueryOptions()` with `useQuery()` for client-side usage.
 * Auto-disabled when productId is empty.
 *
 * @param productId - The product to get recommendations for
 * @param supabaseClient - Supabase browser client
 * @param userId - Optional authenticated user ID for personalization
 * @returns TanStack Query result with `RecommendationResponse` data
 */
export function useRecommendations(
  productId: string,
  supabaseClient: SupabaseClient,
  userId?: string,
) {
  return useQuery(recommendationQueryOptions(productId, supabaseClient, userId));
}
