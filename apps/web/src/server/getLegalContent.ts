import { createServerFn } from "@tanstack/react-start";
import type { ApiResponse, ContentPage } from "@ecommerce/shared";
import { getContentPageBySlug, createSupabaseClient } from "@ecommerce/shared";

/** Valid legal page slugs — defense in depth against non-legal content_pages. */
export const LEGAL_SLUGS = new Set(["privacy", "terms", "cookies"]);

/**
 * Server Function for fetching a legal page by slug.
 * Reuses the shared getContentPageBySlug client (same table as editorial content).
 * Validates slug against allowlist to ensure only legal pages are served.
 */
export const getLegalContentFn = createServerFn({ method: "GET" })
  .inputValidator((input: string) => input)
  .handler(async ({ data: slug }): Promise<ApiResponse<ContentPage>> => {
    if (!LEGAL_SLUGS.has(slug)) {
      return { data: null, error: { code: "NOT_FOUND", message: "Legal page not found" } };
    }

    const client = createSupabaseClient();
    const result = await getContentPageBySlug(client, slug);
    if (!result) {
      return { data: null, error: { code: "NOT_FOUND", message: "Legal page not found" } };
    }
    return { data: result, error: null };
  });
