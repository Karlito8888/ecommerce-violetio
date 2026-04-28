import { createServerFn } from "@tanstack/react-start";
import type { ApiResponse, CollectionItem, PaginatedResult, Product } from "@ecommerce/shared";
import { getAdapter } from "./violetAdapter";
import { getSupabaseServer } from "./supabaseServer";
import { getCountryCookieFn } from "./geoip";

/** Supabase columns to select for collections. Shared by list and detail queries. */
const COLLECTION_COLUMNS =
  "id, merchant_id, name, handle, description, type, status, external_id, image_url, image_alt, sort_order, date_created, date_last_modified";

/**
 * Supabase row shape for the `collections` table.
 * Avoids `as Record<string, unknown>` casts for columns added by migration (handle, image_alt).
 */
interface CollectionRow {
  id: string;
  merchant_id: string;
  name: string;
  handle: string | null;
  description: string | null;
  type: string | null;
  status: string | null;
  external_id: string | null;
  image_url: string | null;
  image_alt: string | null;
  sort_order: number | null;
  date_created: string | null;
  date_last_modified: string | null;
}

/** Maps a Supabase collection row to a CollectionItem. */
function mapCollectionRow(row: CollectionRow, productCount = 0): CollectionItem {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    name: row.name,
    handle: row.handle ?? "",
    description: row.description ?? "",
    type: (row.type ?? "CUSTOM") as "CUSTOM" | "AUTOMATED",
    status: (row.status ?? "ACTIVE") as "ACTIVE" | "INACTIVE" | "SYNC_IN_PROGRESS" | "FOR_DELETION",
    externalId: row.external_id ?? "",
    imageUrl: row.image_url ?? null,
    imageAlt: row.image_alt ?? null,
    sortOrder: row.sort_order ?? 0,
    productCount,
    dateCreated: row.date_created ?? new Date().toISOString(),
    dateLastModified: row.date_last_modified ?? new Date().toISOString(),
  };
}

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
        .select(COLLECTION_COLUMNS)
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

      const collections: CollectionItem[] = ((data as CollectionRow[]) ?? []).map((row) =>
        mapCollectionRow(row, countsMap.get(row.id) ?? 0),
      );

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
        .select(COLLECTION_COLUMNS)
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
        data: mapCollectionRow(data as CollectionRow),
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
    const { countryCode } = await getCountryCookieFn();
    const adapter = getAdapter();
    return adapter.getCollectionOffers(
      data.collectionId,
      data.page ?? 1,
      data.pageSize ?? 12,
      countryCode ?? undefined,
    );
  });
