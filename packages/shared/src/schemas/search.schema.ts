import { z } from "zod";

/** Zod schema for search request validation. */
export const searchQuerySchema = z.object({
  query: z
    .string()
    .min(2, "Search query must be at least 2 characters")
    .max(500, "Search query must be at most 500 characters"),
  filters: z
    .object({
      category: z.string().optional(),
      minPrice: z.number().int().nonnegative().optional(),
      maxPrice: z.number().int().nonnegative().optional(),
      inStock: z.boolean().optional(),
      merchantId: z.string().optional(),
    })
    .optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

/**
 * Zod schema for a single enriched product in search results.
 *
 * ## L2 code review fix — validates ALL fields returned by the Edge Function
 *
 * Previously this schema only validated {id, name, description, minPrice, maxPrice,
 * currency, available, vendor, similarity}. The Edge Function also returns
 * source, externalUrl, and thumbnailUrl — without validating these, Zod's
 * safeParse would pass but the fields would be untyped in the parsed output.
 *
 * This schema intentionally does NOT match the full Product type — see the
 * H2 fix comment in search.types.ts for why ProductMatch is standalone.
 */
export const productMatchSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  minPrice: z.number(),
  maxPrice: z.number(),
  currency: z.string(),
  available: z.boolean(),
  vendor: z.string(),
  source: z.string(),
  externalUrl: z.string(),
  thumbnailUrl: z.string().nullable(),
  similarity: z.number().min(0).max(1),
});

/** Zod schema for search response validation. */
export const searchResponseSchema = z.object({
  query: z.string(),
  products: z.array(productMatchSchema),
  total: z.number().int().nonnegative(),
  explanations: z.record(z.string(), z.string()),
});

export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
export type SearchResponseOutput = z.infer<typeof searchResponseSchema>;
