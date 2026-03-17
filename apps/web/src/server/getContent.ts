import { createServerFn } from "@tanstack/react-start";
import type {
  ApiResponse,
  ContentPage,
  ContentListParams,
  ContentListResult,
} from "@ecommerce/shared";
import { getContentPageBySlug, getContentPages } from "@ecommerce/shared";
import { createSupabaseClient } from "@ecommerce/shared";

/* ─── Server Functions ─────────────────────────────────────────────────── */

/**
 * Server Function for fetching a single content page by slug.
 * Uses anon client so RLS naturally filters unpublished content.
 */
export const getContentBySlugFn = createServerFn({ method: "GET" })
  .inputValidator((input: string) => input)
  .handler(async ({ data: slug }): Promise<ApiResponse<ContentPage>> => {
    const client = createSupabaseClient();
    const result = await getContentPageBySlug(client, slug);
    if (!result) {
      return { data: null, error: { code: "NOT_FOUND", message: "Content not found" } };
    }
    return { data: result, error: null };
  });

/**
 * Server Function for fetching paginated content listings.
 * Used by Story 7.2 (Content Listing & Navigation).
 */
export const getContentListFn = createServerFn({ method: "GET" })
  .inputValidator((input: ContentListParams) => input)
  .handler(async ({ data: params }): Promise<ApiResponse<ContentListResult>> => {
    const client = createSupabaseClient();
    const result = await getContentPages(client, params);
    return { data: result, error: null };
  });
