import { Link } from "@tanstack/react-router";
import { CONTENT_TYPE_LABELS } from "@ecommerce/shared";
import { useQuery } from "convex/react";
import { api } from "#convex/_generated/api";
import { useMemo } from "react";

interface RelatedContentProps {
  slugs: string[];
}

/**
 * Related content section rendered at the bottom of content detail pages.
 * Fetches related articles by slugs from Convex and displays them as linked cards.
 * Renders nothing if no slugs provided or no results found.
 *
 * ## BEM: .related-content
 */
export default function RelatedContent({ slugs }: RelatedContentProps) {
  const now = useMemo(() => Date.now(), []);
  const pages = useQuery(
    api.content.queries.getRelatedContent,
    slugs.length > 0 ? { slugs, now } : "skip",
  );

  if (!pages || pages.length === 0) return null;

  return (
    <section className="related-content" aria-labelledby="related-content-title">
      <h2 id="related-content-title" className="related-content__title">
        Related Articles
      </h2>
      <div className="related-content__list">
        {pages.map((page) => (
          <Link
            key={page.slug}
            to="/content/$slug"
            params={{ slug: page.slug }}
            className="related-content__item"
          >
            <div
              className={`related-content__image ${!page.featuredImageUrl ? `related-content__image--placeholder related-content__image--${page.type}` : ""}`}
            >
              {page.featuredImageUrl ? (
                <img
                  src={page.featuredImageUrl}
                  alt={page.title}
                  className="related-content__img"
                  loading="lazy"
                />
              ) : (
                <span className="related-content__placeholder-label">
                  {CONTENT_TYPE_LABELS[page.type] || page.type}
                </span>
              )}
            </div>
            <div className="related-content__info">
              <span className="related-content__badge">
                {CONTENT_TYPE_LABELS[page.type] || page.type}
              </span>
              <h3 className="related-content__name">{page.title}</h3>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
