/**
 * Zod validation schemas for Supabase Edge Functions.
 *
 * ## Why duplicate schemas here instead of importing from packages/shared? (M1 code review fix)
 *
 * Edge Functions run in Deno and cannot import from the monorepo's `packages/shared/`
 * (Node/Bun workspace packages). These schemas mirror the ones in
 * `packages/shared/src/schemas/search.schema.ts` and MUST be kept in sync.
 *
 * The canonical source of truth is `packages/shared/` — if the schema changes there,
 * update this file too. The Zod validation in useSearch.ts (client-side) acts as a
 * safety net that catches any drift between these two copies.
 *
 * ## Why Zod validation matters in Edge Functions
 *
 * Manual `typeof` checks can't validate nested structures, ranges, or string lengths
 * as precisely. Zod gives us:
 * - Structured error messages with field paths
 * - Type inference for the validated output
 * - Consistent validation rules between Edge Functions and client-side code
 */

import { z } from "npm:zod";

/** Schema for generate-embeddings request body. */
export const generateEmbeddingsRequestSchema = z.object({
  productId: z.string().min(1, "productId is required"),
  productName: z.string().min(1, "productName is required"),
  description: z.string(),
  vendor: z.string(),
  tags: z.array(z.string()),
  category: z.string(),
});

/** Schema for search-products request body. */
export const searchQuerySchema = z.object({
  query: z
    .string()
    .min(2, "Search query must be at least 2 characters")
    .max(500, "Search query must be at most 500 characters"),
  filters: z
    .object({
      category: z.string().optional(),
      minPrice: z.number().nonnegative().optional(),
      maxPrice: z.number().nonnegative().optional(),
      inStock: z.boolean().optional(),
    })
    .optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export type GenerateEmbeddingsInput = z.infer<typeof generateEmbeddingsRequestSchema>;
export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
