/**
 * Zod schemas for recommendation response validation (Story 6.5).
 *
 * Reuses productMatchSchema from search since both Edge Functions return
 * the same enriched product shape (pgvector match + Violet data).
 *
 * ⚠️ SYNC: Must be mirrored in supabase/functions/_shared/schemas.ts
 */

import { z } from "zod";
import { productMatchSchema } from "./search.schema.js";

/** Schema for a single recommendation item — same shape as a search result. */
export const recommendationItemSchema = productMatchSchema;

/** Schema for the get-recommendations Edge Function response. */
export const recommendationResponseSchema = z.object({
  products: z.array(recommendationItemSchema),
  personalized: z.boolean(),
});

export type RecommendationItemOutput = z.infer<typeof recommendationItemSchema>;
export type RecommendationResponseOutput = z.infer<typeof recommendationResponseSchema>;
