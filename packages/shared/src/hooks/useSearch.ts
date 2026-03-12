import { queryOptions, useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchQuery, SearchResponse } from "../types/index.js";
import { queryKeys } from "../utils/constants.js";
import { searchResponseSchema } from "../schemas/search.schema.js";

/**
 * Creates TanStack Query options for semantic product search.
 *
 * Calls the `search-products` Supabase Edge Function via `supabase.functions.invoke()`.
 * Response is validated with Zod before returning.
 *
 * ## Why export queryOptions separately from the hook?
 *
 * TanStack Start SSR `loader` functions need the raw queryOptions object for
 * server-side prefetching (`queryClient.prefetchQuery(searchQueryOptions(...))`).
 * The `useSearch()` hook wraps this for client-side convenience.
 * Both are needed for the web SSR + mobile dual-platform architecture.
 *
 * Query key: `['search', 'results', { query, ...filters }]`
 * staleTime: 2 minutes (search results are more dynamic than catalog data).
 *
 * @param params - Search query and optional filters
 * @param supabaseClient - Supabase browser client (for `functions.invoke()`)
 */
export function searchQueryOptions(params: SearchQuery, supabaseClient: SupabaseClient) {
  return queryOptions({
    queryKey: queryKeys.search.results({ query: params.query, filters: params.filters }),
    queryFn: async (): Promise<SearchResponse> => {
      const { data, error } = await supabaseClient.functions.invoke("search-products", {
        body: params,
      });

      if (error) {
        throw new Error(error.message ?? "Search request failed");
      }

      // Edge Function returns { data, error } envelope — unwrap it
      const envelope = data as { data: unknown; error: unknown };
      if (envelope.error) {
        const err = envelope.error as { message?: string };
        throw new Error(err.message ?? "Search failed");
      }

      /**
       * Zod validation ensures the Edge Function response matches our expected schema.
       * This catches breaking changes in the Edge Function response format at runtime
       * instead of letting them propagate as undefined field accesses in the UI.
       */
      const parsed = searchResponseSchema.safeParse(envelope.data);
      if (!parsed.success) {
        throw new Error(`Invalid search response: ${parsed.error.message}`);
      }

      return parsed.data as SearchResponse;
    },
    staleTime: 120_000,
    enabled: !!params.query && params.query.length >= 2,
  });
}

/**
 * React hook for AI-powered semantic product search.
 *
 * Wraps `searchQueryOptions()` with `useQuery()` for client-side usage.
 * Auto-disabled when query is empty or < 2 characters.
 *
 * ## Usage
 * ```tsx
 * const { data, isLoading, error } = useSearch(
 *   { query: "gift for dad", filters: { maxPrice: 5000 } },
 *   supabaseClient
 * );
 * ```
 *
 * ## Why this hook exists (H1 code review fix)
 *
 * AC7 requires exporting `useSearch()` as the primary interface for both
 * web and mobile consumers. `searchQueryOptions()` is also exported for
 * SSR prefetching in TanStack Start loaders.
 *
 * @param params - Search query and optional filters
 * @param supabaseClient - Supabase browser client
 * @returns TanStack Query result with `SearchResponse` data
 */
export function useSearch(params: SearchQuery, supabaseClient: SupabaseClient) {
  return useQuery(searchQueryOptions(params, supabaseClient));
}
