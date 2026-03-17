import { queryOptions } from "@tanstack/react-query";
import type {
  ApiResponse,
  ContentPage,
  ContentListParams,
  ContentListResult,
} from "../types/index.js";
import { queryKeys } from "../utils/constants.js";

/**
 * Platform-agnostic fetch function for a single content page by slug.
 * Web: wraps a TanStack Start Server Function.
 * Mobile: wraps a direct Supabase query.
 */
export type ContentDetailFetchFn = (slug: string) => Promise<ApiResponse<ContentPage>>;

/**
 * Platform-agnostic fetch function for content page listings.
 */
export type ContentListFetchFn = (
  params: ContentListParams,
) => Promise<ApiResponse<ContentListResult>>;

/**
 * Query options for a single content page detail (by slug).
 * Used in route loader for SSR and in component via useSuspenseQuery.
 *
 * Stale time: 10 minutes — content changes less frequently than catalog data.
 */
export function contentDetailQueryOptions(slug: string, fetchFn: ContentDetailFetchFn) {
  return queryOptions({
    queryKey: queryKeys.content.detail(slug),
    queryFn: () => fetchFn(slug),
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Query options for paginated content listing.
 * Used by Story 7.2 (Content Listing & Navigation).
 */
export function contentListQueryOptions(params: ContentListParams, fetchFn: ContentListFetchFn) {
  return queryOptions({
    queryKey: queryKeys.content.list(params),
    queryFn: () => fetchFn(params),
    staleTime: 5 * 60 * 1000,
  });
}
