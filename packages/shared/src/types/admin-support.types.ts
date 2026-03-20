import type { SupportSubject } from "./support.types.js";

/** A support inquiry row as returned from the database. */
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

export type SupportInquiryStatus = "new" | "in-progress" | "resolved";

export const SUPPORT_STATUSES: SupportInquiryStatus[] = ["new", "in-progress", "resolved"];

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
