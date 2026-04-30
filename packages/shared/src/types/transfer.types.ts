/**
 * Violet Transfer types — minimal set for webhook processing.
 *
 * The full Transfer CRUD adapter (search, retry, get by ID, pending) was removed
 * as dead code (no UI consumer). Transfer records are populated exclusively via
 * TRANSFER_* webhooks in the Deno Edge Function (transferProcessors.ts).
 *
 * The `order_transfers` DB table has a CHECK constraint on status matching
 * TransferStatus values — see migration 20260415000000_order_transfers.sql.
 *
 * If an admin Transfers UI is needed in the future, re-implement the adapter
 * following the same pattern as violetDistributions.ts.
 */

/** Violet Transfer status values — must match DB CHECK constraint. */
export type TransferStatus =
  | "PENDING"
  | "SENT"
  | "FAILED"
  | "PARTIALLY_SENT"
  | "REVERSED"
  | "PARTIALLY_REVERSED"
  | "BYPASSED";
