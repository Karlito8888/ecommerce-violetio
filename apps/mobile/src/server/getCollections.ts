/**
 * Mobile fetch functions for collections.
 *
 * - Collections list: queries Supabase `collections` table directly (public read, RLS SELECT true).
 * - Collection products: calls `get-collection-products` Edge Function (Violet creds stay server-side).
 */
import Constants from "expo-constants";
import type { ApiResponse, CollectionItem, PaginatedResult, Product } from "@ecommerce/shared";

function getSupabaseUrl(): string {
  return (
    Constants.expoConfig?.extra?.supabaseUrl ??
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    "http://10.0.2.2:54321"
  );
}

function getAnonKey(): string {
  return (
    Constants.expoConfig?.extra?.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ""
  );
}

/** Fetch all active collections from Supabase (direct REST query). */
export async function fetchCollectionsMobile(): Promise<ApiResponse<CollectionItem[]>> {
  const supabaseUrl = getSupabaseUrl();
  const anonKey = getAnonKey();

  const url =
    `${supabaseUrl}/rest/v1/collections` +
    `?status=eq.ACTIVE&select=id,merchant_id,name,handle,description,type,status,external_id,image_url,image_alt,sort_order,date_created,date_last_modified` +
    `&order=sort_order.asc,name.asc`;

  try {
    const res = await fetch(url, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      return {
        data: null,
        error: { code: "COLLECTIONS.HTTP_ERROR", message: `Supabase returned ${res.status}` },
      };
    }

    const rows = (await res.json()) as Array<Record<string, unknown>>;

    const collections: CollectionItem[] = rows.map((row) => ({
      id: String(row.id ?? ""),
      merchantId: String(row.merchant_id ?? ""),
      name: String(row.name ?? ""),
      handle: String(row.handle ?? ""),
      description: String(row.description ?? ""),
      type: String(row.type ?? "CUSTOM") as "CUSTOM" | "AUTOMATED",
      status: String(row.status ?? "ACTIVE") as
        | "ACTIVE"
        | "INACTIVE"
        | "SYNC_IN_PROGRESS"
        | "FOR_DELETION",
      externalId: String(row.external_id ?? ""),
      imageUrl: row.image_url ? String(row.image_url) : null,
      imageAlt: row.image_alt ? String(row.image_alt) : null,
      sortOrder: Number(row.sort_order ?? 0),
      productCount: 0,
      dateCreated: String(row.date_created ?? ""),
      dateLastModified: String(row.date_last_modified ?? ""),
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
}

/** Fetch a single collection by ID from Supabase. */
export async function fetchCollectionByIdMobile(id: string): Promise<ApiResponse<CollectionItem>> {
  const supabaseUrl = getSupabaseUrl();
  const anonKey = getAnonKey();

  const url =
    `${supabaseUrl}/rest/v1/collections` +
    `?id=eq.${encodeURIComponent(id)}&status=eq.ACTIVE&select=id,merchant_id,name,handle,description,type,status,external_id,image_url,image_alt,sort_order,date_created,date_last_modified` +
    `&limit=1`;

  try {
    const res = await fetch(url, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      return {
        data: null,
        error: { code: "COLLECTIONS.HTTP_ERROR", message: `Supabase returned ${res.status}` },
      };
    }

    const rows = (await res.json()) as Array<Record<string, unknown>>;
    const row = rows[0];
    if (!row) {
      return {
        data: null,
        error: { code: "COLLECTIONS.NOT_FOUND", message: `Collection ${id} not found` },
      };
    }

    return {
      data: {
        id: String(row.id ?? ""),
        merchantId: String(row.merchant_id ?? ""),
        name: String(row.name ?? ""),
        handle: String(row.handle ?? ""),
        description: String(row.description ?? ""),
        type: String(row.type ?? "CUSTOM") as "CUSTOM" | "AUTOMATED",
        status: String(row.status ?? "ACTIVE") as
          | "ACTIVE"
          | "INACTIVE"
          | "SYNC_IN_PROGRESS"
          | "FOR_DELETION",
        externalId: String(row.external_id ?? ""),
        imageUrl: row.image_url ? String(row.image_url) : null,
        imageAlt: row.image_alt ? String(row.image_alt) : null,
        sortOrder: Number(row.sort_order ?? 0),
        productCount: 0,
        dateCreated: String(row.date_created ?? ""),
        dateLastModified: String(row.date_last_modified ?? ""),
      },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: {
        code: "COLLECTIONS.UNEXPECTED",
        message: err instanceof Error ? err.message : "Failed",
      },
    };
  }
}

/** Fetch products for a collection via get-collection-products Edge Function. */
export async function fetchCollectionProductsMobile(
  collectionId: string,
  page = 1,
  pageSize = 12,
): Promise<ApiResponse<PaginatedResult<Product>>> {
  const supabaseUrl = getSupabaseUrl();
  const anonKey = getAnonKey();

  const qs = new URLSearchParams({
    collection_id: collectionId,
    page: String(page),
    pageSize: String(pageSize),
  });

  const url = `${supabaseUrl}/functions/v1/get-collection-products?${qs}`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
    });

    if (!res.ok) {
      return {
        data: null,
        error: {
          code: "COLLECTION_PRODUCTS.HTTP_ERROR",
          message: `Edge Function returned ${res.status}`,
        },
      };
    }

    return res.json();
  } catch (err) {
    return {
      data: null,
      error: {
        code: "COLLECTION_PRODUCTS.UNEXPECTED",
        message: err instanceof Error ? err.message : "Failed",
      },
    };
  }
}
