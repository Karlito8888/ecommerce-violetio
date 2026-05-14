/**
 * Violet collections operations: getCollections, getCollectionOffers,
 * getCollectionOfferIds, enableCollectionSync, enableMetadataSync,
 * enableSkuMetadataSync, toggleFeatureFlag.
 */

import type { ApiResponse, PaginatedResult, Product, CollectionItem } from "../types/index.js";
import type { VioletPaginatedResponse, VioletOfferResponse } from "../types/index.js";
import { transformOffer } from "./violetTransforms.js";
import { fetchWithRetry } from "./violetFetch.js";
import type { CatalogContext } from "./violetCatalog.js";
import { currencyParam } from "./violetCatalog.js";

/** TTL for the instance-level collections cache. Reduced to 2 min for freshness on webhook updates. */
const COLLECTIONS_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes (was 10 min)

/** Instance-level cache for collections (per adapter instance). */
export interface CollectionsCacheState {
  data: CollectionItem[];
  expiresAt: number;
}

/**
 * Invalidates the in-memory collections cache.
 *
 * Call this when a collection webhook event is received to ensure
 * the next getCollections() call fetches fresh data from Violet.
 */
export function invalidateCollectionsCache(
  setCache: (cache: CollectionsCacheState | null) => void,
): void {
  setCache(null);
}

/**
 * Fetches a single collection by its ID directly from Violet.
 *
 * Uses `GET /catalog/collections/{id}` instead of fetching all collections
 * and filtering client-side — avoids the N+1 pattern for collection detail pages.
 *
 * @see https://docs.violet.io/api-reference/catalog/collections/get-collection-by-id
 */
export async function getCollectionById(
  ctx: CatalogContext,
  collectionId: string,
): Promise<ApiResponse<CollectionItem>> {
  try {
    const url = `${ctx.apiBase}/catalog/collections/${collectionId}`;
    const result = await fetchWithRetry(url, { method: "GET" }, ctx.tokenManager);

    if (result.error) {
      return {
        data: null,
        error: { code: "NOT_FOUND", message: `Collection ${collectionId} not found` },
      };
    }

    const c = result.data as {
      id: number;
      name: string;
      description?: string;
      type?: "CUSTOM" | "AUTOMATED";
      merchant_id: number;
      external_id?: string;
      parent_id?: number;
      handle?: string;
      status?: string;
      media?: { source_url?: string; alt?: string; height?: number; width?: number };
      sort_order?: number;
      date_created?: string;
      date_last_modified?: string;
    };

    const imageUrl = c.media?.source_url ?? null;

    // Fetch product count via /offers/ids (page 1, size 1 — we only need total_elements)
    let productCount = 0;
    try {
      const countResult = await getCollectionOfferIds(ctx, collectionId, 1, 1);
      if (countResult.data) {
        productCount = countResult.data.total ?? 0;
      }
    } catch {
      // Non-fatal — productCount defaults to 0
    }

    return {
      data: {
        id: String(c.id),
        merchantId: String(c.merchant_id),
        name: c.name,
        handle: c.handle ?? "",
        description: c.description ?? "",
        type: c.type ?? "CUSTOM",
        status: (c.status ?? "ACTIVE") as
          | "ACTIVE"
          | "INACTIVE"
          | "SYNC_IN_PROGRESS"
          | "FOR_DELETION",
        externalId: c.external_id ?? "",
        imageUrl,
        imageAlt: c.media?.alt ?? null,
        sortOrder: c.sort_order ?? 0,
        productCount,
        dateCreated: c.date_created ?? new Date().toISOString(),
        dateLastModified: c.date_last_modified ?? new Date().toISOString(),
      },
      error: null,
    };
  } catch {
    return {
      data: null,
      error: { code: "NOT_FOUND", message: `Collection ${collectionId} not found` },
    };
  }
}

/**
 * Fetches product collections from Violet.
 *
 * @see https://docs.violet.io/api-reference/catalog/collections/get-collections
 */
