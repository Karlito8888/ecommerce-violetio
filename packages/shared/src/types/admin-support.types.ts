/**
 * Admin support types — shapes for the back-office support inquiry management UI.
 * Maps to the `support_inquiries` Supabase table and related order lookup.
 */
import type { SupportSubject } from "./support.types.js";

/** A support inquiry row as returned from the database (camelCase mapped). */
export interface SupportInquiry {
  id: string;
  name: string;
  email: string;
  subject: SupportSubject;
  message: string;
  orderId: string | null;
  status: SupportInquiryStatus;
  internalNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Immutable tuple of valid support inquiry statuses.
 * Uses `as const` for type narrowing — the same pattern as SUPPORT_SUBJECTS
 * in support.types.ts. Derived union type ensures the constant and the type
 * stay in sync automatically.
 */
export const SUPPORT_STATUSES = ["new", "in-progress", "resolved"] as const;
export type SupportInquiryStatus = (typeof SUPPORT_STATUSES)[number];

/** Filter parameters for the inquiry list. */
export interface SupportInquiryFilters {
  status?: SupportInquiryStatus;
  subject?: SupportSubject;
}

/** Input for admin reply email. */
export interface SupportReplyInput {
  inquiryId: string;
  replyMessage: string;
}

/** Data returned for the support list page. */
export interface AdminSupportListData {
  inquiries: SupportInquiry[];
}

/** Data returned for a single inquiry detail. */
export interface AdminSupportDetailData {
  inquiry: SupportInquiry;
  linkedOrder: LinkedOrderInfo | null;
}

/** Linked order summary (from orders table via violet_order_id). */
export interface LinkedOrderInfo {
  id: string;
  violetOrderId: string;
  status: string;
  total: number;
  createdAt: string;
}
