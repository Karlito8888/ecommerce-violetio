# Story 5.3: Unified Order Tracking View

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Quick Reference — Files to Create/Update

| Action | File | Notes |
| ------ | ---- | ----- |
| CREATE | `packages/shared/src/hooks/useOrders.ts` | TanStack Query hooks: `ordersQueryOptions`, `orderDetailQueryOptions`, `useOrdersQuery`, `useOrderDetailQuery` + Supabase Realtime subscription hook `useOrderRealtime` |
| UPDATE | `packages/shared/src/hooks/index.ts` | Export new order hooks and fetch function types |
| CREATE | `apps/web/src/server/orders.ts` | Server Functions: `getOrdersFn`, `getOrderDetailFn` — fetch from Supabase (NOT Violet API) |
| CREATE | `apps/web/src/routes/account/orders/index.tsx` | Order history list page — SSR with route loader |
| CREATE | `apps/web/src/routes/account/orders/$orderId.tsx` | Order detail + per-merchant bag tracking — SSR with route loader |
| CREATE | `apps/web/src/routes/account/route.tsx` | Account layout route — auth guard, shared layout for account pages |
| CREATE | `apps/web/src/styles/pages/orders.css` | BEM CSS for orders list + order detail pages |
| UPDATE | `apps/web/src/styles/index.css` | Add `@import` for orders.css in pages section |
| CREATE | `packages/shared/src/hooks/__tests__/useOrders.test.ts` | Unit tests for query options factories and Realtime hook |
| CREATE | `apps/web/src/server/__tests__/orders.test.ts` | Unit tests for server functions |

---

## Story

As a **buyer**,
I want to view all my orders in a unified dashboard with per-merchant tracking,
so that I can follow the status of everything I've purchased.

## Acceptance Criteria

1. **Given** an authenticated buyer
   **When** they navigate to their orders page (`/account/orders`)
   **Then** all orders are listed in reverse chronological order (FR24)
   **And** each order shows: order date, total, overall status, number of merchants

2. **Given** an order in the list
   **When** the buyer clicks/expands it (navigates to `/account/orders/{orderId}`)
   **Then** per-merchant bags are displayed with: merchant name, items, bag status, tracking link (if shipped)
   **And** bag statuses are mapped to user-friendly labels: IN_PROGRESS → "Processing", SUBMITTED → "Processing", ACCEPTED → "Confirmed", SHIPPED → "Shipped", COMPLETED → "Delivered", CANCELED → "Canceled", REFUNDED → "Refunded" (FR25)
   **And** mixed bag states within an order show a clear summary (e.g., "2 of 3 items shipped")

3. **Given** an unauthenticated visitor
   **When** they attempt to access `/account/orders`
   **Then** they are redirected to the login page with a return URL

4. **Given** a connected buyer viewing orders
   **When** a webhook updates an order or bag status in Supabase
   **Then** Supabase Realtime pushes the change to the client
   **And** TanStack Query cache is invalidated, triggering a re-fetch (FR54)
   **And** the UI updates without manual refresh

5. **Given** the orders list or detail page
   **When** data is loading
   **Then** skeleton loading states are displayed (not spinners) per UX spec
   **And** error states show clear messages with retry options

6. **Given** a buyer with no orders
   **When** they visit `/account/orders`
   **Then** an empty state is shown with a CTA to browse products

7. **Given** the shared hooks in `packages/shared/`
   **When** consumed by the web app
   **Then** `useOrdersQuery` and `useOrderDetailQuery` use the platform-agnostic fetch function pattern from `useProducts.ts`
   **And** query keys use `queryKeys.orders.list()` and `queryKeys.orders.detail(orderId)`

## Tasks / Subtasks

