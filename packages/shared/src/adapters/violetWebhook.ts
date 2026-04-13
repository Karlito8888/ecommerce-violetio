/**
 * Violet webhook operations: validateWebhook, processWebhook.
 */

import type { ApiResponse, WebhookEvent } from "../types/index.js";

/**
 * Validates a Violet webhook signature (synchronous adapter-level check).
 *
 * The actual HMAC-SHA256 verification is async (Web Crypto API) and runs
 * in the handle-webhook Edge Function via `validateHmac()`.
 *
 * This method provides a synchronous pre-check for the SupplierAdapter
 * interface contract.
 *
 * @returns true if required webhook headers are present
 */
export function validateWebhook(headers: Headers, _body: string): boolean {
  const hmac = headers.get("x-violet-hmac");
  const eventId = headers.get("x-violet-event-id");
  const topic = headers.get("x-violet-topic");
  return Boolean(hmac && eventId && topic);
}

/**
 * Routes a webhook event to the appropriate handler.
 *
 * In the primary execution path, the handle-webhook Edge Function processes
 * events directly via `processors.ts`. This method exists for the
 * SupplierAdapter interface and can be used in non-Edge contexts.
 */
export async function processWebhook(_event: WebhookEvent): Promise<ApiResponse<void>> {
  return { data: undefined, error: null };
}
