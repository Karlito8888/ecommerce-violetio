import { createServerFn } from "@tanstack/react-start";
import type { SupportInquiryInput, SupportInquiryResult } from "@ecommerce/shared";

export const submitSupportFn = createServerFn({ method: "POST" })
  .inputValidator((data: { inquiry: SupportInquiryInput; honeypot?: string }) => {
    if (
      !data?.inquiry ||
      typeof data.inquiry.email !== "string" ||
      typeof data.inquiry.name !== "string"
    ) {
      throw new Error("Invalid support inquiry input");
    }
    return data;
  })
  .handler(async ({ data }): Promise<SupportInquiryResult> => {
    const { submitSupportHandler } = await import("./submitSupportHandler");
    return submitSupportHandler(data.inquiry, data.honeypot);
  });
