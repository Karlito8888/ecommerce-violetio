import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CONTENT_TYPE_LABELS } from "@ecommerce/shared";
import type { RelatedContentItem } from "@ecommerce/shared";
import { getRelatedContentFn } from "../../server/getContent";

interface RelatedContentProps {
  slugs: string[];
}

/**
 * Related content section rendered at the bottom of content detail pages.
 * Fetches related articles by slugs and displays them as linked cards.
 * Renders nothing if no slugs provided or no results found.
 *
 * Uses `useQuery` (not `useSuspenseQuery`) intentionally: related content is
 * optional supplementary data that should NOT block the main article render
 * via Suspense. If the fetch fails, the section simply doesn't appear.
 *
 * ## BEM: .related-content
 */
export default function RelatedContent({ slugs }: RelatedContentProps) {
  const { data } = useQuery({
    queryKey: ["content", "related", slugs],
    queryFn: () => getRelatedContentFn({ data: slugs }),
    enabled: slugs.length > 0,
  });

  const items: RelatedContentItem[] = data?.data ?? [];

  if (items.length === 0) return null;

  return (
    <section className="related-content" aria-labelledby="related-content-title">
      <h2 id="related-content-title" className="related-content__title">
        Related Articles
      </h2>
      <div className="related-content__list">
        {items.map((item) => (
          <Link
            key={item.slug}
            to="/content/$slug"
            params={{ slug: item.slug }}
            className="related-content__item"
          >
            <div
              className={`related-content__image ${!item.featuredImageUrl ? `related-content__image--placeholder related-content__image--${item.type}` : ""}`}
            >
              {item.featuredImageUrl ? (
                <img
                  src={item.featuredImageUrl}
                  alt={item.title}
                  className="related-content__img"
                  loading="lazy"
                />
              ) : (
                <span className="related-content__placeholder-label">
                  {CONTENT_TYPE_LABELS[item.type] || item.type}
                </span>
              )}
            </div>
            <div className="related-content__info">
              <span className="related-content__badge">
                {CONTENT_TYPE_LABELS[item.type] || item.type}
              </span>
              <h3 className="related-content__name">{item.title}</h3>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
