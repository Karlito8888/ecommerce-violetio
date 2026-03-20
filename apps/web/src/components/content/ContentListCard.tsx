import { Link } from "@tanstack/react-router";
import type { ContentListItem } from "@ecommerce/shared";
import { formatDate, CONTENT_TYPE_LABELS } from "@ecommerce/shared";

/**
 * Generate a plain-text excerpt from Markdown content.
 *
 * Strips Markdown syntax, product embeds (`{{product:...}}`), and truncates
 * to `maxLength` characters at a word boundary with "..." suffix.
 *
 * Note: ContentListCard no longer calls this function (it reads `seoDescription`
 * directly from the listing API response), but it remains exported for use by
 * tests and other consumers.
 */
export function generateExcerpt(markdown: string, maxLength = 160): string {
  const stripped = markdown
    .replace(/\{\{product:[^}]+\}\}/g, "") // Remove product embeds
    .replace(/#{1,6}\s/g, "") // Remove headings
    .replace(/\*\*([^*]+)\*\*/g, "$1") // Bold to plain
    .replace(/\*([^*]+)\*/g, "$1") // Italic to plain
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Links to text
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "") // Remove images
    .replace(/`([^`]+)`/g, "$1") // Code to plain
    .replace(/\n+/g, " ") // Newlines to spaces
    .replace(/\s{2,}/g, " ") // Collapse multiple spaces
    .trim();

  if (stripped.length <= maxLength) return stripped;
  const truncated = stripped.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + "\u2026";
}

interface ContentListCardProps {
  /** Uses ContentListItem (not ContentPage) to match the listing API response type. */
  content: ContentListItem;
}

/**
 * Card component for the content listing grid.
 *
 * Displays featured image (with type-based placeholder fallback), type badge,
 * title, excerpt, author, and publication date. Wraps in a Link to the
 * content detail page (`/content/$slug`).
 *
 * **Excerpt strategy:** Uses `seoDescription` directly instead of generating an
 * excerpt from bodyMarkdown. This enables the listing query to exclude the heavy
 * `body_markdown` column entirely — see ContentListItem type for rationale.
 * If seoDescription is null, the excerpt is simply omitted; the card remains
 * functional with title, badge, author, and date.
 */
export default function ContentListCard({ content }: ContentListCardProps) {
  return (
    <Link to="/content/$slug" params={{ slug: content.slug }} className="content-list-card">
      <div
        className={`content-list-card__image ${!content.featuredImageUrl ? `content-list-card__image--placeholder content-list-card__image--${content.type}` : ""}`}
      >
        {content.featuredImageUrl ? (
          <img
            src={content.featuredImageUrl}
            alt={content.title}
            className="content-list-card__img"
            loading="lazy"
          />
        ) : (
          <span className="content-list-card__placeholder-label">
            {CONTENT_TYPE_LABELS[content.type] || content.type}
          </span>
        )}
      </div>
      <div className="content-list-card__body">
        <span className="content-list-card__badge">
          {CONTENT_TYPE_LABELS[content.type] || content.type}
        </span>
        <h2 className="content-list-card__title">{content.title}</h2>
        {content.seoDescription && (
          <p className="content-list-card__excerpt">{content.seoDescription}</p>
        )}
        <div className="content-list-card__meta">
          <span className="content-list-card__author">{content.author}</span>
          {content.publishedAt && (
            <>
              <span className="content-list-card__separator" aria-hidden="true">
                ·
              </span>
              <time className="content-list-card__date" dateTime={content.publishedAt}>
                {formatDate(content.publishedAt, "long")}
              </time>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
