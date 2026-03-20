import { createServerFn } from "@tanstack/react-start";
import type { SupportReplyInput } from "@ecommerce/shared";

export const replySupportFn = createServerFn({ method: "POST" })
  .inputValidator((data: SupportReplyInput) => data)
  .handler(async ({ data }) => {
    const { replySupportHandler } = await import("./replySupportInquiryHandler");
    return replySupportHandler(data);
  });
