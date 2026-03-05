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

/** Generic paginated result wrapper used by catalog and other list endpoints. */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}
