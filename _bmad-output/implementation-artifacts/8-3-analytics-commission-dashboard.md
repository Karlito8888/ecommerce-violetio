# Story 8.3: Analytics & Commission Dashboard (Internal)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Quick Reference — Files to Create/Update

| Action | File | Notes |
| ------ | ---- | ----- |
| CREATE | `supabase/migrations/20260402000000_admin_roles.sql` | Admin role via custom claims + RLS policies |
| CREATE | `supabase/migrations/20260402000001_admin_views.sql` | Materialized views for dashboard metrics |
| CREATE | `packages/shared/src/types/admin.types.ts` | DashboardMetrics, CommissionSummary, AdminRole types |
| UPDATE | `packages/shared/src/types/index.ts` | Export admin types |
| CREATE | `packages/shared/src/clients/admin.ts` | getDashboardMetrics(), getCommissionData() — service role queries |
| UPDATE | `packages/shared/src/clients/index.ts` | Export admin client functions |
| CREATE | `apps/web/src/server/adminAuth.ts` | getAdminUserFn() — reusable admin auth server function |
| CREATE | `apps/web/src/server/getAdminDashboard.ts` | Server function: dashboard data fetch |
| CREATE | `apps/web/src/server/getAdminDashboardHandler.ts` | Handler: auth check + service role queries |
| CREATE | `apps/web/src/routes/admin/index.tsx` | Admin dashboard page — protected route, SSR |
| CREATE | `apps/web/src/components/admin/DashboardMetrics.tsx` | KPI cards component |
| CREATE | `apps/web/src/components/admin/CommissionTable.tsx` | Commission breakdown table |
| CREATE | `apps/web/src/components/admin/TimeRangeSelector.tsx` | Date range filter (today, 7d, 30d, custom) |
| CREATE | `apps/web/src/styles/pages/admin.css` | BEM styles for `.admin-dashboard` block |
| UPDATE | `apps/web/src/styles/index.css` | Import admin.css |
| CREATE | `apps/web/src/__tests__/admin.test.ts` | Tests for admin client, auth check, dashboard logic |

---

## Story

As an **administrator**,
I want to view key business metrics and commission tracking,
So that I can monitor platform performance and revenue.

## Acceptance Criteria

1. **Given** an authenticated admin user
   **When** they access the admin dashboard
   **Then** key metrics are displayed: total orders, revenue (gross), commission earned, active users, conversion rate (FR44)

2. **Given** an authenticated admin user
   **When** they view commission data
   **Then** commission data is derived from Violet order data: commission = % of subtotal per bag (not tax/shipping), with Stripe fees deducted from channel share

3. **Given** the dashboard data requirements
   **When** metrics are computed
   **Then** metrics are computed via Supabase SQL views on existing tables (orders, order_bags, user_events)

4. **Given** the database migration requirements
   **When** the admin views migration runs
   **Then** `supabase/migrations/20260402000001_admin_views.sql` creates materialized views for dashboard metrics

5. **Given** the dashboard filtering requirements
   **When** the admin interacts with the time-range selector
   **Then** time-range filtering is available: today, last 7 days, last 30 days, custom range

6. **Given** the web platform
   **When** the admin accesses the dashboard
   **Then** web-only: admin dashboard at `apps/web/src/routes/admin/index.tsx` (protected route, admin RLS)

7. **Given** the admin role requirements
   **When** admin access is managed
   **Then** admin role is managed via Supabase Auth custom claims (`user_role: 'admin'`)

8. **Given** the admin role migration requirements
   **When** the admin roles migration runs
   **Then** `supabase/migrations/20260402000000_admin_roles.sql` creates admin role management with RLS policies

9. **Given** the platform scope
   **When** admin access is considered
   **Then** no mobile admin interface at MVP — admin is web-only

## Tasks / Subtasks

