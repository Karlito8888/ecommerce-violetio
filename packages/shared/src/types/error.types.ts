/**
 * Error handling types for Story 4.7 — Checkout Error Handling & Edge Cases.
 *
 * These types support:
 * - Structured checkout error display (bag-level and cart-level)
 * - Cart health monitoring and recovery
 * - Persistent error logging to Supabase
 */

/** Structured checkout error for UI display. */
export interface CheckoutError {
  /** Error code: DOMAIN.ACTION_FAILURE pattern */
  code: string;
  /** User-friendly error message */
  message: string;
  /** Error severity determines UI treatment */
  severity: "warning" | "error" | "critical";
  /** Which bag/merchant this error belongs to (omit for cart-level errors) */
  bagId?: string;
  /** Which SKU this error affects (for inventory errors) */
  skuId?: string;
  /** Whether the user can retry this operation */
  retryable: boolean;
}

/**
 * Cart health status for recovery logic.
 *
 * - `healthy`: Cart is valid and up-to-date
 * - `stale`: Cart data is outdated, refetching from Violet
 * - `expired`: Violet cart no longer valid (404 or error), user must start fresh
 * - `invalid`: Cart in unexpected state, needs investigation
 */
export type CartHealthStatus = "healthy" | "stale" | "expired" | "invalid";

/** Error log entry shape matching the Supabase `error_logs` table. */
export interface ErrorLogEntry {
  source: "web" | "mobile" | "edge-function";
  error_type: string;
  message: string;
  stack_trace?: string;
  context?: Record<string, unknown>;
  user_id?: string;
  session_id?: string;
}
