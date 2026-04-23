/**
 * API client for the mobile app to call the web backend (TanStack Start Server Routes).
 *
 * Replaces direct calls to Supabase Edge Functions. The web backend is the single
 * source of truth for all Violet API interactions — typed, tested, and non-duplicated.
 *
 * ## Why this exists
 * Before this client, the mobile app called Supabase Edge Functions (Deno, @ts-nocheck)
 * which duplicated the logic already in `@ecommerce/shared` (Node, strict TypeScript, 437 tests).
 * Now the mobile app calls the same backend as the web, eliminating ~3 000 lines of Deno duplication.
 *
 * ## Environment
 * - `EXPO_PUBLIC_API_URL` — base URL of the web backend
 *   - Dev Android: http://10.0.2.2:3000
 *   - Dev iOS: http://localhost:3000
 *   - Prod: https://maisonemile.com
 *
 * @see /audit-dual-backend.md — full migration plan
 */

import Constants from "expo-constants";

function getApiUrl(): string {
  return (
    Constants.expoConfig?.extra?.apiUrl ?? process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:3000"
  );
}

/**
 * GET request to the web backend API.
 *
 * Returns parsed JSON response. Throws on non-2xx status.
 */
export async function apiGet<T>(path: string): Promise<T> {
  const url = `${getApiUrl()}${path}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`API GET ${path} → ${res.status}`);
  }

  return res.json() as Promise<T>;
}

/**
 * POST request to the web backend API.
 *
 * Sends JSON body. Returns parsed JSON response. Throws on non-2xx status.
 */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const url = `${getApiUrl()}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`API POST ${path} → ${res.status}`);
  }

  return res.json() as Promise<T>;
}
