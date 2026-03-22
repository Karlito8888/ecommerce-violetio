export type ContentType = "guide" | "comparison" | "review" | "legal";
export type ContentStatus = "draft" | "published" | "archived";

/**
 * Full content page — used on detail pages where the complete body is needed.
 * Includes all columns from the `content_pages` table.
 */
export interface ContentPage {
  id: string;
  slug: string;
  title: string;
  type: ContentType;
  bodyMarkdown: string;
  author: string;
  publishedAt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  featuredImageUrl: string | null;
  status: ContentStatus;
  tags: string[];
  relatedSlugs: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Lightweight content item for listing pages — excludes `bodyMarkdown`,
 * `seoTitle`, and `relatedSlugs` to reduce payload size.
 *
 * **Why this type exists:** The original listing query transferred the full
 * Markdown body (~5-50KB per article) just to extract 160 characters for the
 * card excerpt. With 12 items per page, this wasted up to 600KB per request.
 * Listing cards use `seoDescription` for the excerpt instead.
 *
 * Fields excluded vs ContentPage:
 * - `bodyMarkdown` — only needed for rendering the full article
 * - `seoTitle` — only needed for the detail page's <title> tag
 * - `relatedSlugs` — only rendered at the bottom of detail pages
 */
export interface ContentListItem {
  id: string;
  slug: string;
  title: string;
  type: ContentType;
  author: string;
  publishedAt: string | null;
  seoDescription: string | null;
  featuredImageUrl: string | null;
  status: ContentStatus;
  tags: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContentListParams {
  type?: ContentType;
  page?: number;
  limit?: number;
}

/**
 * Paginated result for content listings. Uses ContentListItem (not ContentPage)
 * to avoid transferring the full body_markdown column unnecessarily.
 */
export interface ContentListResult {
  items: ContentListItem[];
  total: number;
  page: number;
  hasNext: boolean;
}
