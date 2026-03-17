import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ContentPage,
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
      "id, slug, title, type, body_markdown, author, published_at, seo_title, seo_description, featured_image_url, status, created_at, updated_at",
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
 * Ordered by published_at descending (newest first).
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
      "id, slug, title, type, body_markdown, author, published_at, seo_title, seo_description, featured_image_url, status, created_at, updated_at",
      { count: "exact" },
    )
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
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
    items: (data as ContentPageRow[]).map(mapRow),
    total,
    page,
    hasNext: from + data.length < total,
  };
}
