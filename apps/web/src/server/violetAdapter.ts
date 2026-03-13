import { createSupplierAdapter } from "@ecommerce/shared";
import type { SupplierAdapter } from "@ecommerce/shared";

/**
 * Module-scoped Violet adapter singleton.
 *
 * ## Why a singleton? (Epic 3 Review — Fix I1)
 *
 * `createSupplierAdapter()` instantiates a new `VioletTokenManager` internally.
 * Each `VioletTokenManager` performs a fresh `POST /login` to the Violet API on
 * its first request, then caches the token for subsequent calls. Without a
 * singleton, every single server function invocation triggers a new login:
 *
 * - **Performance**: Adds 100–500ms latency per request (Violet login round-trip)
 * - **Rate limiting**: Violet enforces login rate limits — under load, requests
 *   would be throttled or rejected
 * - **Token waste**: Each manager obtains a unique token that's immediately discarded
 *
 * By reusing a single adapter (and its token manager), the login happens once
 * on the first request, and the cached token is reused until expiry. This mirrors
 * the pattern used in Edge Functions (`supabaseAdmin.ts` uses `_client` singleton).
 *
 * The singleton is module-scoped, meaning it lives for the lifetime of the server
 * process. In SSR (TanStack Start), modules are loaded once and persist across
 * requests — the adapter (and its auth token) are shared across all incoming
 * requests automatically.
 *
 * @see supabase/functions/_shared/supabaseAdmin.ts — Same singleton pattern
 * @see packages/shared/src/clients/violetAuth.ts — VioletTokenManager lifecycle
 */
let _adapter: SupplierAdapter | null = null;

/**
 * Returns a singleton SupplierAdapter configured from environment variables.
 *
 * Thread-safe in Node.js (single-threaded event loop). The adapter and its
 * internal VioletTokenManager handle concurrent requests safely — token
 * refresh uses a `pendingToken` promise to coalesce concurrent auth calls.
 *
 * @throws {Error} If required VIOLET_* env vars are missing
 */
export function getAdapter(): SupplierAdapter {
  if (_adapter) return _adapter;

  const appId = process.env.VIOLET_APP_ID;
  const appSecret = process.env.VIOLET_APP_SECRET;
  const username = process.env.VIOLET_USERNAME;
  const password = process.env.VIOLET_PASSWORD;
  const apiBase = process.env.VIOLET_API_BASE ?? "https://sandbox-api.violet.io/v1";

  if (!appId || !appSecret || !username || !password) {
    throw new Error(
      "Missing required Violet env vars: VIOLET_APP_ID, VIOLET_APP_SECRET, VIOLET_USERNAME, VIOLET_PASSWORD",
    );
  }

  _adapter = createSupplierAdapter({
    supplier: "violet",
    violet: { appId, appSecret, username, password, apiBase },
  });

  return _adapter;
}