export async function getCollections(
  ctx: CatalogContext,
  merchantId?: string,
  cache?: CollectionsCacheState | null,
  setCache?: (cache: CollectionsCacheState | null) => void,
): Promise<ApiResponse<CollectionItem[]>> {
  // Return cached collections if still fresh
  if (cache && Date.now() < cache.expiresAt) {
    return { data: cache.data, error: null };
  }

  try {
    let url: string;

    if (merchantId) {
      url = `${ctx.apiBase}/catalog/collections/merchants/${merchantId}`;
    } else {
      url = `${ctx.apiBase}/catalog/collections`;
    }

    const allCollections: CollectionItem[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const pagedUrl = `${url}?page=${page}&size=50&exclude_hidden=true`;
      const result = await fetchWithRetry(pagedUrl, { method: "GET" }, ctx.tokenManager);

      if (result.error) {
        return { data: [], error: null };
      }

      const data = result.data as {
        content: Array<{
          id: number;
          name: string;
          description?: string;
          type?: "CUSTOM" | "AUTOMATED";
          merchant_id: number;
          external_id?: string;
          parent_id?: number;
          handle?: string;
          status?: string;
          media?: { source_url?: string; alt?: string; height?: number; width?: number };
          sort_order?: number;
          date_created?: string;
          date_last_modified?: string;
        }>;
        last: boolean;
      };

      for (const c of data.content ?? []) {
        const imageUrl = c.media?.source_url ?? null;
        allCollections.push({
          id: String(c.id),
          merchantId: String(c.merchant_id),
          name: c.name,
          handle: c.handle ?? "",
          description: c.description ?? "",
          type: c.type ?? "CUSTOM",
          status: (c.status ?? "ACTIVE") as
            | "ACTIVE"
            | "INACTIVE"
            | "SYNC_IN_PROGRESS"
            | "FOR_DELETION",
          externalId: c.external_id ?? "",
          imageUrl,
          imageAlt: c.media?.alt ?? null,
          sortOrder: c.sort_order ?? 0,
          productCount: -1, // populated below via /offers/ids
          dateCreated: c.date_created ?? new Date().toISOString(),
          dateLastModified: c.date_last_modified ?? new Date().toISOString(),
        });
      }

      hasMore = !data.last;
      page++;
    }

    // Populate product counts in parallel (page 1, size 1 — only need total_elements)
    if (allCollections.length > 0) {
      const countResults = await Promise.allSettled(
        allCollections.map((col) => getCollectionOfferIds(ctx, col.id, 1, 1)),
      );
      for (let i = 0; i < countResults.length; i++) {
        const r = countResults[i]!;
        if (r.status === "fulfilled" && r.value.data) {
          allCollections[i]!.productCount = r.value.data.total ?? 0;
        }
      }
    }

    // Cache for 2 minutes (reduced from 10 min for better freshness on webhook updates)
    if (setCache) {
      setCache({
        data: allCollections,
        expiresAt: Date.now() + COLLECTIONS_CACHE_TTL_MS,
      });
    }

    return { data: allCollections, error: null };
  } catch {
    return { data: [], error: null };
  }
}

/**
 * Fetches offers (products) belonging to a specific collection.
 *
 * @see https://docs.violet.io/api-reference/catalog/collections/get-collection-offers
 */
export async function getCollectionOffers(
  ctx: CatalogContext,
  collectionId: string,
  page = 1,
  pageSize = 24,
  countryCode?: string,
): Promise<ApiResponse<PaginatedResult<Product>>> {
  const currencyQs = currencyParam(countryCode);
  const url =
    `${ctx.apiBase}/catalog/collections/${collectionId}/offers` +
    `?page=${page}&size=${pageSize}&exclude_hidden=true${currencyQs}`;

  const result = await fetchWithRetry(url, { method: "GET" }, ctx.tokenManager);

  if (result.error) {
    return {
      data: null,
      error: {
        code: "VIOLET.API_ERROR",
        message: `getCollectionOffers failed: ${result.error.message}`,
      },
    };
  }

  const data = result.data as VioletPaginatedResponse<VioletOfferResponse>;
  return {
    data: {
      data: data.content.map((offer) => transformOffer(offer)),
      total: data.total_elements,
      page: data.number + 1, // Violet returns 0-based `number`, convert to 1-based
      pageSize: data.size,
      hasNext: !data.last,
    },
    error: null,
  };
}

