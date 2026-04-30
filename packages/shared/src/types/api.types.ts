/**
 * API response discriminated union type.
 * All Server Functions and Edge Functions must return this shape.
 * Error codes follow pattern: DOMAIN.ACTION_FAILURE (e.g., CART.ADD_FAILED, VIOLET.API_ERROR)
 */
export type ApiResponse<T> = { data: T; error: null } | { data: null; error: ApiError };

export interface ApiError {
  /** Error code following pattern DOMAIN.ACTION_FAILURE */
  code: string;
  message: string;
}

// ─── Checkout API Response Types ────────────────────────────────────────────
//
// These types represent the contract between API Routes (web backend) and
// the mobile app. Both web and mobile share the same API shape.
// The web uses server functions directly; mobile calls API Routes via apiClient.

/**
 * Payment intent response from the web backend API Route.
 *
 * Returned by `GET /api/cart/:cartId/payment-intent`.
 * Subset of `PaymentIntent` (from order.types.ts) — only the fields needed
 * client-side to initialise Stripe PaymentSheet / PaymentElement.
 */
export interface PaymentIntentApiResponse {
  clientSecret: string;
  /** Stripe publishable key from Violet — may differ from env key in Demo/Test Mode */
  stripePublishableKey?: string;
}

/**
 * Order submission response from the web backend API Route.
 *
 * Returned by `POST /api/cart/:cartId/submit`.
 * Subset of `OrderSubmitResult` (from order.types.ts) — only the fields needed
 * client-side to determine the next action (success / 3DS / rejected / canceled).
 */
export interface SubmitOrderApiResponse {
  /** Violet order ID (numeric, as string per our ID convention) */
  id: string;
  /** Order status — determines next action */
  status: string;
}

/** Generic paginated result wrapper used by catalog and other list endpoints. */
export interface PaginatedResult<T> {
  data: T[];
  /** Total count of items across all pages. Null when the API doesn't provide it
   *  (e.g., GET /catalog/offers/merchants/{id} always returns 0). */
  total: number | null;
  page: number;
  pageSize: number;
  hasNext: boolean;
}
