import { createServerFn } from "@tanstack/react-start";
import type { TimeRangeParams } from "@ecommerce/shared";

export const getAdminDashboardFn = createServerFn({ method: "GET" })
  .inputValidator((data: { params: TimeRangeParams }) => data)
  .handler(async ({ data }) => {
    const { getAdminDashboardHandler } = await import("./getAdminDashboardHandler");
    return getAdminDashboardHandler(data.params);
  });
