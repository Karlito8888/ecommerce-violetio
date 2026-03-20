import type { SupabaseClient } from "@supabase/supabase-js";
import type { FaqItem, FaqCategory } from "../types/faq.types.js";

interface FaqItemRow {
  id: string;
  category: string;
  question: string;
  answer_markdown: string;
  sort_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

function mapRow(row: FaqItemRow): FaqItem {
  return {
    id: row.id,
    category: row.category,
    question: row.question,
    answerMarkdown: row.answer_markdown,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Canonical category display order */
const CATEGORY_ORDER = [
  "Shipping & Delivery",
  "Returns & Refunds",
  "Payment Methods",
  "Order Tracking",
  "Account & Privacy",
];

/**
 * Fetch all published FAQ items, grouped by category in canonical order.
 * Items within each category are sorted by sort_order ascending.
 */
export async function getFaqItems(client: SupabaseClient): Promise<FaqCategory[]> {
  const { data, error } = await client
    .from("faq_items")
    .select("*")
    .eq("is_published", true)
    .order("category")
    .order("sort_order", { ascending: true });

  if (error || !data) return [];

  const items = (data as FaqItemRow[]).map(mapRow);

  // Group by category
  const categoryMap = new Map<string, FaqItem[]>();
  for (const item of items) {
    const existing = categoryMap.get(item.category) ?? [];
    existing.push(item);
    categoryMap.set(item.category, existing);
  }

  // Build result in canonical order, then append any extras
  const result: FaqCategory[] = [];
  for (const name of CATEGORY_ORDER) {
    const catItems = categoryMap.get(name);
    if (catItems && catItems.length > 0) {
      result.push({ name, items: catItems });
    }
    categoryMap.delete(name);
  }
  for (const [name, catItems] of categoryMap) {
    result.push({ name, items: catItems });
  }

  return result;
}
