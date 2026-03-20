import type { AdminDashboardData, TimeRangeParams } from "@ecommerce/shared";
import { getDashboardMetrics, getCommissionSummary } from "@ecommerce/shared";

import { getSupabaseServer, getSupabaseSessionClient } from "#/server/supabaseServer";

/**
 * Handler for admin dashboard data.
 *
 * Two Supabase clients:
 * 1. Session client — reads user JWT from cookies to verify admin role
 * 2. Service role client — bypasses RLS for aggregate dashboard queries
 */
export async function getAdminDashboardHandler(
  params: TimeRangeParams,
): Promise<AdminDashboardData> {
  // Auth check: verify current user is admin
  const sessionClient = getSupabaseSessionClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user || user.is_anonymous || user.app_metadata?.user_role !== "admin") {
    throw new Response("Forbidden: admin access required", { status: 403 });
  }

  // Data queries: use service role to bypass RLS for aggregates
  const serviceClient = getSupabaseServer();

  const [metrics, commission] = await Promise.all([
    getDashboardMetrics(serviceClient, params),
    getCommissionSummary(serviceClient),
  ]);

  return { metrics, commission };
}
