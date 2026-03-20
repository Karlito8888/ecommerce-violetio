export const SUPPORT_SUBJECTS = [
  "Order Issue",
  "Payment Problem",
  "General Question",
  "Other",
] as const;

export type SupportSubject = (typeof SUPPORT_SUBJECTS)[number];

export interface SupportInquiryInput {
  name: string;
  email: string;
  subject: SupportSubject;
  message: string;
  orderId?: string;
}

export interface SupportInquiryResult {
  success: boolean;
  inquiryId?: string;
  error?: string;
}
