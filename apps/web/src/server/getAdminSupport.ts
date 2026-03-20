import { createServerFn } from "@tanstack/react-start";
import type {
  AdminSupportDetailData,
  AdminSupportListData,
  SupportInquiryFilters,
} from "@ecommerce/shared";

export const getAdminSupportListFn = createServerFn({ method: "GET" })
  .inputValidator((data: { filters?: SupportInquiryFilters }) => data)
  .handler(async ({ data }): Promise<AdminSupportListData> => {
    const { getAdminSupportListHandler } = await import("./getAdminSupportHandler");
    return getAdminSupportListHandler(data.filters);
  });

export const getAdminSupportDetailFn = createServerFn({ method: "GET" })
  .inputValidator((data: { inquiryId: string }) => data)
  .handler(async ({ data }): Promise<AdminSupportDetailData> => {
    const { getAdminSupportDetailHandler } = await import("./getAdminSupportHandler");
    return getAdminSupportDetailHandler(data.inquiryId);
  });
