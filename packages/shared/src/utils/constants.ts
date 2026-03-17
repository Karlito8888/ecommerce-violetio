import type { ProductQuery, SearchFilters } from "../types/index.js";

/**
 * Base URL for the Violet.io commerce API.
 * Uses VIOLET_API_BASE env var in production, falls back to sandbox for development.
 *
 * @internal Server-side only — do not import in browser/mobile code
 */
export const VIOLET_API_BASE =
  (typeof process !== "undefined" && process.env?.VIOLET_API_BASE) ||
  "https://sandbox-api.violet.io/v1";

/**
 * TanStack Query key factories.
 *
 * Convention:
 *   ['domain', 'operation', params?]
 *
 * Using factory functions ensures keys are consistent across the codebase
 * and enables targeted cache invalidation.
 */
export const queryKeys = {
  products: {
    all: () => ["products"] as const,
    list: (params?: ProductQuery) => ["products", "list", params] as const,
    detail: (productId: string) => ["products", "detail", productId] as const,
  },
  cart: {
    current: () => ["cart", "current"] as const,
    detail: (cartId: string) => ["cart", "detail", cartId] as const,
    count: () => ["cart", "count"] as const,
  },
  orders: {
    all: () => ["orders"] as const,
    list: (params?: { status?: string }) => ["orders", "list", params] as const,
    detail: (orderId: string) => ["orders", "detail", orderId] as const,
  },
  search: {
    results: (params: { query: string; filters?: SearchFilters }) =>
      ["search", "results", params] as const,
  },
  user: {
    current: () => ["user", "current"] as const,
  },
  recommendations: {
    forProduct: (productId: string) => ["recommendations", productId] as const,
  },
} as const;
