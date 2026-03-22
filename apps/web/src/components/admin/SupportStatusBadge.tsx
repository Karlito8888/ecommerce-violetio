/**
 * @module SupportStatusBadge
 *
 * Visual badge indicating a support inquiry's current status.
 *
 * Renders a `<span>` with a BEM modifier class (`status-badge--{status}`)
 * that maps to color-coded CSS. The text content itself conveys the status,
 * ensuring the information is accessible without relying solely on color.
 */

import type { SupportInquiryStatus } from "@ecommerce/shared";

/** Renders a colored status badge for a support inquiry status value. */
export function SupportStatusBadge({ status }: { status: SupportInquiryStatus }) {
  return <span className={`status-badge status-badge--${status}`}>{status}</span>;
}
