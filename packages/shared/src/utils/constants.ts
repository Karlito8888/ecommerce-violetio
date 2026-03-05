import type { SearchFilters } from "../types/index.js";

/**
 * Base URL for the Violet.io commerce API.
 * Uses VIOLET_API_BASE env var in production, falls back to sandbox for development.
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
    list: (params?: { category?: string; page?: number }) => ["products", "list", params] as const,
    detail: (productId: string) => ["products", "detail", productId] as const,
  },
  cart: {
    current: () => ["cart", "current"] as const,
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
} as const;
