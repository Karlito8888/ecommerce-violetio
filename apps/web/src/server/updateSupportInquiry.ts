import { createServerFn } from "@tanstack/react-start";
import type { SupportInquiryStatus } from "@ecommerce/shared";

export const updateSupportStatusFn = createServerFn({ method: "POST" })
  .inputValidator((data: { inquiryId: string; status: SupportInquiryStatus }) => data)
  .handler(async ({ data }) => {
    const { updateSupportStatusHandler } = await import("./updateSupportInquiryHandler");
    return updateSupportStatusHandler(data.inquiryId, data.status);
  });

export const updateSupportNotesFn = createServerFn({ method: "POST" })
  .inputValidator((data: { inquiryId: string; notes: string }) => data)
  .handler(async ({ data }) => {
    const { updateSupportNotesHandler } = await import("./updateSupportInquiryHandler");
    return updateSupportNotesHandler(data.inquiryId, data.notes);
  });
