/**
 * Derives a user-friendly order status from individual bag statuses.
 *
 * This logic mirrors the Edge Function's deriveAndUpdateOrderStatus()
 * but is available client-side for display purposes (e.g., when rendering
 * order lists before Realtime pushes the derived status).
 *
 * Rules (FR25):
 * - All bags same status → that status
 * - Any SHIPPED + non-SHIPPED → "PARTIALLY_SHIPPED"
 * - Any COMPLETED + non-COMPLETED → "PARTIALLY_COMPLETED"
 * - CANCELED ≠ REFUNDED — tracked separately
 */

/** Map BagStatus to user-friendly display labels */
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
};

/** Map derived order status to user-friendly display labels */
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

  // Default for other mixed states
  return "PROCESSING";
}

/**
 * Returns a summary string for mixed bag states.
 * e.g., "2 of 3 packages shipped" (FR25)
 *
 * Uses "packages" (not "items") because each bag = one merchant shipment.
 */
export function getBagStatusSummary(bagStatuses: string[], targetStatus: string): string {
  const matchCount = bagStatuses.filter((s) => s === targetStatus).length;
  const total = bagStatuses.length;
  const label = BAG_STATUS_LABELS[targetStatus]?.toLowerCase() ?? targetStatus.toLowerCase();
  return `${matchCount} of ${total} packages ${label}`;
}
