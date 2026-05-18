// apps/web/src/routes/account/route.tsx
//
// Account Layout Route — auth guard for all /account/* pages.
//
// Migrated from Supabase Auth to Convex Auth (Phase 5).
//
// Uses client-side Convex Auth check via useConvexAuth().
// Since Convex Auth stores tokens in localStorage (not cookies),
// the auth state is only available client-side. During SSR, isLoading is true
// and we show a loading state. After hydration, the auth state resolves and
// we either render the outlet or redirect to login.
//
// All child routes (orders, profile, wishlist) inherit this guard.

import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useConvexAuth } from "@convex-dev/auth/react";

export const Route = createFileRoute("/account")({
  component: AccountLayout,
});

function AccountLayout() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const currentPath = window.location.pathname;
      navigate({
        to: "/auth/login",
        search: { redirect: currentPath },
        replace: true,
      });
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading) {
    return (
      <section className="page-wrap" style={{ padding: "4rem 0", textAlign: "center" }}>
        <p>Loading...</p>
      </section>
    );
  }

  if (!isAuthenticated) {
    // Will redirect via useEffect above
    return (
      <section className="page-wrap" style={{ padding: "4rem 0", textAlign: "center" }}>
        <p>Redirecting to login...</p>
      </section>
    );
  }

  return <Outlet />;
}
