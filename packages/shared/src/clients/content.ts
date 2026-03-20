import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ContentPage,
  ContentListItem,
  ContentType,
  ContentListParams,
  ContentListResult,
} from "../types/index.js";

/* ─── Row → ContentPage mapper (snake_case → camelCase) ─── */

interface ContentPageRow {
  id: string;
  slug: string;
  title: string;
  type: ContentType;
  body_markdown: string;
  author: string;
  published_at: string | null;
  seo_title: string | null;
  seo_description: string | null;
  featured_image_url: string | null;
  status: string;
  tags: string[] | null;
  related_slugs: string[] | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: ContentPageRow): ContentPage {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    type: row.type,
    bodyMarkdown: row.body_markdown,
    author: row.author,
    publishedAt: row.published_at,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    featuredImageUrl: row.featured_image_url,
    status: row.status as ContentPage["status"],
    tags: row.tags ?? [],
    relatedSlugs: row.related_slugs ?? [],
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* ─── Lightweight row type for listing queries ─── */

/**
 * Database row shape for content listing queries.
 * Excludes body_markdown, seo_title, related_slugs — fields that are only
 * needed on the detail page, not in listing cards.
 */
interface ContentListRow {
  id: string;
  slug: string;
  title: string;
  type: ContentType;
  author: string;
  published_at: string | null;
  seo_description: string | null;
  featured_image_url: string | null;
  status: string;
  tags: string[] | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

/** Maps a lightweight listing row to a ContentListItem (camelCase). */
function mapListRow(row: ContentListRow): ContentListItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    type: row.type,
    author: row.author,
    publishedAt: row.published_at,
    seoDescription: row.seo_description,
    featuredImageUrl: row.featured_image_url,
    status: row.status as ContentListItem["status"],
    tags: row.tags ?? [],
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* ─── Data functions ─── */

/**
 * Fetch a single published content page by slug.
 * RLS already filters unpublished content, but we add explicit filters for defense in depth.
 */
export async function getContentPageBySlug(
  client: SupabaseClient,
  slug: string,
): Promise<ContentPage | null> {
  const { data, error } = await client
    .from("content_pages")
    .select(
      "id, slug, title, type, body_markdown, author, published_at, seo_title, seo_description, featured_image_url, status, tags, related_slugs, sort_order, created_at, updated_at",
    )
    .eq("slug", slug)
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .single();

  if (error || !data) return null;
  return mapRow(data as ContentPageRow);
}

/**
 * Fetch a paginated list of published content pages.
 * Ordered by sort_order descending (featured first), then published_at descending (newest first).
 *
 * **Performance note:** This query intentionally excludes `body_markdown`,
 * `seo_title`, and `related_slugs` from the SELECT. Listing cards only need
 * `seoDescription` for the excerpt — fetching the full Markdown body (~5-50KB
 * per article) would waste up to 600KB per page of 12 items. Detail pages use
 * `getContentPageBySlug()` which fetches all columns.
 */
export async function getContentPages(
  client: SupabaseClient,
  params: ContentListParams = {},
): Promise<ContentListResult> {
  const { type, page = 1, limit = 12 } = params;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = client
    .from("content_pages")
    .select(
      "id, slug, title, type, author, published_at, seo_description, featured_image_url, status, tags, sort_order, created_at, updated_at",
      { count: "exact" },
    )
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .order("sort_order", { ascending: false })
    .order("published_at", { ascending: false })
    .range(from, to);

  if (type) {
    query = query.eq("type", type);
  }

  const { data, error, count } = await query;

  if (error || !data) {
    return { items: [], total: 0, page, hasNext: false };
  }

  const total = count ?? 0;
  return {
    items: (data as ContentListRow[]).map(mapListRow),
    total,
    page,
    hasNext: from + data.length < total,
  };
}

/**
 * Minimal content page shape for related content cards.
 * Only includes fields needed to render a linked card — no body or full metadata.
 */
export interface RelatedContentItem {
  slug: string;
  title: string;
  type: ContentType;
  featuredImageUrl: string | null;
  seoDescription: string | null;
}

/**
 * Fetch related content pages by slugs.
 * Returns only published content visible to visitors.
 *
 * Results are sorted to match the input `slugs` array order, preserving the
 * admin's intentional curation order from the `related_slugs` column.
 * PostgreSQL's IN() clause does not guarantee result ordering, so we re-sort
 * client-side using the input array as the reference order.
 */
export async function getRelatedContent(
  client: SupabaseClient,
  slugs: string[],
): Promise<RelatedContentItem[]> {
  if (slugs.length === 0) return [];

  const { data, error } = await client
    .from("content_pages")
    .select("slug, title, type, featured_image_url, seo_description, status, published_at")
    .in("slug", slugs)
    .eq("status", "published")
    .lte("published_at", new Date().toISOString());

  if (error || !data) return [];

  const mapped = data.map(
    (row: {
      slug: string;
      title: string;
      type: ContentType;
      featured_image_url: string | null;
      seo_description: string | null;
    }) => ({
      slug: row.slug,
      title: row.title,
      type: row.type,
      featuredImageUrl: row.featured_image_url,
      seoDescription: row.seo_description,
    }),
  );

  // Re-sort to match the admin's intended order from related_slugs
  const slugOrder = new Map(slugs.map((s, i) => [s, i]));
  return mapped.sort(
    (a, b) => (slugOrder.get(a.slug) ?? Infinity) - (slugOrder.get(b.slug) ?? Infinity),
  );
}
