/**
 * OpenAI embeddings helper for Supabase Edge Functions.
 *
 * Uses raw fetch() instead of the OpenAI SDK to stay within the 10MB bundle limit.
 * Model: text-embedding-3-small (1536 dimensions, $0.02/million tokens).
 */

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const EMBEDDING_MODEL = "text-embedding-3-small";

interface EmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

/**
 * Generates a vector embedding for the given text using OpenAI text-embedding-3-small.
 *
 * @param text - Text content to embed (product descriptions, search queries, etc.)
 * @returns 1536-dimensional embedding vector
 * @throws Error if OPENAI_API_KEY is missing or API call fails
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY environment variable");
  }

  const response = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
  }

  const result: EmbeddingResponse = await response.json();
  return result.data[0].embedding;
}