- [x] Task 1: Create shared order hooks — `packages/shared/src/hooks/useOrders.ts` (AC: #1, #2, #7)
  - [x] 1.1: Create `OrdersFetchFn` and `OrderDetailFetchFn` type aliases (same pattern as `ProductsFetchFn`)
  - [x] 1.2: Create `ordersQueryOptions(fetchFn)` returning `queryOptions` with `queryKeys.orders.list()`
  - [x] 1.3: Create `orderDetailQueryOptions(orderId, fetchFn)` returning `queryOptions` with `queryKeys.orders.detail(orderId)`
  - [x] 1.4: Create `useOrderRealtime(userId, queryClient)` hook that subscribes to Supabase Realtime `postgres_changes` on `orders` and `order_bags` tables filtered by `user_id`, and invalidates `queryKeys.orders.all()` on any UPDATE event
  - [x] 1.5: Export all from `packages/shared/src/hooks/index.ts`

- [x] Task 2: Create web server functions — `apps/web/src/server/orders.ts` (AC: #1, #2)
  - [x] 2.1: Create `getOrdersFn` server function: query Supabase `orders` table filtered by authenticated `user_id`, ordered by `created_at DESC`, include count of bags per order via a joined subquery or separate query
  - [x] 2.2: Create `getOrderDetailFn(orderId)` server function: query Supabase `orders` with nested `order_bags` → `order_items`, filtered by `user_id` (RLS enforced), return full order with bags and items
  - [x] 2.3: Both functions must get the user session from Supabase server client — return error if not authenticated

- [x] Task 3: Create account layout route — `apps/web/src/routes/account/route.tsx` (AC: #3)
  - [x] 3.1: Create layout route that checks auth via Supabase session in `beforeLoad`
  - [x] 3.2: If not authenticated, redirect to `/auth/login?returnTo=/account/orders`
  - [x] 3.3: Render `<Outlet />` for child routes

- [x] Task 4: Create orders list page — `apps/web/src/routes/account/orders/index.tsx` (AC: #1, #5, #6)
  - [x] 4.1: Route loader prefetches orders via `queryClient.ensureQueryData(ordersQueryOptions(...))`
  - [x] 4.2: Render order list with: date (formatted), total (formatted via `formatPrice`), status badge (using `ORDER_STATUS_LABELS`), merchant count
  - [x] 4.3: Each order card links to `/account/orders/${orderId}`
  - [x] 4.4: Empty state with "Browse products" CTA when no orders exist
  - [x] 4.5: Loading skeleton state (not spinner)
  - [x] 4.6: Error state with retry button

- [x] Task 5: Create order detail page — `apps/web/src/routes/account/orders/$orderId.tsx` (AC: #2, #4, #5)
  - [x] 5.1: Route loader prefetches order detail via `queryClient.ensureQueryData(orderDetailQueryOptions(...))`
  - [x] 5.2: Display order header: order ID, date, overall status badge, total
  - [x] 5.3: Display per-merchant bags: merchant name, bag status badge (using `BAG_STATUS_LABELS`), items list with thumbnails
  - [x] 5.4: For SHIPPED bags: display tracking link (external link to carrier) and carrier name
  - [x] 5.5: For mixed bag states: show summary via `getBagStatusSummary()` (e.g., "2 of 3 items shipped")
  - [x] 5.6: Display pricing breakdown: subtotal, shipping, tax, total (same pattern as confirmation page)
  - [x] 5.7: Initialize `useOrderRealtime` hook for live status updates
  - [x] 5.8: "Back to orders" navigation link

- [x] Task 6: Create BEM CSS — `apps/web/src/styles/pages/orders.css` (AC: #1, #2, #5)
  - [x] 6.1: `.orders` block — page container (max-width, centered, same as confirmation pattern)
  - [x] 6.2: `.orders__list` — order cards grid
  - [x] 6.3: `.orders__card` — individual order card with date, status, total, merchant count
  - [x] 6.4: `.orders__status-badge` — status pill with color variants per status
  - [x] 6.5: `.orders__empty` — empty state layout
  - [x] 6.6: `.order-detail` block — detail page container
  - [x] 6.7: `.order-detail__header` — order ID, date, status, total
  - [x] 6.8: `.order-detail__bag` — per-merchant bag card (ivory background, same as confirmation bag cards)
  - [x] 6.9: `.order-detail__item` — item row with thumbnail, name, quantity, price
  - [x] 6.10: `.order-detail__tracking` — tracking link + carrier display
  - [x] 6.11: `.order-detail__pricing` — pricing breakdown box
  - [x] 6.12: `.order-detail__bag-summary` — mixed status summary text
  - [x] 6.13: Responsive adjustments below 640px (same breakpoint as confirmation)
  - [x] 6.14: Add `@import "pages/orders.css"` to `apps/web/src/styles/index.css`

- [x] Task 7: Unit tests (AC: #1, #2, #4, #7)
  - [x] 7.1: Test `ordersQueryOptions` returns correct query key and calls fetch function
  - [x] 7.2: Test `orderDetailQueryOptions` returns correct query key with orderId
  - [x] 7.3: Test `useOrderRealtime` subscribes to correct channel and invalidates queries on UPDATE
  - [x] 7.4: Test server functions return error when not authenticated
  - [x] 7.5: Run `bun run fix-all` — 0 errors, 0 warnings
  - [x] 7.6: Run `bun --cwd=apps/web run test` — all tests pass
  - [x] 7.7: Run `bun run typecheck` — no type errors

## Dev Notes

### Critical Architecture Constraints

- **Data source is Supabase, NOT Violet API** — Orders list and detail pages query the local Supabase mirror (orders + order_bags + order_items). Violet is source of truth but Supabase has the persisted copy from Story 5.1 + webhook updates from Story 5.2. Do NOT call Violet's GET /orders endpoint — that would bypass RLS and introduce latency.

- **RLS enforces access control** — The `users_read_own_orders` policy ensures authenticated users only see their orders. Server functions use the Supabase server client with the user's session, so RLS applies automatically. Do NOT use service_role for user-facing queries.

- **Platform-agnostic hook pattern** — Follow the exact pattern from `useProducts.ts`:
  ```typescript
  // Type alias for the platform-specific fetch function
  export type OrdersFetchFn = () => Promise<OrderWithBagCount[]>;

  // Factory returning queryOptions (not a hook) — usable in both loaders and components
  export function ordersQueryOptions(fetchFn: OrdersFetchFn) {
    return queryOptions({
      queryKey: queryKeys.orders.list(),
      queryFn: fetchFn,
    });
  }
  ```
  Web passes a TanStack Start Server Function; mobile (future) will pass a Supabase Edge Function call.

- **Supabase Realtime channel convention** — From architecture.md:
  ```typescript
  // Channel name: "orders:user_{userId}"
  // Subscribe to postgres_changes on orders AND order_bags tables
  const channel = supabase
    .channel(`orders:user_${userId}`)
    .on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "orders",
      filter: `user_id=eq.${userId}`,
    }, () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all() });
    })
    .on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "order_bags",
    }, () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all() });
    })
    .subscribe();
  ```
  Realtime is a **cache-invalidation signal** — when an UPDATE is detected, invalidate the TanStack Query cache and let it re-fetch. Do NOT try to patch local state from the Realtime payload (REPLICA IDENTITY DEFAULT only sends PK, not full row).

- **order_bags Realtime filter limitation** — `order_bags` has no `user_id` column, so the Realtime subscription cannot be filtered by user. Subscribe to all order_bags UPDATEs on the channel. This is acceptable because:
  1. Realtime only broadcasts to subscribed channels
  2. The cache invalidation just triggers a re-fetch (RLS-protected)
  3. Worst case: a spurious invalidation causes a harmless re-fetch

- **Account routes don't exist yet** — This is the FIRST account route. The `account/route.tsx` layout must be created as an auth guard. Use `beforeLoad` in TanStack Router to check the Supabase session and redirect to login if absent.

- **BEM CSS following confirmation page pattern** — Reuse the same design tokens and visual language as `confirmation.css`:
  - `--color-ivory` background for bag cards
  - `--font-display` (Cormorant Garamond) for headings
  - `--color-sand` borders
  - Same spacing scale (`--space-*`)
  - Same max-width (680px) for content container

- **Status badges color mapping** — Use semantic colors from design tokens:
  - Processing/Confirmed → neutral (`--color-charcoal`)
  - Shipped/Partially Shipped → info (`--color-sienna`)
  - Delivered → success (`--color-success`)
  - Canceled/Refunded → warning/muted (`--color-sand`)

- **No Tailwind** — Vanilla CSS + BEM exclusively. This is an architectural constraint.

- **Monetary formatting** — Use `formatPrice()` from `@ecommerce/shared` for all price displays. All prices in Supabase are INTEGER cents.

- **Server Functions pattern** — Use `createServerFn()` from TanStack Start. Follow the pattern from `apps/web/src/server/checkout.ts`:
  ```typescript
  import { createServerFn } from "@tanstack/react-start";
  import { getSupabaseServerClient } from "./supabaseServer";

  export const getOrdersFn = createServerFn({ method: "GET" })
    .handler(async () => {
      const supabase = getSupabaseServerClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("orders")
        .select("*, order_bags(count)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      // ...
    });
  ```

### Existing Utilities to Reuse (DO NOT REBUILD)

| Utility | Location | What it provides |
| ------- | -------- | ---------------- |
| `queryKeys.orders.*` | `packages/shared/src/utils/constants.ts` | Query key factories (`.all()`, `.list(params)`, `.detail(orderId)`) |
| `ORDER_STATUS_LABELS` | `packages/shared/src/utils/orderStatusDerivation.ts` | Order status → user-friendly label mapping |
| `BAG_STATUS_LABELS` | `packages/shared/src/utils/orderStatusDerivation.ts` | Bag status → user-friendly label mapping |
| `getBagStatusSummary()` | `packages/shared/src/utils/orderStatusDerivation.ts` | "X of Y items shipped" summary for mixed states |
| `deriveOrderStatusFromBags()` | `packages/shared/src/utils/orderStatusDerivation.ts` | Client-side status derivation (if needed before Realtime pushes) |
| `formatPrice()` | `packages/shared/src/utils/formatters.ts` | Integer cents → formatted price string |
| `getSupabaseServerClient()` | `apps/web/src/server/supabaseServer.ts` | Server-side Supabase client with user session |
| `getSupabaseBrowserClient()` | `apps/web/src/utils/supabase.ts` | Browser-side Supabase client (for Realtime subscriptions) |
| `OrderRow`, `OrderBagRow`, `OrderItemRow` | `packages/shared/src/types/orderPersistence.types.ts` | Supabase table row types |

### Existing Code Patterns to Follow

```typescript
// Route loader pattern (from confirmation.tsx):
export const Route = createFileRoute("/account/orders/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      ordersQueryOptions(getOrdersFn)
    );
  },
  component: OrdersPage,
});

// Hooks pattern (from useProducts.ts):
export type OrdersFetchFn = () => Promise<ApiResponse<OrderListItem[]>>;

export function ordersQueryOptions(fetchFn: OrdersFetchFn) {
  return queryOptions({
    queryKey: queryKeys.orders.list(),
    queryFn: fetchFn,
  });
}

// CSS BEM pattern (from confirmation.css):
.orders {
  max-width: 680px;
  margin: 0 auto;
  padding: var(--space-8) var(--space-4);
}

.orders__card {
  background: var(--color-ivory);
  border: 1px solid var(--color-sand);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}
```

### Previous Story Intelligence (from Story 5.2)

- **D1**: `expo-clipboard` not installed — mobile fallback for guest token uses `Alert.alert()`. Not relevant to Story 5.3 (web only, authenticated users).
- **D2**: Mobile app has no `(tabs)` layout group — `router.replace("/(tabs)")` is invalid, use `router.replace("/")`. Not relevant to Story 5.3 (web only).
- **D3**: Pre-existing test failures in `webhookSchemas.test.ts` (2 tests) — verify if still present before running tests.
- **Realtime setup complete** — Story 5.2 added `orders` and `order_bags` to `supabase_realtime` publication with DEFAULT replica identity. Clients can subscribe immediately.
- **Status derivation utilities exist** — `orderStatusDerivation.ts` with `BAG_STATUS_LABELS`, `ORDER_STATUS_LABELS`, `deriveOrderStatusFromBags()`, `getBagStatusSummary()` are all available in `packages/shared/src/utils/`.
- **Webhook processors populate tracking info** — `processBagShipped()` stores `tracking_number`, `tracking_url`, `carrier` in `order_bags` table. Story 5.3 just needs to display these.

### Git Intelligence (from recent commits)

- Latest: `c402855 feat: implement order status webhooks processing (Story 5.2) + code review fixes`
- Conventional commit format: `feat: <description> (Story X.Y) + code review fixes`
- Story pattern: shared types/hooks → server functions → routes/pages → CSS → tests → fix-all
- Story 5.2 was purely backend; Story 5.3 is the first UI story in Epic 5 since confirmation page (Story 5.1)

### Supabase Query Patterns

**Orders list query** (with bag count):
```sql
SELECT o.*, COUNT(ob.id) as bag_count
FROM orders o
LEFT JOIN order_bags ob ON ob.order_id = o.id
WHERE o.user_id = $1
GROUP BY o.id
ORDER BY o.created_at DESC;
```

Or using Supabase client:
```typescript
const { data } = await supabase
  .from("orders")
  .select("*, order_bags(count)")
  .eq("user_id", user.id)
  .order("created_at", { ascending: false });
```

**Order detail query** (with bags + items):
```typescript
const { data } = await supabase
  .from("orders")
  .select(`
    *,
    order_bags (
      *,
      order_items (*)
    )
  `)
  .eq("id", orderId)
  .single();
```

### TanStack Router File-Based Routing

- Account layout: `apps/web/src/routes/account/route.tsx` (wraps all `/account/*` routes)
- Orders list: `apps/web/src/routes/account/orders/index.tsx` → `/account/orders`
- Order detail: `apps/web/src/routes/account/orders/$orderId.tsx` → `/account/orders/:orderId`
- After creating these files, run `bun run dev` to auto-generate the route tree in `routeTree.gen.ts`

### Project Structure Notes

- First account route in the project — establishes the pattern for future account pages (profile, wishlist, etc.)
- `account/route.tsx` auth guard will be reused by Story 6.1 (profile), Story 6.4 (wishlist), etc.
- The shared `useOrders.ts` hook will be reused by mobile app in a future story
- No new database migrations needed — all tables exist from Stories 5.1 + 5.2

### References

- [Source: epics.md#Story 5.3 — Unified Order Tracking View acceptance criteria]
- [Source: prd.md#FR24 — Order history listed in reverse chronological order]
- [Source: prd.md#FR25 — Map Violet bag-level states to user-facing unified status]
- [Source: prd.md#FR54 — Supabase Realtime for live status updates]
- [Source: architecture.md#Supabase Realtime Channel Convention — "orders:user_{userId}"]
- [Source: architecture.md#Feature-to-File Mapping — orders/index.tsx, $orderId.tsx, useOrders.ts, useOrder.ts]
- [Source: architecture.md#Query Key Convention — ['orders', 'list', { status }], ['orders', 'detail', orderId]]
- [Source: architecture.md#Data Ownership — Orders: Violet API + Supabase mirror, webhook updates → Realtime]
- [Source: ux-design-specification.md#Order tracking page — P1 priority, post-purchase experience]
- [Source: ux-design-specification.md#Skeleton loading pattern — for all content loading > 200ms]
- [Source: ux-design-specification.md#Celebratory completion — clean summary with tracking]
- [Source: ux-design-specification.md#Reassurance emotion — clear communication, proactive updates, no ambiguity]
- [Source: 5-2-order-status-webhooks-processing.md — Realtime setup, status labels, derivation utilities, tracking info persistence]
- [Source: 5-1-order-confirmation-data-persistence.md — Orders table schema, persistence patterns, guest tokens]
- [Source: CLAUDE.md — No Tailwind CSS, BEM convention, Vanilla CSS exclusively]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- TanStack Start `.handler(fn)` mutates the function passed directly — `ordersHandler` became a proxy object. Fixed by wrapping: `.handler(() => ordersHandler())` so the pure function is preserved for unit tests.
- `cleanup` variable referenced but undeclared in `useOrders.test.ts` — removed from `beforeEach` (not used by any test; tests use local `unsubscribe` variable instead).

### Completion Notes List

- Created `getSupabaseSessionClient()` in `supabaseServer.ts` using `@supabase/ssr` `createServerClient` to read Supabase chunked cookies (`sb-{host}-auth-token.N`) via TanStack Start's `getCookie` — enables RLS-aware queries for authenticated users.
- Handler/wrapper pattern for testability: `ordersHandler` and `orderDetailHandler` are pure exported functions; `getOrdersFn`/`getOrderDetailFn` are TanStack Start RPC wrappers. Tests call pure handlers directly.
- Pre-existing failure in `violetCartAdapter.test.ts` (Story 4.1): body now includes `wallet_based_checkout:true` — not related to this story, not introduced here.

**Code Review Fixes (Story 5.3):**
- H1: `ItemRow` now receives `currency` prop from `BagCard` — was hardcoded `"USD"`.
- H2: `getSupabaseSessionClient` now throws if `VITE_SUPABASE_URL` is missing — was silently falling back to localhost.
- H3: Extracted `createOrdersRealtimeChannel()` as pure exported function; `useOrderRealtime` delegates to it. Tests now call the production function directly (not a hand-written replica).
- M1: `formatDate` extracted to `packages/shared/src/utils/formatPrice.ts` with `monthFormat` param; both routes import from shared.
- M2: Retry button now uses `queryKeys.orders.all()` instead of hardcoded `["orders"]`.
- M3: `orderDetailHandler` now also filters by `.eq("user_id", user.id)` for defense-in-depth alongside RLS.

### File List

- `packages/shared/src/hooks/useOrders.ts` (CREATE)
- `packages/shared/src/hooks/index.ts` (UPDATE)
- `packages/shared/src/hooks/__tests__/useOrders.test.ts` (CREATE)
- `packages/shared/src/utils/formatPrice.ts` (UPDATE — added `formatDate`)
- `packages/shared/src/utils/index.ts` (UPDATE — export `formatDate`)
- `apps/web/src/server/orders.ts` (CREATE)
- `apps/web/src/server/supabaseServer.ts` (UPDATE — added `getSupabaseSessionClient`)
- `apps/web/src/server/__tests__/orders.test.ts` (CREATE)
- `apps/web/src/routes/account/route.tsx` (CREATE)
- `apps/web/src/routes/account/orders/index.tsx` (CREATE)
- `apps/web/src/routes/account/orders/$orderId.tsx` (CREATE)
- `apps/web/src/styles/pages/orders.css` (CREATE)
- `apps/web/src/styles/index.css` (UPDATE)
