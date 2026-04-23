/**
 * Mobile fetch function for products via the web backend API.
 *
 * Implements the ProductsFetchFn interface from @ecommerce/shared so the shared
 * productsInfiniteQueryOptions hook works on mobile via the web backend
 * (Violet credentials stay server-side, never in the JS bundle).
 */
import type { ProductsFetchFn } from "@ecommerce/shared";
import { apiGet } from "./apiClient";

export const fetchProductsMobile: ProductsFetchFn = async (params) => {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params.category) qs.set("category", params.category);
  if (params.minPrice !== undefined) qs.set("minPrice", String(params.minPrice));
  if (params.maxPrice !== undefined) qs.set("maxPrice", String(params.maxPrice));
  if (params.inStock === true) qs.set("inStock", "true");
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  if (params.sortDirection) qs.set("sortDirection", params.sortDirection);

  try {
    return await apiGet(`/api/products?${qs}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[getProducts] Failed to fetch from web backend:",
      err instanceof Error ? err.message : err,
    );
    return {
      data: null,
      error: {
        code: "GET_PRODUCTS.HTTP_ERROR",
        message: "Failed to fetch products from web backend",
      },
    };
  }
};
