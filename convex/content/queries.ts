// convex/content/queries.ts
//
// Convex queries for content pages and FAQ.
// Replaces packages/shared/src/clients/content.ts + faq.ts (Supabase).
//
// Key difference: No snake_case → camelCase mapping needed.
// Convex stores data in camelCase directly.
//
// Doc: https://docs.convex.dev/database/reading-data
// Doc: https://docs.convex.dev/database/pagination

import { query } from "../_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

// ─── Content Pages ────────────────────────────────────────────────

/**
 * Fetch a single published content page by slug.
 * Returns null if not found or not published.
 */
export const getContentPageBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const page = await ctx.db
      .query("contentPages")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();

    if (!page || page.status !== "published") return null;

    // Only show published pages with a valid publish date
    if (page.publishedAt && page.publishedAt > Date.now()) return null;

    return page;
  },
});

/**
 * Fetch paginated published content pages.
 * Ordered by sortOrder descending (featured first), then _creationTime descending (newest).
 * Excludes 'legal' type from unfiltered editorial listings.
 */
export const getContentPages = query({
  args: {
    type: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { type, paginationOpts }) => {
    const results = await ctx.db
      .query("contentPages")
      .withIndex("by_status_published", (q) => q.eq("status", "published"))
      .order("desc")
      .paginate(paginationOpts);

    // Filter: exclude 'legal' type from unfiltered listings, or filter by type
    const filtered = results.page.filter((page) => {
      if (page.publishedAt && page.publishedAt > Date.now()) return false;
      if (type) return page.type === type;
      return page.type !== "legal";
    });

    return {
      ...results,
      page: filtered,
    };
  },
});

/**
 * Fetch related content pages by slugs.
 * Returns only published pages, sorted to match the input order (admin curation).
 */
export const getRelatedContent = query({
  args: { slugs: v.array(v.string()) },
  handler: async (ctx, { slugs }) => {
    if (slugs.length === 0) return [];

    // Fetch all published pages matching the slugs
    const pages = await ctx.db
      .query("contentPages")
      .withIndex("by_status_published", (q) => q.eq("status", "published"))
      .order("desc")
      .collect();

    const slugSet = new Set(slugs);
    const matching = pages.filter(
      (p) => slugSet.has(p.slug) && (!p.publishedAt || p.publishedAt <= Date.now()),
    );

    // Re-sort to match the admin's intended order from relatedSlugs
    const slugOrder = new Map(slugs.map((s, i) => [s, i]));
    return matching.sort(
      (a, b) => (slugOrder.get(a.slug) ?? Infinity) - (slugOrder.get(b.slug) ?? Infinity),
    );
  },
});

// ─── FAQ ───────────────────────────────────────────────────────────

/**
 * Fetch all published FAQ items, grouped by category.
 * Returns categories sorted alphabetically, items sorted by sortOrder within each category.
 */
export const getFaqItems = query({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db
      .query("faqItems")
      .withIndex("by_category_sort")
      .order("asc")
      .collect();

    // Group by category
    const categories = new Map<string, typeof items>();
    for (const item of items) {
      if (!item.isPublished) continue;
      const existing = categories.get(item.category) ?? [];
      existing.push(item);
      categories.set(item.category, existing);
    }

    return Array.from(categories.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, items]) => ({ category, items }));
  },
});
