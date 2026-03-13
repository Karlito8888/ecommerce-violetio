/**
 * Sitemap Generator — Story 3.8 (SEO Foundation)
 *
 * Queries the Supabase `product_embeddings` table for available products
 * and generates `apps/web/public/sitemap.xml` with all static + product URLs.
 *
 * ## Why a build script instead of a dynamic API route?
 *
 * TanStack Start v1.166.2 does not support `createServerFileRoute` for custom
 * HTTP handlers (XML, JSON responses). The `tanstackStart()` Vite plugin only
 * produces React-rendered HTML pages. Until TanStack Start adds API route support,
 * this script bridges the gap by generating a static sitemap from the database.
 *
 * ## When to run
 *
 * - **After product sync**: Run after `handle-webhook` processes product changes.
 *   Integrate into CI/CD or call from a cron job (e.g., every 6 hours).
 * - **Before deployment**: Add `bun run generate:sitemap` to the build pipeline.
 * - **Development**: Run manually to test sitemap output.
 *
 * ## Future (Story 7.4)
 *
 * Story 7.4 (Sitemap & Indexing) will replace this with a dynamic server-side
 * endpoint once the framework supports it.
 *
 * @example
 * ```bash
 * # Generate sitemap from Supabase product_embeddings
 * SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxx bun run generate:sitemap
 *
 * # Or with .env file (auto-loaded by Bun)
 * bun run generate:sitemap
 * ```
 *
 * @see https://www.sitemaps.org/protocol.html
 * @see apps/web/public/sitemap.xml — output file
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

/* ─── Configuration ───────────────────────────────────────────────────── */

/** Canonical domain — must match robots.txt Sitemap directive and og:url values. */
const SITE_URL = process.env.SITE_URL ?? "https://www.maisonemile.com";

/** Output path for the generated sitemap. */
const OUTPUT_PATH = resolve(import.meta.dirname ?? ".", "../apps/web/public/sitemap.xml");

/* ─── Static pages ────────────────────────────────────────────────────── */

/**
 * Static pages with their SEO configuration.
 *
 * These pages always exist regardless of product catalog state.
 * Search, auth, checkout, and cart pages are excluded (noindex or transactional).
 */
const STATIC_PAGES: Array<{ path: string; changefreq: string; priority: string }> = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/products", changefreq: "daily", priority: "0.9" },
  { path: "/about", changefreq: "monthly", priority: "0.5" },
];

/* ─── Supabase query ──────────────────────────────────────────────────── */

interface ProductRow {
  product_id: string;
  updated_at: string | null;
}

/**
 * Fetch all available products from the `product_embeddings` table.
 *
 * Uses the service role key to bypass RLS (this is a build-time script,
 * not a client-facing request). Only selects `product_id` and `updated_at`
 * to minimize data transfer.
 */
async function fetchProducts(): Promise<ProductRow[]> {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn(
      "⚠️  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — generating sitemap with static pages only.",
    );
    return [];
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("product_embeddings")
    .select("product_id, updated_at")
    .eq("available", true)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("❌ Supabase query failed:", error.message);
    return [];
  }

  return data ?? [];
}

/* ─── XML generation ──────────────────────────────────────────────────── */

/** Escape XML special characters in URLs. */
function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Format a date string to YYYY-MM-DD for sitemap <lastmod>. */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return new Date().toISOString().split("T")[0];
  return new Date(dateStr).toISOString().split("T")[0];
}

/**
 * Generate the sitemap XML string.
 *
 * Combines static pages (always present) with dynamic product URLs
 * (fetched from Supabase). Products get priority 0.8 and daily changefreq.
 */
function generateXml(products: ProductRow[]): string {
  const staticEntries = STATIC_PAGES.map(
    (page) => `  <url>
    <loc>${escapeXml(`${SITE_URL}${page.path}`)}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`,
  ).join("\n");

  const productEntries = products
    .map(
      (p) => `  <url>
    <loc>${escapeXml(`${SITE_URL}/products/${p.product_id}`)}</loc>
    <lastmod>${formatDate(p.updated_at)}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  Auto-generated by scripts/generate-sitemap.ts (Story 3.8)
  Generated: ${new Date().toISOString()}
  Products: ${products.length}
-->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticEntries}
${productEntries}
</urlset>
`;
}

/* ─── Main ────────────────────────────────────────────────────────────── */

async function main() {
  console.log("🗺️  Generating sitemap...");

  const products = await fetchProducts();
  const xml = generateXml(products);

  writeFileSync(OUTPUT_PATH, xml, "utf-8");

  console.log(`✅ Sitemap written to ${OUTPUT_PATH}`);
  console.log(`   Static pages: ${STATIC_PAGES.length}`);
  console.log(`   Product pages: ${products.length}`);
  console.log(`   Total URLs: ${STATIC_PAGES.length + products.length}`);
}

main().catch((err) => {
  console.error("❌ Sitemap generation failed:", err);
  process.exit(1);
});