- [x] **Task 1: Admin role migration — custom claims + RLS** (AC: #7, #8)
  - [x] 1.1: Create `supabase/migrations/20260402000000_admin_roles.sql`:
    - Create function `is_admin()` that checks `auth.jwt() -> 'app_metadata' ->> 'user_role' = 'admin'`
    - Create function `set_admin_role(target_user_id UUID)` — service_role only, sets `app_metadata.user_role = 'admin'` via `auth.admin_update_user_by_id()`
    - **No separate admin_users table** — admin role lives in Supabase Auth `app_metadata` (standard Supabase pattern)
    - Add RLS policies to all dashboard-relevant tables (orders, order_bags, user_events) allowing `SELECT` when `is_admin()` returns true
    - These policies are **additive** to existing policies (users still see their own data)
    - Add comments explaining admin claim pattern
  - [x] 1.2: Document how to set the first admin user via SQL Editor:
    ```sql
    -- Run in Supabase SQL Editor (one-time setup)
    SELECT set_admin_role('YOUR_USER_UUID_HERE');
    ```

- [x] **Task 2: Materialized views for dashboard metrics** (AC: #3, #4)
  - [x] 2.1: Create `supabase/migrations/20260402000001_admin_views.sql`:
    - **`mv_dashboard_metrics`** — materialized view:
      ```sql
      CREATE MATERIALIZED VIEW mv_dashboard_metrics AS
      SELECT
        COUNT(DISTINCT id) AS total_orders,
        SUM(total) AS gross_revenue_cents,
        COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS registered_users_ordered,
        COUNT(DISTINCT CASE WHEN created_at > now() - interval '30 days' THEN user_id END) AS active_users_30d,
        COUNT(DISTINCT CASE WHEN created_at > now() - interval '7 days' THEN user_id END) AS active_users_7d,
        COUNT(DISTINCT CASE WHEN created_at > now() - interval '1 day' THEN user_id END) AS active_users_today,
        -- Conversion = orders / unique user_events visitors (approximation)
        now() AS refreshed_at
      FROM orders
      WHERE status NOT IN ('CANCELED', 'REJECTED');
      ```
    - **`mv_commission_summary`** — materialized view:
      ```sql
      CREATE MATERIALIZED VIEW mv_commission_summary AS
      SELECT
        ob.merchant_name,
        COUNT(DISTINCT ob.id) AS bag_count,
        SUM(ob.subtotal) AS gross_subtotal_cents,
        -- Commission rate from product_embeddings (stored during catalog sync)
        -- For MVP: use a configurable default commission rate (stored as a DB setting)
        now() AS refreshed_at
      FROM order_bags ob
      JOIN orders o ON ob.order_id = o.id
      WHERE o.status NOT IN ('CANCELED', 'REJECTED')
        AND ob.financial_status IN ('PAID', 'PARTIALLY_PAID')
      GROUP BY ob.merchant_name;
      ```
    - **`fn_dashboard_metrics_by_range(start_date, end_date)`** — function for time-filtered queries (not materialized):
      ```sql
      CREATE OR REPLACE FUNCTION fn_dashboard_metrics_by_range(
        p_start TIMESTAMPTZ DEFAULT now() - interval '30 days',
        p_end TIMESTAMPTZ DEFAULT now()
      ) RETURNS TABLE (
        total_orders BIGINT,
        gross_revenue_cents BIGINT,
        commission_estimate_cents BIGINT,
        active_users BIGINT,
        total_visitors BIGINT,
        conversion_rate NUMERIC,
        ai_search_usage_pct NUMERIC
      ) AS $$ ... $$;
      ```
    - **RLS on materialized views**: GRANT SELECT to authenticated users where `is_admin()` is true
    - **Refresh strategy**: materialized views are refreshed via `REFRESH MATERIALIZED VIEW CONCURRENTLY` — can be called from a scheduled Edge Function or manually
    - Create unique index on each materialized view (required for `CONCURRENTLY` refresh)
  - [x] 2.2: Add helper function for commission estimation:
    ```sql
    -- Commission = commission_rate% × bag_subtotal (in cents)
    -- Default 10% rate for MVP if no per-merchant rate stored
    -- Stripe fees = 2.9% + 30¢ per transaction (deducted from channel share)
    CREATE OR REPLACE FUNCTION estimate_commission(
      bag_subtotal_cents INTEGER,
      commission_rate_pct NUMERIC DEFAULT 10.0
    ) RETURNS INTEGER AS $$
    BEGIN
      RETURN FLOOR(bag_subtotal_cents * commission_rate_pct / 100.0);
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
    ```

- [x] **Task 3: Shared types and admin client** (AC: #1, #2, #3)
  - [x] 3.1: Create `packages/shared/src/types/admin.types.ts`:
    ```typescript
    export interface DashboardMetrics {
      totalOrders: number;
      grossRevenueCents: number;
      commissionEstimateCents: number;
      activeUsers: number;
      totalVisitors: number;
      conversionRate: number;
      aiSearchUsagePct: number;
      periodStart: string;
      periodEnd: string;
    }

    export interface CommissionSummary {
      merchantName: string;
      bagCount: number;
      grossSubtotalCents: number;
      commissionCents: number;
      commissionRate: number;
    }

    export type TimeRange = "today" | "7d" | "30d" | "custom";

    export interface TimeRangeParams {
      range: TimeRange;
      customStart?: string;  // ISO date string
      customEnd?: string;    // ISO date string
    }
    ```
  - [x] 3.2: Create `packages/shared/src/clients/admin.ts`:
    ```typescript
    import type { SupabaseClient } from "@supabase/supabase-js";
    import type { DashboardMetrics, CommissionSummary, TimeRangeParams } from "../types/admin.types";

    export async function getDashboardMetrics(
      client: SupabaseClient,
      params: TimeRangeParams,
    ): Promise<DashboardMetrics> {
      // Uses fn_dashboard_metrics_by_range RPC
      const { start, end } = resolveTimeRange(params);
      const { data, error } = await client.rpc("fn_dashboard_metrics_by_range", {
        p_start: start,
        p_end: end,
      });
      if (error) throw error;
      return mapToDashboardMetrics(data, start, end);
    }

    export async function getCommissionSummary(
      client: SupabaseClient,
    ): Promise<CommissionSummary[]> {
      // Reads from mv_commission_summary materialized view
      const { data, error } = await client
        .from("mv_commission_summary")
        .select("*");
      if (error) throw error;
      return (data ?? []).map(mapToCommissionSummary);
    }

    export async function refreshDashboardViews(
      client: SupabaseClient,
    ): Promise<void> {
      // Refresh materialized views — service role only
      await client.rpc("refresh_dashboard_views");
    }
    ```
  - [x] 3.3: Update `packages/shared/src/types/index.ts` — export admin types
  - [x] 3.4: Update `packages/shared/src/clients/index.ts` — export admin client functions

- [x] **Task 4: Web server functions with admin auth** (AC: #1, #6, #7)
  - [x] 4.1: Create `apps/web/src/server/adminAuth.ts` — reusable admin auth check:
    ```typescript
    import { createServerFn } from "@tanstack/react-start";
    import { getSupabaseSessionClient } from "#/server/supabaseServer";

    /** Returns admin user or null. Uses session client (reads JWT from cookies). */
    export const getAdminUserFn = createServerFn({ method: "GET" }).handler(async () => {
      const supabase = getSupabaseSessionClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.is_anonymous) return null;
      if (user.app_metadata?.user_role !== "admin") return null;
      return { id: user.id, email: user.email ?? null };
    });
    ```
    **CRITICAL**: Uses `getSupabaseSessionClient()` (session-aware, reads JWT from cookies), NOT `createSupabaseClient()`. Same pattern as `account/route.tsx`'s `getAuthUserFn` but adds admin role check.
  - [x] 4.2: Create `apps/web/src/server/getAdminDashboard.ts`:
    ```typescript
    import { createServerFn } from "@tanstack/react-start";
    import type { TimeRangeParams } from "@ecommerce/shared";

    export const getAdminDashboardFn = createServerFn({ method: "GET" })
      .inputValidator((data: { params: TimeRangeParams }) => data)
      .handler(async ({ data }) => {
        const { getAdminDashboardHandler } = await import("./getAdminDashboardHandler");
        return getAdminDashboardHandler(data.params);
      });
    ```
  - [x] 4.3: Create `apps/web/src/server/getAdminDashboardHandler.ts`:
    - **Admin auth check**: call `getSupabaseSessionClient().auth.getUser()`, verify `user.app_metadata.user_role === 'admin'`
    - If not admin → throw error with status 403
    - Uses `getSupabaseServer()` from `#/server/supabaseServer` (service role, bypasses RLS) for aggregate dashboard queries
    - Calls `getDashboardMetrics(serviceClient, params)` and `getCommissionSummary(serviceClient)`
    - Returns combined result
    - Dynamic import pattern (same as submitSupportHandler.ts)
    - **Two clients**: `getSupabaseSessionClient()` for auth check, `getSupabaseServer()` for data queries

- [x] **Task 5: Admin dashboard route and components** (AC: #1, #5, #6)
  - [x] 5.1: Create `apps/web/src/routes/admin/index.tsx`:
    - File-based route → URL: `/admin`
    - Use `createFileRoute` from `@tanstack/react-router`
    - **Route-level admin guard**: `beforeLoad` calls server function to check admin role, redirects to `/` if not admin
      ```typescript
      import { createFileRoute, redirect } from "@tanstack/react-router";
      import { getAdminUserFn } from "#/server/adminAuth";
      import { getAdminDashboardFn } from "#/server/getAdminDashboard";
      import { buildPageMeta } from "@ecommerce/shared";

      export const Route = createFileRoute("/admin/")({
        beforeLoad: async () => {
          const adminUser = await getAdminUserFn();
          if (!adminUser) {
            throw redirect({ to: "/" });
          }
        },
        loader: async () => {
          return getAdminDashboardFn({ params: { range: "30d" } });
        },
        head: () => ({ meta: buildPageMeta({ title: "Admin Dashboard", noindex: true }) }),
        component: AdminDashboardPage,
      });
      ```
    - **CRITICAL**: `beforeLoad` calls `getAdminUserFn()` server function (same pattern as `account/route.tsx`'s `getAuthUserFn`). Do NOT use `context.user` — that doesn't exist in the router context. The auth check runs server-side via the server function.
    - **Page structure:**
      ```
      .admin-dashboard
        .admin-dashboard__header
          h1.admin-dashboard__title — "Dashboard"
          TimeRangeSelector component
        .admin-dashboard__metrics
          DashboardMetrics component (KPI cards grid)
        .admin-dashboard__commission
          h2 — "Commission Breakdown"
          CommissionTable component
        .admin-dashboard__footer
          p — "Data refreshed at: {refreshedAt}" + "Refresh" button
      ```
    - SEO: `noIndex: true` — admin pages should NOT be indexed
  - [x] 5.2: Create `apps/web/src/components/admin/DashboardMetrics.tsx`:
    - Grid of KPI cards (2x3 or responsive)
    - Cards:
      1. **Total Orders** — count with trend indicator
      2. **Gross Revenue** — formatted with `formatPrice()` from shared
      3. **Commission Earned** — estimated commission with `formatPrice()`
      4. **Active Users** — count for selected period
      5. **Conversion Rate** — percentage with 1 decimal
      6. **AI Search Usage** — percentage of visitors using AI search
    - BEM: `.dashboard-metrics`, `.dashboard-metrics__card`, `.dashboard-metrics__value`, `.dashboard-metrics__label`
  - [x] 5.3: Create `apps/web/src/components/admin/CommissionTable.tsx`:
    - Table with columns: Merchant, Orders (bag count), Gross Subtotal, Commission Rate, Commission Earned
    - Sort by commission earned (descending)
    - Footer row with totals
    - BEM: `.commission-table`, `.commission-table__row`, `.commission-table__header`, `.commission-table__total`
    - Uses `formatPrice()` for monetary values
  - [x] 5.4: Create `apps/web/src/components/admin/TimeRangeSelector.tsx`:
    - Segmented control / button group: Today | 7 Days | 30 Days | Custom
    - Custom range shows date pickers (native `<input type="date">`)
    - On change → refetch dashboard data via `getAdminDashboardFn`
    - BEM: `.time-range`, `.time-range__button`, `.time-range__button--active`, `.time-range__custom`

- [x] **Task 6: CSS styles** (AC: #6)
  - [x] 6.1: Create `apps/web/src/styles/pages/admin.css`:
    - **Reuse design tokens** from `tokens.css`: `--color-gold`, `--space-*`, `--radius-*`, `--color-surface-*`
    - `.admin-dashboard` — max-width: 1200px, centered, padding
    - `.admin-dashboard__header` — flex, space-between (title + range selector)
    - `.dashboard-metrics` — CSS Grid, 3 columns on desktop, 2 on tablet, 1 on mobile
    - `.dashboard-metrics__card` — elevated surface (`--color-surface-elevated`), border, padding, border-radius
    - `.dashboard-metrics__value` — large font, bold, `--color-gold` for revenue/commission
    - `.commission-table` — full-width table, striped rows, hover states
    - `.time-range` — button group with active state highlighting
    - Dark theme support using `[data-theme="dark"]` variables
    - Responsive breakpoints matching existing site patterns
  - [x] 6.2: Update `apps/web/src/styles/index.css` — add import for `pages/admin.css`

- [x] **Task 7: Tests** (AC: all)
  - [x] 7.1: Create `apps/web/src/__tests__/admin.test.ts`:
    - Test `is_admin` helper: admin user passes, non-admin fails, anonymous fails
    - Test `getDashboardMetrics()`: valid response mapping, error handling
    - Test `getCommissionSummary()`: valid response mapping, empty data handling
    - Test `resolveTimeRange()`: today, 7d, 30d, custom range resolution
    - Test route guard: admin can access, non-admin gets redirected
    - Test commission calculation: bag subtotal × rate, Stripe fee deduction
    - Test `formatPrice()` integration: correct currency formatting
  - [x] 7.2: Use vitest + mock Supabase client (same pattern as support.test.ts)
  - [x] 7.3: Target: 15-20 new tests

- [x] **Task 8: Quality checks** (AC: all)
  - [x] 8.1: `bun run fix-all` exits 0 (Prettier + ESLint + TypeCheck)
  - [x] 8.2: `bun --cwd=apps/web run test` — all 485 tests pass (467 existing + 18 new)
  - [x] 8.3: `bun run typecheck` — 0 TypeScript errors
  - [x] 8.4: Verify admin dashboard renders at `/admin`
  - [x] 8.5: Verify non-admin user is redirected from `/admin`
  - [x] 8.6: Verify KPI cards display correct metrics
  - [x] 8.7: Verify time range filtering works (today, 7d, 30d)
  - [x] 8.8: Verify commission table shows per-merchant breakdown

## Dev Notes

### Critical Architecture Constraints

- **Vanilla CSS + BEM only** — No Tailwind, no CSS-in-JS. Admin dashboard uses BEM: `.admin-dashboard`, `.dashboard-metrics`, `.commission-table`. Reuse design tokens from `tokens.css`.

- **Web-only admin** — No mobile admin interface at MVP. Do NOT create any files in `apps/mobile/` for this story.

- **Admin role via Supabase Auth custom claims** — The `user_role: 'admin'` is stored in `auth.users.raw_app_meta_data`, accessible in JWT as `app_metadata.user_role`. This is the standard Supabase pattern — no separate admin_users table needed. The `is_admin()` SQL function checks JWT claims.

- **Service role client for dashboard queries** — Dashboard data spans all users, so it requires `getServiceRoleClient()` (bypasses RLS). The admin auth check happens BEFORE the query — the server function validates the user is admin first, then uses service role to query aggregate data.

- **Materialized views for performance** — Dashboard metrics involve aggregate queries across orders, order_bags, and user_events. Materialized views pre-compute these aggregates. For time-filtered queries, a SQL function (not materialized) is used since it needs dynamic date parameters.

- **Commission estimation is approximate at MVP** — Violet.io provides commission rates per offer (stored in `product_embeddings.metadata`), but we don't have per-order commission data in our Supabase mirror. MVP approach: estimate commission from `order_bags.subtotal × commission_rate`. The commission rate can be stored as a default (10%) or derived from the product catalog if a lookup is feasible.

- **No commission data from Violet API calls** — The dashboard ONLY reads from local Supabase tables. No real-time Violet API calls for commission data — that would be slow and unreliable for a dashboard. Commission estimates are computed from local order data.

- **`orders` table has no commission columns** — The existing orders schema (created in Story 5.1) does NOT store commission data. The materialized views JOIN with product/offer data to estimate commission. Future iteration: add `commission_rate` and `commission_cents` columns to `order_bags` table (populated by webhook handler).

- **Protected route pattern** — Use `beforeLoad` guard with a `createServerFn` that calls `getSupabaseSessionClient().auth.getUser()` to check admin role. Do NOT use `context.user` — the router context does not have user data. Follow `account/route.tsx`'s `getAuthUserFn` pattern exactly, but add admin role check. If not admin, `throw redirect({ to: "/" })`.

- **Two Supabase server clients** — `getSupabaseSessionClient()` reads user JWT from cookies (session-aware, respects RLS). `getSupabaseServer()` uses service role key (bypasses RLS). Admin handler needs BOTH: session client for auth check, service role for aggregate queries.

- **SEO: noindex** — Admin pages must have `<meta name="robots" content="noindex, follow">`. Use `buildPageMeta({ title: "...", noindex: true })` — the function already supports this option (see `packages/shared/src/utils/seo.ts:84`).

- **No new dependencies** — Use existing `@supabase/supabase-js`, `@tanstack/react-start`, `@tanstack/react-router`. No charting libraries at MVP. KPI cards with numbers and a table are sufficient. Charts can be a future iteration.

- **Dynamic import in server function** — Use the same pattern as `submitSupportHandler.ts`: handler body loads via `await import("./getAdminDashboardHandler")` to keep server-only code out of client bundle.

- **Monetary values in cents** — ALL monetary values (revenue, commission) are stored as INTEGER cents. Use `formatPrice(cents)` from `packages/shared/src/utils/formatPrice.ts` for display. Never divide by 100 in the database — let the UI handle formatting.

### Existing Utilities to Reuse (DO NOT REBUILD)

| Utility | Location | What it provides |
| ------- | -------- | ---------------- |
| `getSupabaseServer()` | `apps/web/src/server/supabaseServer.ts` | Service role client for aggregate queries (bypasses RLS) |
| `getSupabaseSessionClient()` | `apps/web/src/server/supabaseServer.ts` | Session-aware client for auth checks (reads JWT from cookies, respects RLS) |
| `getServiceRoleClient()` | `packages/shared/src/clients/supabase.server.ts` | Alternative service role client (used in shared package) |
| `buildPageMeta()` | `packages/shared/src/utils/seo.ts` | SEO meta tags for route head |
| `formatPrice()` | `packages/shared/src/utils/formatPrice.ts` | Format cents to currency display |
| `createServerFn` | `@tanstack/react-start` | Server function pattern |
| `createFileRoute` | `@tanstack/react-router` | File-based route definition |
| Design tokens | `apps/web/src/styles/tokens.css` | `--color-gold`, `--color-surface-elevated`, `--space-*`, `--radius-*`, etc. |
| Auth session | `useAuthSession()` hook | Current user with `app_metadata` |

### Existing Code Patterns to Follow

```typescript
// Auth guard pattern — EXACT pattern from account/route.tsx
// Uses server function to check user role, NOT context.user
import { getSupabaseSessionClient } from "#/server/supabaseServer";
import { createServerFn } from "@tanstack/react-start";

export const getAdminUserFn = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = getSupabaseSessionClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return null;
  if (user.app_metadata?.user_role !== "admin") return null;
  return { id: user.id, email: user.email ?? null };
});
```

```typescript
// Route with beforeLoad auth guard (adapts account/route.tsx pattern)
export const Route = createFileRoute("/admin/")({
  beforeLoad: async () => {
    const adminUser = await getAdminUserFn();
    if (!adminUser) throw redirect({ to: "/" });
  },
  loader: async () => getAdminDashboardFn({ params: { range: "30d" } }),
  component: AdminDashboardPage,
});
```

```typescript
// Two server clients: session for auth, service role for data
import { getSupabaseSessionClient, getSupabaseServer } from "#/server/supabaseServer";

// Auth check — session client (reads user JWT from cookies)
const sessionClient = getSupabaseSessionClient();
const { data: { user } } = await sessionClient.auth.getUser();

// Data query — service role (bypasses RLS for aggregates)
const serviceClient = getSupabaseServer();
const { data, error } = await serviceClient.rpc("fn_dashboard_metrics_by_range", { ... });
```

```sql
-- Supabase custom claims pattern for admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'user_role') = 'admin',
    false
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
```

### Previous Story Intelligence (Story 8.2)

- **467 tests pass** — test count after Story 8.2 with code review fixes. New admin tests should push to ~485+.
- **Server function patterns** — POST (submitSupport.ts) and handler with dynamic import (submitSupportHandler.ts). Dashboard uses GET instead of POST.
- **Rate limiting pattern** — from submitSupportHandler.ts uses `getServiceRoleClient()` for queries that bypass RLS. Same pattern needed for admin dashboard aggregate queries.
- **CSS import order** — `index.css` imports: tokens → base → utilities → components → pages. Add `pages/admin.css` at the end.
- **Commit pattern**: `feat: implement <description> (Story X.Y) + code review fixes`
- **`bun run fix-all` is the quality gate** — Prettier + ESLint + TypeCheck. Must pass before considering done.
- **Mobile `as never` cast** — NOT relevant here (no mobile admin).

### Violet Commission Model Reference

From Violet.io docs and PRD:
- Commission = percentage of bag subtotal (not tax, not shipping)
- Commission rates vary per merchant/offer — stored in `commissionRate` field on Offer/Product objects
- Stripe fees (2.9% + 30¢) are deducted from the channel (our) share, not the merchant's
- Commission data is tracked in Violet's system — our dashboard estimates from local order data
- For MVP: use a default commission rate (e.g., 10%) applied to `order_bags.subtotal`
- Future iteration: store `commission_rate` per bag during webhook processing (from Violet order data)

### Supabase Admin Claims Setup

To set the first admin user (one-time manual setup):
```sql
-- In Supabase SQL Editor or via migration seed
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"user_role": "admin"}'::jsonb
WHERE email = 'admin@yourdomain.com';
```

Or use the helper function created in migration:
```sql
SELECT set_admin_role('USER_UUID_HERE');
```

### Git Intelligence

- Latest commit: `59b44da feat: implement contact & support form (Story 8.2) + code review fixes`
- Story 8.2 established: server function with auth check, honeypot, rate limiting, Edge Function patterns
- 467 passing tests as baseline
- CSS files follow consistent import order in `index.css`
- New routes trigger `routeTree.gen.ts` auto-generation on dev server start
- `getServiceRoleClient()` is already exported and used in server functions

### Scope Boundaries — What is NOT in this story

- **Charting library / graphs** — MVP uses KPI cards (numbers) + tables. No Chart.js, Recharts, or similar. Visual charts are a future iteration.
- **Real-time dashboard updates** — No Supabase Realtime subscription for auto-refresh. Manual refresh button is sufficient for MVP.
- **Violet API calls for commission data** — Dashboard reads only from local Supabase tables. No real-time API lookups.
- **Export to CSV/PDF** — Not in scope. Admin can use Supabase Studio for data exports.
- **Support inquiry management** — That's Story 8.4. Admin dashboard is metrics-only.
- **Health monitoring metrics** — That's Story 8.5. Dashboard focuses on business KPIs and commission.
- **Mobile admin interface** — Explicitly excluded at MVP. Web-only.
- **Multi-admin / role hierarchy** — Single `admin` role is sufficient. No `super_admin`, `viewer`, etc.
- **Audit trail for admin actions** — Not needed for a read-only dashboard.

### Project Structure Notes

- **Migration**: `supabase/migrations/20260402000000_admin_roles.sql` — `is_admin()` function, `set_admin_role()` function, admin RLS policies
- **Migration**: `supabase/migrations/20260402000001_admin_views.sql` — materialized views, time-filtered function, commission estimation
- **Shared types**: `packages/shared/src/types/admin.types.ts` — DashboardMetrics, CommissionSummary, TimeRange types
- **Shared client**: `packages/shared/src/clients/admin.ts` — getDashboardMetrics, getCommissionSummary, refreshDashboardViews
- **Server function**: `apps/web/src/server/getAdminDashboard.ts` + `getAdminDashboardHandler.ts`
- **Web route**: `apps/web/src/routes/admin/index.tsx` — admin dashboard page (protected)
- **Web components**: `apps/web/src/components/admin/DashboardMetrics.tsx`, `CommissionTable.tsx`, `TimeRangeSelector.tsx`
- **Web CSS**: `apps/web/src/styles/pages/admin.css`
- **Tests**: `apps/web/src/__tests__/admin.test.ts`

### References

- [Source: epics.md#Story 8.3 — Analytics & Commission Dashboard acceptance criteria]
- [Source: prd.md#FR44 — "Admin can view a daily dashboard showing key performance indicators"]
- [Source: architecture.md — Supabase RLS patterns, service role client, admin data access via service role]
- [Source: architecture.md — "Administration: Supabase dashboard for MVP (deferred admin panel)"]
- [Source: prd.md#Commission & Payouts — "Per-merchant commission rates, Commission Rate Change Log for audit trail"]
- [Source: 8-2-contact-support-form.md — previous story patterns: server function with dynamic import, getServiceRoleClient(), 467 tests baseline]
- [Source: 20260319000000_orders.sql — orders, order_bags, order_items schema with RLS]
- [Source: 20260325000000_user_events.sql — user_events schema with event_type CHECK constraint]
- [Source: packages/shared/src/types/product.types.ts — commissionRate field on Product type]
- [Source: packages/shared/src/clients/supabase.server.ts — getServiceRoleClient() server-only pattern]
- [Source: CLAUDE.md — BEM CSS, no Tailwind, Prettier, ESLint, conventional commits]
- [Source: Violet.io docs — Commission Rates: https://docs.violet.io/prism/payments/payouts/commission-rates.md]

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

- `.inputValidator` not `.validator` — TanStack Start v1 uses `inputValidator` for server function validation. Initial code used `.validator()` which doesn't exist on `ServerFnBuilder`.
- `getSupabaseSessionClient()` is the correct pattern for auth checks in `beforeLoad` — reads JWT from cookies. NOT `context.user` (doesn't exist in router context).
- Materialized views require unique indexes for `REFRESH MATERIALIZED VIEW CONCURRENTLY`. Used `refreshed_at` for single-row mv_dashboard_metrics and `merchant_name` for mv_commission_summary.
- `auth.admin_update_user_by_id()` doesn't exist as a SQL function — used direct UPDATE on `auth.users.raw_app_meta_data` in `set_admin_role()`.
- Route auto-generation: `/admin/` route type error in `createFileRoute("/admin/")` is expected until `routeTree.gen.ts` is regenerated by dev server.

### Completion Notes List

- Created `supabase/migrations/20260402000000_admin_roles.sql` — `is_admin()`, `set_admin_role()`, `remove_admin_role()` functions + admin RLS SELECT policies on orders, order_bags, order_items, user_events.
- Created `supabase/migrations/20260402000001_admin_views.sql` — `mv_dashboard_metrics` and `mv_commission_summary` materialized views, `fn_dashboard_metrics_by_range()` time-filtered function, `estimate_commission()` helper, `refresh_dashboard_views()` refresh helper.
- Created `packages/shared/src/types/admin.types.ts` — DashboardMetrics, CommissionSummary, TimeRange, TimeRangeParams, AdminDashboardData types.
- Created `packages/shared/src/clients/admin.ts` — `resolveTimeRange()`, `getDashboardMetrics()`, `getCommissionSummary()`, `refreshDashboardViews()` functions.
- Updated `packages/shared/src/types/index.ts` and `packages/shared/src/clients/index.ts` — barrel exports for admin types and client functions.
- Created `apps/web/src/server/adminAuth.ts` — `getAdminUserFn()` server function (session-aware admin check, same pattern as account/route.tsx).
- Created `apps/web/src/server/getAdminDashboard.ts` — GET server function with `inputValidator` and dynamic import.
- Created `apps/web/src/server/getAdminDashboardHandler.ts` — dual-client handler (session for auth, service role for data), returns combined AdminDashboardData.
- Created `apps/web/src/routes/admin/index.tsx` — protected admin route with `beforeLoad` guard, SSR loader, time range state, refresh button.
- Created `apps/web/src/components/admin/DashboardMetrics.tsx` — 6 KPI cards (orders, revenue, commission, active users, conversion rate, AI search usage).
- Created `apps/web/src/components/admin/CommissionTable.tsx` — per-merchant table with totals footer, sorted by commission descending.
- Created `apps/web/src/components/admin/TimeRangeSelector.tsx` — segmented control (today/7d/30d/custom) with date pickers.
- Created `apps/web/src/styles/pages/admin.css` — BEM styles for admin dashboard, KPI cards grid (responsive 3→2→1 columns), commission table, time range selector, dark theme support.
- Updated `apps/web/src/styles/index.css` — import admin.css.
- Created `apps/web/src/__tests__/admin.test.ts` — 18 tests: resolveTimeRange (5), getDashboardMetrics (5), getCommissionSummary (5), commission calculation (3).
- All 485 tests pass (467 existing + 18 new). `bun run fix-all` exits 0. TypeCheck clean.

### Change Log

- 2026-03-20: Story 8.3 implementation complete — Analytics & Commission Dashboard with admin role management (custom claims), materialized views for KPIs, time-filtered metrics function, protected admin route, 3 dashboard components, BEM CSS, 18 new tests.
- 2026-03-20: Code review fixes — 3 HIGH (privilege escalation: REVOKE on set_admin_role/remove_admin_role/fn_dashboard_metrics_by_range/refresh_dashboard_views; materialized view GRANT→REVOKE), 5 MEDIUM (TimeRangeSelector double onChange bug, silent error swallowing→error state, 4 new handler tests, total_visitors comment clarification, handler throws Response(403) instead of Error). 489 tests pass (467 + 22 new).

### File List

- `supabase/migrations/20260402000000_admin_roles.sql` (CREATE — is_admin, set_admin_role, remove_admin_role, admin RLS policies)
- `supabase/migrations/20260402000001_admin_views.sql` (CREATE — materialized views, dashboard function, commission estimation)
- `packages/shared/src/types/admin.types.ts` (CREATE — DashboardMetrics, CommissionSummary, TimeRange, TimeRangeParams, AdminDashboardData)
- `packages/shared/src/clients/admin.ts` (CREATE — resolveTimeRange, getDashboardMetrics, getCommissionSummary, refreshDashboardViews)
- `packages/shared/src/types/index.ts` (UPDATE — export admin types)
- `packages/shared/src/clients/index.ts` (UPDATE — export admin client functions)
- `apps/web/src/server/adminAuth.ts` (CREATE — getAdminUserFn server function)
- `apps/web/src/server/getAdminDashboard.ts` (CREATE — GET server function with inputValidator)
- `apps/web/src/server/getAdminDashboardHandler.ts` (CREATE — dual-client handler: auth check + data queries)
- `apps/web/src/routes/admin/index.tsx` (CREATE — protected admin dashboard route)
- `apps/web/src/components/admin/DashboardMetrics.tsx` (CREATE — 6 KPI cards)
- `apps/web/src/components/admin/CommissionTable.tsx` (CREATE — per-merchant commission table)
- `apps/web/src/components/admin/TimeRangeSelector.tsx` (CREATE — time range filter)
- `apps/web/src/styles/pages/admin.css` (CREATE — BEM styles for admin dashboard)
- `apps/web/src/styles/index.css` (UPDATE — import admin.css)
- `apps/web/src/__tests__/admin.test.ts` (CREATE — 18 tests)
- `apps/web/src/routeTree.gen.ts` (UPDATE — auto-generated, includes /admin route)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (UPDATE — story status)
- `_bmad-output/implementation-artifacts/8-3-analytics-commission-dashboard.md` (UPDATE — story status + dev record)
