import { Link } from "@tanstack/react-router";
import type { ContentPage } from "@ecommerce/shared";
import { formatDate } from "@ecommerce/shared";

/** Content type label mapping for display badges. */
const TYPE_LABELS: Record<string, string> = {
  guide: "Guide",
  comparison: "Comparison",
  review: "Review",
};

/**
 * Generate a plain-text excerpt from Markdown content.
 *
 * Strips Markdown syntax, product embeds (`{{product:...}}`), and truncates
 * to `maxLength` characters at a word boundary with "…" suffix.
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
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + "…";
}

interface ContentListCardProps {
  content: ContentPage;
}

/**
 * Card component for the content listing grid.
 *
 * Displays featured image (with type-based placeholder fallback), type badge,
 * title, excerpt, author, and publication date. Wraps in a Link to the
 * content detail page (`/content/$slug`).
 */
export default function ContentListCard({ content }: ContentListCardProps) {
  const excerpt = generateExcerpt(content.bodyMarkdown);

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
            {TYPE_LABELS[content.type] || content.type}
          </span>
        )}
      </div>
      <div className="content-list-card__body">
        <span className="content-list-card__badge">
          {TYPE_LABELS[content.type] || content.type}
        </span>
        <h2 className="content-list-card__title">{content.title}</h2>
        {excerpt && <p className="content-list-card__excerpt">{excerpt}</p>}
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
