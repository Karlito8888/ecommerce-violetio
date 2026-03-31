/**
 * Bulk embeddings generation script.
 *
 * Fetches all products from Violet (sandbox), generates OpenAI embeddings,
 * and upserts directly into the local Supabase product_embeddings table.
 *
 * Usage (from project root):
 *   bun scripts/generate-embeddings-bulk.ts
 *
 * Prerequisites:
 *   - `supabase start` running
 *   - `.env.local` at project root with VIOLET_*, SUPABASE_*, OPENAI_API_KEY
 */

// Bun auto-loads .env and .env.local
const VIOLET_API_BASE = process.env.VIOLET_API_BASE ?? "https://sandbox-api.violet.io/v1";
const VIOLET_USERNAME = process.env.VIOLET_USERNAME!;
const VIOLET_PASSWORD = process.env.VIOLET_PASSWORD!;
const VIOLET_APP_ID = process.env.VIOLET_APP_ID!;
const VIOLET_APP_SECRET = process.env.VIOLET_APP_SECRET!;
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

// ─── Violet Auth ─────────────────────────────────────────────────────────────

// Violet's API has a server-side bug with special chars — unicode-escape everything
// that isn't alphanumeric. \uXXXX is valid JSON and Violet's parser handles it.
function escapePassword(pw: string): string {
  return pw
    .split("")
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (
        (code >= 0x30 && code <= 0x39) ||
        (code >= 0x41 && code <= 0x5a) ||
        (code >= 0x61 && code <= 0x7a)
      )
        return ch;
      return `\\u${code.toString(16).padStart(4, "0")}`;
    })
    .join("");
}

async function violetLogin(): Promise<string> {
  const res = await fetch(`${VIOLET_API_BASE}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Violet-App-Id": VIOLET_APP_ID,
      "X-Violet-App-Secret": VIOLET_APP_SECRET,
    },
    body: `{"username":"${VIOLET_USERNAME}","password":"${escapePassword(VIOLET_PASSWORD)}"}`,
  });
  if (!res.ok) throw new Error(`Violet login failed (${res.status}): ${await res.text()}`);
  const body = await res.json();
  console.log("✓ Violet auth OK");
  return body.token as string;
}

// ─── Products ────────────────────────────────────────────────────────────────

interface VioletOffer {
  id: number;
  name: string;
  description?: string;
  vendor?: string;
  tags?: string[];
  product_type?: string;
}

async function getMerchantIds(token: string): Promise<number[]> {
  const res = await fetch(`${VIOLET_API_BASE}/merchants?page=1&size=50`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`Failed to fetch merchants: ${res.status}`);
  const body = await res.json();
  const ids: number[] = body.content.map((m: { id: number }) => m.id);
  console.log(`✓ Found ${ids.length} merchant(s)`);
  return ids;
}

async function getProductsForMerchant(merchantId: number, token: string): Promise<VioletOffer[]> {
  const res = await fetch(
    `${VIOLET_API_BASE}/catalog/offers/merchants/${merchantId}?page=1&size=100`,
    { headers: authHeaders(token) },
  );
  if (!res.ok) {
    console.warn(`  ⚠ Merchant ${merchantId}: ${res.status}, skipping`);
    return [];
  }
  const body = await res.json();
  return (body.content ?? []) as VioletOffer[];
}

function authHeaders(token: string): Record<string, string> {
  return {
    "X-Violet-App-Id": VIOLET_APP_ID,
    "X-Violet-App-Secret": VIOLET_APP_SECRET,
    "X-Violet-Token": token,
  };
}

// ─── OpenAI Embeddings ────────────────────────────────────────────────────────

async function generateEmbedding(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  if (!res.ok) throw new Error(`OpenAI error (${res.status}): ${await res.text()}`);
  const body = await res.json();
  return body.data[0].embedding as number[];
}

// ─── Supabase upsert ─────────────────────────────────────────────────────────

async function upsertEmbedding(
  productId: string,
  productName: string,
  textContent: string,
  embedding: number[],
): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/product_embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      product_id: productId,
      product_name: productName,
      text_content: textContent,
      embedding: JSON.stringify(embedding),
    }),
  });
  if (!res.ok) throw new Error(`Supabase upsert error (${res.status}): ${await res.text()}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const token = await violetLogin();
const merchantIds = await getMerchantIds(token);

let total = 0;
let success = 0;
let failed = 0;

for (const merchantId of merchantIds) {
  const products = await getProductsForMerchant(merchantId, token);
  console.log(`\nMerchant ${merchantId}: ${products.length} products`);

  for (const product of products) {
    total++;
    const textContent = [
      product.name,
      product.description ?? "",
      product.vendor ? `Brand: ${product.vendor}` : "",
      product.product_type ? `Category: ${product.product_type}` : "",
      (product.tags ?? []).length > 0 ? `Tags: ${product.tags!.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(". ");

    try {
      const embedding = await generateEmbedding(textContent);
      await upsertEmbedding(String(product.id), product.name, textContent, embedding);
      console.log(`  ✓ [${product.id}] ${product.name}`);
      success++;
    } catch (err) {
      console.error(`  ✗ [${product.id}] ${product.name}: ${err}`);
      failed++;
    }

    // Avoid OpenAI rate limits (3 RPM on free tier, 60 RPM on paid)
    await new Promise((r) => setTimeout(r, 250));
  }
}

console.log(`\n${"─".repeat(50)}`);
console.log(`✅ Done: ${success} generated, ${failed} failed, ${total} total`);
