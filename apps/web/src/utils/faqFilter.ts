import type { FaqCategory } from "@ecommerce/shared";

export interface FilterFaqResult {
  filtered: FaqCategory[];
  matchedIds: Set<string>;
}

/**
 * Filter FAQ categories based on search query.
 * Matches against question and answer text (case-insensitive).
 * Returns filtered categories and the set of matching item IDs.
 */
export function filterFaq(categories: FaqCategory[], query: string): FilterFaqResult {
  if (!query.trim()) {
    return { filtered: categories, matchedIds: new Set() };
  }

  const lower = query.toLowerCase();
  const matchedIds = new Set<string>();
  const filtered: FaqCategory[] = [];

  for (const cat of categories) {
    const matchingItems = cat.items.filter((item) => {
      const matches =
        item.question.toLowerCase().includes(lower) ||
        item.answerMarkdown.toLowerCase().includes(lower);
      if (matches) matchedIds.add(item.id);
      return matches;
    });
    if (matchingItems.length > 0) {
      filtered.push({ name: cat.name, items: matchingItems });
    }
  }

  return { filtered, matchedIds };
}
