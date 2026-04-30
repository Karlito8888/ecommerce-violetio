/**
 * Shared discount display helpers — DRY across web and mobile.
 *
 * Violet defines 6 discount statuses. This helper maps each status to a
 * human-readable label and a display variant, so both platforms render
 * discounts identically without duplicating the mapping logic.
 *
 * @see https://docs.violet.io/prism/checkout-guides/discounts
 */

import type { DiscountStatus } from "../types/index.js";

export type DiscountVariant = "success" | "muted" | "danger" | "hidden";

export interface DiscountDisplay {
  /** Human-readable label for the status badge */
  label: string;
  /** Display variant — drives color/styling in both web CSS and mobile StyleSheet */
  variant: DiscountVariant;
}

/**
 * Returns the display label and variant for a discount status.
 *
 * | Status         | Label           | Variant  | Rationale                                    |
 * |----------------|-----------------|----------|----------------------------------------------|
 * | APPLIED        | (none — show amount) | success | Active discount, amount visible          |
 * | PENDING        | (pending)       | muted    | WooCommerce/ECWID — awaiting pricing          |
 * | INVALID        | (invalid)       | danger   | Code not recognized by platform               |
 * | NOT_SUPPORTED  | (not supported) | danger   | Platform doesn't support discount codes       |
 * | ERROR          | (error)         | danger   | Unexpected error — will be removed at submit  |
 * | EXPIRED        | (expired)       | danger   | Was valid, no longer applies                  |
 *
 * Per Violet docs, only APPLIED discounts are used at order submission.
 * All other statuses are non-blocking and auto-removed.
 */
export function getDiscountDisplay(status: DiscountStatus): DiscountDisplay {
  switch (status) {
    case "APPLIED":
      return { label: "", variant: "success" };
    case "PENDING":
      return { label: "(pending)", variant: "muted" };
    case "NOT_SUPPORTED":
      return { label: "(not supported)", variant: "danger" };
    case "INVALID":
      return { label: "(invalid)", variant: "danger" };
    case "ERROR":
      return { label: "(error)", variant: "danger" };
    case "EXPIRED":
      return { label: "(expired)", variant: "danger" };
    default:
      return { label: "", variant: "hidden" };
  }
}
