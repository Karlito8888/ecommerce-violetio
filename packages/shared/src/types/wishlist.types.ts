/** Wishlist types for the wishlists + wishlist_items Supabase tables (Story 6.4). */

/** Row shape from the wishlist_items table. */
export interface WishlistItem {
  id: string;
  product_id: string;
  added_at: string;
}

/** Wishlist with its items, as returned by getWishlist(). */
export interface Wishlist {
  id: string;
  user_id: string;
  items: WishlistItem[];
  created_at: string;
  updated_at: string;
}

/** Input for adding a product to a wishlist. */
export interface AddToWishlistInput {
  userId: string;
  productId: string;
}

/** Input for removing a product from a wishlist. */
export interface RemoveFromWishlistInput {
  userId: string;
  productId: string;
}

/** Function signature for fetching a wishlist. */
export type WishlistFetchFn = (userId: string) => Promise<Wishlist | null>;

/** Function signature for fetching wishlist product IDs. */
export type WishlistProductIdsFetchFn = (userId: string) => Promise<string[]>;

/** Function signature for adding to wishlist. */
export type AddToWishlistFn = (input: AddToWishlistInput) => Promise<void>;

/** Function signature for removing from wishlist. */
export type RemoveFromWishlistFn = (input: RemoveFromWishlistInput) => Promise<void>;
