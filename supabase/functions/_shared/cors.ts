/**
 * CORS headers for Supabase Edge Functions.
 *
 * Edge Functions require manual CORS handling since Deno.serve
 * does not provide middleware-based CORS support.
 *
 * ## Production CORS (L1 code review fix)
 *
 * Uses ALLOWED_ORIGINS env var when set to restrict cross-origin access
 * to known app domains. Falls back to wildcard `*` for local development.
 *
 * Set ALLOWED_ORIGINS in Supabase Edge Function secrets for production:
 *   supabase secrets set ALLOWED_ORIGINS="https://myapp.com,https://www.myapp.com"
 */

const allowedOrigin = Deno.env.get("ALLOWED_ORIGINS") ?? "*";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  /**
   * Must match all HTTP methods used by Edge Functions. Mismatched methods
   * cause browsers to reject preflight responses for GET/PUT/DELETE requests.
   */
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};
