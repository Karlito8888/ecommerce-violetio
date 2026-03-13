/**
 * OpenAI embeddings helper for Supabase Edge Functions.
 *
 * Uses raw fetch() instead of the OpenAI SDK to stay within the 10MB bundle limit.
 * Model: text-embedding-3-small (1536 dimensions, $0.02/million tokens).
 *
 * ## Epic 3 Review — Fix I5 + S5
 *
 * - **I5 (timeout)**: Added `AbortSignal.timeout(10_000)` to prevent indefinite
 *   hangs when OpenAI is unresponsive. 10s chosen because:
 *   - Webhook handler total budget is ~10s (Violet's expectation)
 *   - Embedding generation is one step in the pipeline (HMAC + parse + embed + DB)
 *   - OpenAI text-embedding-3-small typically responds in 200–800ms
 *
 * - **S5 (retry)**: Added exponential backoff with jitter for transient failures:
 *   - Retries on: 429 (rate limit), 500, 502, 503, 504 (server errors)
 *   - Max 2 retries (3 attempts total), delays: ~1s, ~2s (with jitter)
 *   - Does NOT retry on: 400 (bad request), 401 (auth), 404 — these are permanent
 *   - Jitter prevents thundering herd when multiple Edge Function instances retry
 *
 * @see https://platform.openai.com/docs/api-reference/embeddings
 */

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const EMBEDDING_MODEL = "text-embedding-3-small";

/** Maximum time to wait for a single OpenAI API response. */
const REQUEST_TIMEOUT_MS = 10_000;

/** Maximum number of retry attempts for transient failures. */
const MAX_RETRIES = 2;

/** Base delay for exponential backoff (ms). Actual delay: base * 2^attempt + jitter. */
const RETRY_BASE_DELAY_MS = 1_000;

/** HTTP status codes that indicate transient failures worth retrying. */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

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
 * @throws {Error} If OPENAI_API_KEY is missing, all retry attempts fail, or a non-retryable error occurs
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY environment variable");
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
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
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");

        if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < MAX_RETRIES) {
          lastError = new Error(`OpenAI API error (${response.status}): ${errorText}`);
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 500;
          console.warn(
            `[openai] Retryable error (${response.status}), attempt ${attempt + 1}/${MAX_RETRIES + 1}, retrying in ${Math.round(delay)}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
      }

      const result: EmbeddingResponse = await response.json();
      return result.data[0].embedding;
    } catch (error) {
      /** Timeout errors (AbortError) are retryable — OpenAI may be temporarily slow. */
      if (error instanceof DOMException && error.name === "TimeoutError" && attempt < MAX_RETRIES) {
        lastError = error;
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 500;
        console.warn(
          `[openai] Request timeout, attempt ${attempt + 1}/${MAX_RETRIES + 1}, retrying in ${Math.round(delay)}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("OpenAI API: all retry attempts exhausted");
}
