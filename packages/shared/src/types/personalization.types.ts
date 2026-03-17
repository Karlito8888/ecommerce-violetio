/** Personalization types for search result boosting (Story 6.3). */

/** A category the user frequently browses, with view count. */
export interface CategoryAffinity {
  category: string;
  view_count: number;
}

/**
 * Aggregated user search profile from get_user_search_profile() SQL function.
 * Built from user_events (browsing) + orders/order_items (purchase history).
 */
export interface UserSearchProfile {
  top_categories: CategoryAffinity[];
  /** Average order item price in cents, 0 if no orders. */
  avg_order_price: number;
  /** Distinct product IDs viewed in last 30 days (max 20). */
  recent_product_ids: string[];
  /** Total user_events count — indicates profile strength. */
  total_events: number;
}

/** Computed personalization boost scores for a single search result. */
export interface PersonalizationBoost {
  /** Category affinity boost (0–1): 1.0 for #1 category, 0.7 #2, 0.5 #3, 0.3 #4-5. */
  category_boost: number;
  /** Price proximity boost (0–1): 1.0 at user avg price, 0 at 2× distance. */
  price_proximity: number;
  /** Weighted final score: 0.7 × semantic + 0.2 × category + 0.1 × price. */
  final_score: number;
}
