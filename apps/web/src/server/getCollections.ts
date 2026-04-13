import { createServerFn } from "@tanstack/react-start";
import type { ApiResponse, CollectionItem, PaginatedResult, Product } from "@ecommerce/shared";
import { getAdapter } from "./violetAdapter";
import { getSupabaseServer } from "./supabaseServer";

/**
 * Server Function — fetch all active collections from Supabase.
 *
 * Collections are synced from Violet via webhooks (COLLECTION_CREATED/UPDATED/REMOVED)
 * and stored in the `collections` table. We query Supabase directly instead of
 * calling Violet API — the data is already local, fresher (real-time via webhooks),
 * and avoids an extra network call.
 *
 * @see supabase/migrations/20260411000000_collections_metadata.sql
 * @see https://docs.violet.io/prism/catalog/collections
 */
export const getCollectionsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ApiResponse<CollectionItem[]>> => {
    try {
      const supabase = getSupabaseServer();
      const { data, error } = await supabase
        .from("collections")
        .select(
          "id, merchant_id, name, handle, description, type, status, external_id, image_url, image_alt, sort_order, date_created, date_last_modified",
        )
        .eq("status", "ACTIVE")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) {
        return { data: null, error: { code: "COLLECTIONS.DB_ERROR", message: error.message } };
      }

      // Fetch product counts per collection from the junction table
      const collectionIds = (data ?? []).map((r) => r.id);
      const countsMap = new Map<string, number>();

      if (collectionIds.length > 0) {
        const { data: countRows } = await supabase
          .from("collection_offers")
          .select("collection_id")
          .in("collection_id", collectionIds);

        if (countRows) {
          for (const row of countRows) {
            countsMap.set(row.collection_id, (countsMap.get(row.collection_id) ?? 0) + 1);
          }
        }
      }

      const collections: CollectionItem[] = (data ?? []).map((row) => ({
        id: row.id,
        merchantId: row.merchant_id,
        name: row.name,
        handle: ((row as Record<string, unknown>).handle as string) ?? "",
        description: row.description ?? "",
        type: (row.type ?? "CUSTOM") as "CUSTOM" | "AUTOMATED",
        status: (row.status ?? "ACTIVE") as
          | "ACTIVE"
          | "INACTIVE"
          | "SYNC_IN_PROGRESS"
          | "FOR_DELETION",
        externalId: row.external_id ?? "",
        imageUrl: row.image_url ?? null,
        imageAlt: ((row as Record<string, unknown>).image_alt as string | null) ?? null,
        sortOrder: row.sort_order ?? 0,
        productCount: countsMap.get(row.id) ?? 0,
        dateCreated: row.date_created ?? new Date().toISOString(),
        dateLastModified: row.date_last_modified ?? new Date().toISOString(),
      }));

      return { data: collections, error: null };
    } catch (err) {
      return {
        data: null,
        error: {
          code: "COLLECTIONS.UNEXPECTED",
          message: err instanceof Error ? err.message : "Failed to fetch collections",
        },
      };
    }
  },
);

/**
 * Server Function — fetch a single collection by ID from Supabase.
 */
export const getCollectionByIdFn = createServerFn({ method: "GET" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }): Promise<ApiResponse<CollectionItem>> => {
    try {
      const supabase = getSupabaseServer();
      const { data, error } = await supabase
        .from("collections")
        .select(
          "id, merchant_id, name, handle, description, type, status, external_id, image_url, image_alt, sort_order, date_created, date_last_modified",
        )
        .eq("id", id)
        .eq("status", "ACTIVE")
        .single();

      if (error || !data) {
        return {
          data: null,
          error: {
            code: "COLLECTIONS.NOT_FOUND",
            message: error?.message ?? `Collection ${id} not found`,
          },
        };
      }

      return {
        data: {
          id: data.id,
          merchantId: data.merchant_id,
          name: data.name,
          handle: ((data as Record<string, unknown>).handle as string) ?? "",
          description: data.description ?? "",
          type: (data.type ?? "CUSTOM") as "CUSTOM" | "AUTOMATED",
          status: (data.status ?? "ACTIVE") as
            | "ACTIVE"
            | "INACTIVE"
            | "SYNC_IN_PROGRESS"
            | "FOR_DELETION",
          externalId: data.external_id ?? "",
          imageUrl: data.image_url ?? null,
          imageAlt: ((data as Record<string, unknown>).image_alt as string | null) ?? null,
          sortOrder: data.sort_order ?? 0,
          productCount: 0,
          dateCreated: data.date_created ?? new Date().toISOString(),
          dateLastModified: data.date_last_modified ?? new Date().toISOString(),
        },
        error: null,
      };
    } catch (err) {
      return {
        data: null,
        error: {
          code: "COLLECTIONS.UNEXPECTED",
          message: err instanceof Error ? err.message : "Failed to fetch collection",
        },
      };
    }
  });

/**
 * Server Function — fetch paginated products for a collection via Violet API.
 *
 * Calls `GET /catalog/collections/{id}/offers` via VioletAdapter.
 * Requires `sync_collections` feature flag enabled for the merchant.
 *
 * @see https://docs.violet.io/api-reference/catalog/collections/get-collection-offers
 */
export const getCollectionProductsFn = createServerFn({ method: "GET" })
  .inputValidator((input: { collectionId: string; page?: number; pageSize?: number }) => input)
  .handler(async ({ data }): Promise<ApiResponse<PaginatedResult<Product>>> => {
    const adapter = getAdapter();
    return adapter.getCollectionOffers(data.collectionId, data.page ?? 1, data.pageSize ?? 12);
  });
