import { z } from "zod";

/** Validates a wishlist item row. */
export const wishlistItemSchema = z.object({
  id: z.string().uuid(),
  product_id: z.string().min(1),
  added_at: z.string(),
});

/** Validates a wishlist with its items. */
export const wishlistSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  items: z.array(wishlistItemSchema),
  created_at: z.string(),
  updated_at: z.string(),
});

/** Validates add-to-wishlist input. */
export const addToWishlistInputSchema = z.object({
  userId: z.string().uuid(),
  productId: z.string().min(1),
});
