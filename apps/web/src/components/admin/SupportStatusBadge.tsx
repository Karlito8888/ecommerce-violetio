import type { SupportInquiryStatus } from "@ecommerce/shared";

export function SupportStatusBadge({ status }: { status: SupportInquiryStatus }) {
  return <span className={`status-badge status-badge--${status}`}>{status}</span>;
}
