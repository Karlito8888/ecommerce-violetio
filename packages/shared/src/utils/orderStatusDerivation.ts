/**
 * Order status derivation logic — derives a composite user-facing status from
 * individual per-merchant bag statuses.
 *
 * ## Why this exists
 * Violet's order-level status (OrderStatus) tracks the checkout lifecycle
 * (IN_PROGRESS → COMPLETED), but post-checkout, the meaningful status comes
 * from the individual bags. Each bag has its own fulfillment state machine
 * managed by its merchant, so a single order can have bags in different states.
 *
 * This module derives a single user-friendly status from the bag states,
 * introducing synthetic statuses ("PARTIALLY_SHIPPED", "PARTIALLY_COMPLETED")
 * that don't exist in Violet's API but are needed for the UI.
 *
 * ## Relationship to Edge Function
 * The Edge Function (`handle-webhook/orderProcessors.ts`) has a parallel
 * `deriveAndUpdateOrderStatus()` that persists the derived status to Supabase.
 * This client-side version is used for display when rendering before a
 * Realtime update arrives.
 *
 * ## Violet state machines referenced
 * - Order: IN_PROGRESS → PROCESSING → COMPLETED | REJECTED | CANCELED
 * - Bag: IN_PROGRESS → SUBMITTED → ACCEPTED → COMPLETED | REFUNDED | CANCELED | REJECTED
 *
 * @module orderStatusDerivation
 * @see https://docs.violet.io/prism/checkout-guides/guides/order-and-bag-states
 * @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/bags/states-of-a-bag
 */

/**
 * Maps bag fulfillment statuses to user-friendly display labels.
 *
 * Note: "SHIPPED" is included here even though it's not in the {@link BagStatus}
 * union type — it corresponds to the BAG_SHIPPED webhook event and may appear
 * as a bag status in the database after webhook processing.
 *
 * @see {@link BagStatus} — the typed union (does not include SHIPPED — see note above)
 */
export const BAG_STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: "Processing",
  SUBMITTED: "Processing",
  ACCEPTED: "Confirmed",
  SHIPPED: "Shipped",
  COMPLETED: "Delivered",
  CANCELED: "Canceled",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Partially Refunded",
  REJECTED: "Rejected",
  BACKORDERED: "Backordered",
};

/**
 * Maps derived order statuses to user-friendly display labels.
 *
 * Includes both Violet-native statuses (IN_PROGRESS, COMPLETED, etc.) and
 * synthetic statuses derived by {@link deriveOrderStatusFromBags}
 * (PARTIALLY_SHIPPED, PARTIALLY_COMPLETED).
 */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: "Processing",
  PROCESSING: "Processing",
  SUBMITTED: "Processing",
  ACCEPTED: "Confirmed",
  SHIPPED: "Shipped",
  COMPLETED: "Delivered",
  CANCELED: "Canceled",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Partially Refunded",
  REJECTED: "Rejected",
  PARTIALLY_SHIPPED: "Partially Shipped",
  PARTIALLY_COMPLETED: "Partially Delivered",
};

/** Terminal bag statuses — bags that have reached a final state and won't transition further. */
const TERMINAL_STATUSES = new Set(["CANCELED", "REFUNDED", "REJECTED"]);

/**
 * Derives a single composite order status from an array of bag statuses.
 *
 * ## Algorithm (priority order)
 * 1. Empty array → "PROCESSING" (no bags yet, order still being set up)
 * 2. All bags same status → return that status directly
 * 3. Mixed states: check for partial fulfillment progress
 *    a. Any COMPLETED + non-COMPLETED → "PARTIALLY_COMPLETED"
 *    b. Any SHIPPED + non-SHIPPED → "PARTIALLY_SHIPPED"
 * 4. Mixed terminal states (all bags terminal, but different terminal statuses):
 *    a. All terminal bags CANCELED → "CANCELED"
 *    b. All terminal bags REFUNDED → "REFUNDED"
 *    c. Mix of CANCELED and REFUNDED → "CANCELED" (most severe — cancellation
 *       implies merchant-initiated action vs. customer-initiated refund)
 *    d. Any REJECTED in the mix → "CANCELED" (REJECTED is also terminal/severe)
 * 5. Some terminal + some non-terminal → "PROCESSING" (order still in progress)
 * 6. Other mixed states → "PROCESSING" (fallback)
 *
 * ## Synthetic statuses
 * "PARTIALLY_SHIPPED" and "PARTIALLY_COMPLETED" are NOT Violet states — they
 * are derived statuses created by this function for better UX when bags from
 * different merchants are in different fulfillment stages.
 *
 * ## Edge cases
 * - Single bag order: always returns the bag's status directly (step 2)
 * - All bags REJECTED: returns "REJECTED" (step 2, all same status)
 * - 1 CANCELED + 1 REFUNDED: returns "CANCELED" (step 4c, most severe terminal)
 * - 1 CANCELED + 1 SHIPPED: returns "PROCESSING" (step 5, mixed terminal + active)
 *
 * @param bagStatuses - Array of bag fulfillment status strings from Supabase
 * @returns A single status string for display (may be a Violet status or synthetic)
 *
 * @see {@link ORDER_STATUS_LABELS} — maps the returned status to display text
 */
export function deriveOrderStatusFromBags(bagStatuses: string[]): string {
  if (bagStatuses.length === 0) return "PROCESSING";

  const unique = [...new Set(bagStatuses)];

  if (unique.length === 1) {
    return unique[0];
  }

  // Mixed states — check for partial progress (COMPLETED is more advanced than SHIPPED)
  if (bagStatuses.some((s) => s === "COMPLETED") && bagStatuses.some((s) => s !== "COMPLETED")) {
    return "PARTIALLY_COMPLETED";
  }
  if (bagStatuses.some((s) => s === "SHIPPED") && bagStatuses.some((s) => s !== "SHIPPED")) {
    return "PARTIALLY_SHIPPED";
  }

  // Mixed terminal states — all bags finished but with different terminal statuses
  const allTerminal = bagStatuses.every((s) => TERMINAL_STATUSES.has(s));
  if (allTerminal) {
    const hasCanceled = bagStatuses.some((s) => s === "CANCELED");
    const hasRejected = bagStatuses.some((s) => s === "REJECTED");
    const hasRefunded = bagStatuses.some((s) => s === "REFUNDED");

    // CANCELED/REJECTED are more severe (merchant-initiated) than REFUNDED (customer-initiated)
    if (hasCanceled || hasRejected) return "CANCELED";
    if (hasRefunded) return "REFUNDED";
  }

  // Default for other mixed states (e.g., some terminal + some non-terminal)
  return "PROCESSING";
}

/**
 * Returns a human-readable summary for mixed bag states.
 *
 * Example output: "2 of 3 packages shipped"
 *
 * Uses "packages" (not "items") because each Violet bag corresponds to one
 * merchant shipment, not individual products. A single bag may contain
 * multiple SKUs from the same merchant.
 *
 * @param bagStatuses - Array of all bag status strings in the order
 * @param targetStatus - The status to count (e.g., "SHIPPED")
 * @returns Summary string like "2 of 3 packages shipped"
 */
export function getBagStatusSummary(bagStatuses: string[], targetStatus: string): string {
  const matchCount = bagStatuses.filter((s) => s === targetStatus).length;
  const total = bagStatuses.length;
  const label = BAG_STATUS_LABELS[targetStatus]?.toLowerCase() ?? targetStatus.toLowerCase();
  return `${matchCount} of ${total} packages ${label}`;
}
