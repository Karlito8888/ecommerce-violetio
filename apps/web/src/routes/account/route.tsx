/**
 * Account Layout Route — auth guard for all /account/* pages.
 *
 * ## Auth Guard
 * Uses TanStack Router's `beforeLoad` hook to check authentication before
 * rendering any account page. Unauthenticated visitors (including anonymous
 * Supabase sessions) are redirected to /auth/login with a `redirect` param
 * so they return to the correct page after signing in.
 *
 * ## Pattern
 * This is the FIRST account route in the project. The `beforeLoad` auth guard
 * here will protect all child routes (orders, profile, wishlist, etc.) without
 * requiring per-route auth checks.
 *
 * @see apps/web/src/routes/account/orders/index.tsx — orders list (child)
 * @see apps/web/src/routes/account/orders/$orderId.tsx — order detail (child)
 */

import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getSupabaseSessionClient } from "#/server/supabaseServer";
import { createServerFn } from "@tanstack/react-start";

/**
 * Server function that returns the current authenticated (non-anonymous) user.
 * Returns `null` if there is no session or the session is anonymous.
 *
 * Called from `beforeLoad` to gate access to all account routes.
 */
const getAuthUserFn = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = getSupabaseSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) return null;
  return { id: user.id, email: user.email ?? null };
});

export const Route = createFileRoute("/account")({
  beforeLoad: async ({ location }) => {
    const user = await getAuthUserFn();
    if (!user) {
      throw redirect({
        to: "/auth/login",
        search: { redirect: location.pathname },
      });
    }
    return { user };
  },
  component: AccountLayout,
});

function AccountLayout() {
  return <Outlet />;
}
