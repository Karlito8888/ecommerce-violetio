/** Event types that can be tracked for personalization. */
export type TrackingEventType = "product_view" | "search" | "category_view";

/**
 * Payload for `product_view` events (AC #1).
 *
 * M1 code-review note: `offer_id` and `category` are optional because they
 * are NOT available from route params alone — the tracking listener only
 * knows the product_id from the URL (`/products/:productId`). Populating
 * these fields would require fetching the full product data on every page
 * view, which adds latency to the tracking hot path.
 *
 * Downstream consumers (Stories 6.3 Personalized Search, 6.5 Recommendations)
 * can enrich events at query time by JOINing `user_events.payload->>'product_id'`
 * with the product catalog.
 */
export interface ProductViewPayload {
  product_id: string;
  /** Violet offer ID — populated when product detail data is available. */
  offer_id?: string;
  /** Product category — populated when product detail data is available. */
  category?: string;
}

export interface SearchPayload {
  query: string;
  /**
   * Number of results returned for this search query.
   * H2 code-review fix: must be the actual count (not 0). Tracked from the
   * search page component where results are available, not the router listener.
   */
  result_count: number;
}

export interface CategoryViewPayload {
  category_id: string;
  category_name: string;
}

export type TrackingPayload = ProductViewPayload | SearchPayload | CategoryViewPayload;

export interface TrackingEvent {
  event_type: TrackingEventType;
  payload: TrackingPayload;
}

/** Row shape from the `user_events` table. */
export interface UserEvent {
  id: string;
  user_id: string;
  event_type: TrackingEventType;
  payload: TrackingPayload;
  created_at: string;
}
