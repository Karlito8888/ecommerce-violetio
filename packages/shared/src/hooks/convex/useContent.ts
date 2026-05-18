// packages/shared/src/hooks/convex/useContent.ts
//
// Convex-based content hooks.
// Replaces the adapter-based useContent.ts during migration.

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";

/** Reactive content page by slug. */
export function useContentPageBySlug(slug: string | undefined) {
  return useQuery(api.content.queries.getContentPageBySlug, slug ? { slug } : "skip");
}

/** Reactive FAQ items grouped by category. */
export function useFaqItemsConvex() {
  return useQuery(api.content.queries.getFaqItems, {});
}

/** Reactive related content by slugs. */
export function useRelatedContent(slugs: string[]) {
  return useQuery(api.content.queries.getRelatedContent, slugs.length > 0 ? { slugs } : "skip");
}
