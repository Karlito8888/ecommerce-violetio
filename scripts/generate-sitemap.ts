/**
 * Sitemap Generator — Story 3.8 (SEO Foundation), enhanced by Story 7.4 (Sitemap & Indexing)
 *
 * Queries Supabase for available products and published content pages,
 * then generates `apps/web/public/sitemap.xml` with all static, product,
 * and content URLs. Supports sitemap index splitting if URLs exceed 50,000.
 *
 * ## Why a build script instead of a dynamic API route?
 *
 * TanStack Start v1 does not support `createServerFileRoute` for custom
 * HTTP handlers (XML, JSON responses). The `tanstackStart()` Vite plugin only
 * produces React-rendered HTML pages. Until TanStack Start adds API route support,
 * this script bridges the gap by generating a static sitemap from the database.
 *
 * ## When to run
 *
 * - **After product sync**: Run after `handle-webhook` processes product changes.
 *   Integrate into CI/CD or call from a cron job (e.g., every 6 hours).
 * - **After content publish**: Run when editorial content is added or updated.
 * - **Before deployment**: Add `bun run generate:sitemap` to the build pipeline.
 * - **Development**: Run manually to test sitemap output.
 *
 * ## Google Search Console
 *
 * To submit the sitemap to Google Search Console:
 * 1. Go to https://search.google.com/search-console
 * 2. Select your property (https://www.maisonemile.com)
 * 3. Navigate to "Sitemaps" in the left menu
 * 4. Enter "sitemap.xml" and click "Submit"
 * 5. Google will periodically re-fetch and re-index the sitemap
 *
 * @example
 * ```bash
 * # Generate sitemap from Supabase
 * SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxx bun run generate:sitemap
 *
 * # Or with .env file (auto-loaded by Bun)
 * bun run generate:sitemap
 * ```
 *
 * @see https://www.sitemaps.org/protocol.html
 * @see apps/web/public/sitemap.xml — output file
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  collectUrlEntries,
  generateSitemapIndex,
  generateUrlsetXml,
  MAX_URLS_PER_SITEMAP,
  STATIC_PAGES,
} from "./sitemap-utils.js";
import type { ContentRow, ProductRow } from "./sitemap-utils.js";

/* ─── Configuration ───────────────────────────────────────────────────── */

/** Canonical domain — must match robots.txt Sitemap directive and og:url values. */
const SITE_URL = process.env.SITE_URL ?? "https://www.maisonemile.com";

/** Output path for the generated sitemap. */
const OUTPUT_PATH = resolve(import.meta.dirname ?? ".", "../apps/web/public/sitemap.xml");

/* ─── Supabase query ──────────────────────────────────────────────────── */

/**
 * Create a Supabase client using service role credentials.
 * Returns null if credentials are missing.
 */
function createSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

/**
 * Fetch all available products from the `product_embeddings` table.
 *
 * Uses the service role key to bypass RLS (this is a build-time script,
 * not a client-facing request). Only selects `product_id` and `updated_at`
 * to minimize data transfer.
 *
 * The Supabase client is passed as a parameter (not created internally)
 * to avoid instantiating multiple clients when fetching products and content
 * in parallel via `Promise.all`.
 *
 * @see Code Review 2026-03-20 — Issue #3
 */
async function fetchProducts(supabase: SupabaseClient): Promise<ProductRow[]> {
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

/**
 * Fetch all published content pages from the `content_pages` table.
 *
 * Uses the service role key to bypass RLS. Adds explicit filters for
 * defense in depth (status = 'published' and published_at <= now()).
 * Only selects `slug` and `updated_at` to minimize data transfer.
 *
 * @see Code Review 2026-03-20 — Issue #3
 */
async function fetchContentPages(supabase: SupabaseClient): Promise<ContentRow[]> {
  const { data, error } = await supabase
    .from("content_pages")
    .select("slug, updated_at")
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("❌ Content pages query failed:", error.message);
    return [];
  }

  return data ?? [];
}

/* ─── Main ────────────────────────────────────────────────────────────── */

async function main() {
  console.log("🗺️  Generating sitemap...");

  const supabase = createSupabaseClient();

  let products: ProductRow[] = [];
  let contentPages: ContentRow[] = [];

  if (supabase) {
    [products, contentPages] = await Promise.all([
      fetchProducts(supabase),
      fetchContentPages(supabase),
    ]);
  } else {
    console.warn(
      "⚠️  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — generating sitemap with static pages only.",
    );
  }

  const entries = collectUrlEntries(SITE_URL, products, contentPages);
  const totalUrls = entries.length;

  if (totalUrls <= MAX_URLS_PER_SITEMAP) {
    const xml = generateUrlsetXml(entries, {
      products: products.length,
      contentPages: contentPages.length,
    });
    writeFileSync(OUTPUT_PATH, xml, "utf-8");
    console.log(`✅ Sitemap written to ${OUTPUT_PATH}`);
  } else {
    const outputDir = resolve(OUTPUT_PATH, "..");
    const sitemapFiles: string[] = [];

    for (let i = 0; i < entries.length; i += MAX_URLS_PER_SITEMAP) {
      const chunk = entries.slice(i, i + MAX_URLS_PER_SITEMAP);
      const fileNum = Math.floor(i / MAX_URLS_PER_SITEMAP) + 1;
      const fileName = `sitemap-${fileNum}.xml`;
      const filePath = resolve(outputDir, fileName);

      const xml = generateUrlsetXml(chunk, {
        products: products.length,
        contentPages: contentPages.length,
      });
      writeFileSync(filePath, xml, "utf-8");
      sitemapFiles.push(fileName);
      console.log(`✅ Sub-sitemap written: ${filePath} (${chunk.length} URLs)`);
    }

    const indexXml = generateSitemapIndex(SITE_URL, sitemapFiles);
    writeFileSync(OUTPUT_PATH, indexXml, "utf-8");
    console.log(`✅ Sitemap index written to ${OUTPUT_PATH}`);
    console.log(`   Sub-sitemaps: ${sitemapFiles.length}`);
  }

  console.log(`   Static pages: ${STATIC_PAGES.length}`);
  console.log(`   Product pages: ${products.length}`);
  console.log(`   Content pages: ${contentPages.length}`);
  console.log(`   Total URLs: ${totalUrls}`);
}

main().catch((err) => {
  console.error("❌ Sitemap generation failed:", err);
  process.exit(1);
});
