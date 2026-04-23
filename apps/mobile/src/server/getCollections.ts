/**
 * Mobile fetch functions for collections via the web backend API.
 *
 * - Collections list: GET /api/collections (Violet API proxied through web backend).
 * - Collection detail: GET /api/collections/:id
 * - Collection products: GET /api/collections/:id/products
 *
 * @see audit-dual-backend.md — Phase 3 migration
 */
import type { ApiResponse, CollectionItem, PaginatedResult, Product } from "@ecommerce/shared";
import { apiGet } from "./apiClient";

/** Fetch all active collections from Violet API via web backend. */
export async function fetchCollectionsMobile(): Promise<ApiResponse<CollectionItem[]>> {
  try {
    return await apiGet<ApiResponse<CollectionItem[]>>("/api/collections");
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

/** Fetch a single collection by ID via web backend. */
export async function fetchCollectionByIdMobile(id: string): Promise<ApiResponse<CollectionItem>> {
  try {
    return await apiGet<ApiResponse<CollectionItem>>(`/api/collections/${id}`);
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

/** Fetch products for a collection via the web backend API. */
export async function fetchCollectionProductsMobile(
  collectionId: string,
  page = 1,
  pageSize = 12,
): Promise<ApiResponse<PaginatedResult<Product>>> {
  try {
    return await apiGet(
      `/api/collections/${collectionId}/products?page=${page}&pageSize=${pageSize}`,
    );
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
