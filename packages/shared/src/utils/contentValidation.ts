/**
 * Human-readable labels for content types.
 *
 * Centralized here because this mapping was previously duplicated across 5 files
 * (web routes, web components, mobile screens). Adding a new content type (e.g. "tutorial")
 * now only requires updating this single map.
 *
 * @see ContentType in content.types.ts for the union type
 */
export const CONTENT_TYPE_LABELS: Record<string, string> = {
  guide: "Guide",
  comparison: "Comparison",
  review: "Review",
};

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

/**
 * Validates a content page slug against the DB CHECK constraint format.
 * Must be lowercase alphanumeric with hyphens, no leading/trailing hyphens.
 */
export function isValidSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug);
}

/**
 * Field guide for Supabase Studio — describes each content_pages column.
 * Used in documentation generation and admin reference.
 */
export const CONTENT_FIELD_GUIDE: Record<string, { required: boolean; description: string }> = {
  slug: {
    required: true,
    description:
      "URL-safe identifier. Use lowercase-with-hyphens. Example: best-running-shoes-2026",
  },
  title: { required: true, description: "Display title. Must not be empty." },
  type: {
    required: true,
    description: 'Content type: "guide", "comparison", or "review". Defaults to "guide".',
  },
  body_markdown: {
    required: true,
    description:
      "Markdown content. Embed products with {{product:VIOLET_OFFER_ID}}. Internal links: [text](/products/ID) or [text](/content/slug).",
  },
  author: { required: true, description: "Author display name shown on the article page." },
  status: {
    required: true,
    description:
      'draft = not visible, published = visible (if published_at <= now), archived = hidden. Defaults to "draft".',
  },
  published_at: {
    required: false,
    description:
      "Publication date. Must be set when status = published. Set to a future date for scheduled publishing.",
  },
  seo_title: {
    required: false,
    description: "Custom page title for search engines. Falls back to title if empty.",
  },
  seo_description: {
    required: false,
    description:
      "Custom meta description for search engines. Falls back to first 160 chars of content.",
  },
  featured_image_url: {
    required: false,
    description: "Full URL to hero image. Used in article header and social previews (og:image).",
  },
  tags: {
    required: false,
    description:
      "Tags for categorization. Example: {running,shoes,guide}. Not displayed on frontend for MVP.",
  },
  related_slugs: {
    required: false,
    description:
      "Array of slugs for related content links at bottom of article. Example: {best-value-shoes,shoe-care-guide}.",
  },
  sort_order: {
    required: false,
    description:
      "0 = default chronological. Higher values appear first in listings. Use 100+ for featured content.",
  },
};
