import { createServerFn } from "@tanstack/react-start";

export const getAdminHealthFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminHealthHandler } = await import("./getAdminHealthHandler");
  return getAdminHealthHandler();
});

export const triggerHealthCheckFn = createServerFn({ method: "GET" }).handler(async () => {
  const { triggerHealthCheckHandler } = await import("./getAdminHealthHandler");
  return triggerHealthCheckHandler();
});