/**
 * Fetches only the offer IDs belonging to a specific collection.
 *
 * @see https://docs.violet.io/api-reference/catalog/collections/get-collection-offers-ids
 */
export async function getCollectionOfferIds(
  ctx: CatalogContext,
  collectionId: string,
  page = 1,
  pageSize = 50,
): Promise<ApiResponse<PaginatedResult<string>>> {
  const url =
    `${ctx.apiBase}/catalog/collections/${collectionId}/offers/ids` +
    `?page=${page}&size=${pageSize}&exclude_hidden=true`;

  const result = await fetchWithRetry(url, { method: "GET" }, ctx.tokenManager);

  if (result.error) {
    return {
      data: null,
      error: {
        code: "VIOLET.API_ERROR",
        message: `getCollectionOfferIds failed: ${result.error.message}`,
      },
    };
  }

  const data = result.data as {
    content: number[];
    last: boolean;
    total_elements: number;
    number: number;
    size: number;
  };

  return {
    data: {
      data: (data.content ?? []).map(String),
      total: data.total_elements,
      page: data.number + 1, // Violet returns 0-based `number`, convert to 1-based
      pageSize: data.size,
      hasNext: !data.last,
    },
    error: null,
  };
}

/**
 * Enables the `sync_collections` feature flag for a merchant.
 */
export async function enableCollectionSync(
  ctx: CatalogContext,
  merchantId: string,
): Promise<ApiResponse<void>> {
  return toggleFeatureFlag(ctx, merchantId, "sync_collections", true);
}

/**
 * Enables `sync_metadata` feature flag for a merchant (Offer-level).
 */
export async function enableMetadataSync(
  ctx: CatalogContext,
  merchantId: string,
): Promise<ApiResponse<void>> {
  return toggleFeatureFlag(ctx, merchantId, "sync_metadata", true);
}

/**
 * Enables `sync_sku_metadata` feature flag for a merchant (SKU-level).
 */
export async function enableSkuMetadataSync(
  ctx: CatalogContext,
  merchantId: string,
): Promise<ApiResponse<void>> {
  return toggleFeatureFlag(ctx, merchantId, "sync_sku_metadata", true);
}

/**
 * Enables the `contextual_pricing` feature flag for a merchant.
 * When enabled, Violet syncs presentment currencies from Shopify
 * and returns contextual prices when `base_currency` is provided.
 *
 * @see https://docs.violet.io/prism/catalog/contextual-pricing
 */
export async function enableContextualPricing(
  ctx: CatalogContext,
  merchantId: string,
): Promise<ApiResponse<void>> {
  return toggleFeatureFlag(ctx, merchantId, "contextual_pricing", true);
}

/**
 * Toggles a merchant configuration feature flag.
 *
 * @see https://docs.violet.io/api-reference/merchants/configuration/toggle-merchant-configuration-global-feature-flag
 */
async function toggleFeatureFlag(
  ctx: CatalogContext,
  merchantId: string,
  flagName: string,
  enabled: boolean,
): Promise<ApiResponse<void>> {
  const url = `${ctx.apiBase}/merchants/${merchantId}/configuration/global_feature_flags/${flagName}`;

  const result = await fetchWithRetry(
    url,
    {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    },
    ctx.tokenManager,
  );

  if (result.error) {
    return {
      data: null,
      error: {
        code: "VIOLET.API_ERROR",
        message: `toggleFeatureFlag(${flagName}) failed: ${result.error.message}`,
      },
    };
  }

  return { data: undefined, error: null };
}
