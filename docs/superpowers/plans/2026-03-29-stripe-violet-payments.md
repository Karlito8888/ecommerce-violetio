# Stripe + Violet Payments & Commissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up real Stripe Platform keys, persist actual per-bag commission rates from Violet, and sync Violet Distributions per order into the admin dashboard.

**Architecture:** M1 adds real Stripe keys to env files. M2 adds `commission_rate` column to `order_bags`, populates it at order persistence time, and fixes the materialized views to use it. M3 adds a new `order_distributions` table, a Violet API call to fetch distribution data, and surfaces it in the admin dashboard.

**Tech Stack:** Supabase PostgreSQL migrations, TanStack Start Server Functions, Violet.io Distributions API (`GET /v1/orders/{id}/distributions`), Stripe Elements (already wired — just needs real keys), Vitest.

---

## File Map

| File                                                                | Action | Purpose                                                          |
| ------------------------------------------------------------------- | ------ | ---------------------------------------------------------------- |
| `.env.example`                                                      | UPDATE | Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`                 |
| `supabase/.env.example`                                             | UPDATE | Add `STRIPE_SECRET_KEY`                                          |
| `supabase/migrations/20260330000000_order_bags_commission_rate.sql` | CREATE | Add `commission_rate` column to `order_bags`                     |
| `supabase/migrations/20260330000001_fix_commission_views.sql`       | CREATE | Fix `mv_commission_summary` and `fn_dashboard_metrics_by_range`  |
| `supabase/migrations/20260330000002_order_distributions.sql`        | CREATE | New `order_distributions` table                                  |
| `packages/shared/src/types/orderPersistence.types.ts`               | UPDATE | Add `commissionRate` to `PersistOrderBagInput` and `OrderBagRow` |
| `packages/shared/src/types/order.types.ts`                          | UPDATE | Add `commissionRate` to `OrderBag`                               |
| `packages/shared/src/types/distribution.types.ts`                   | CREATE | `Distribution`, `DistributionRow` types                          |
| `packages/shared/src/types/index.ts`                                | UPDATE | Export `Distribution`, `DistributionRow`                         |
| `packages/shared/src/adapters/supplierAdapter.ts`                   | UPDATE | Add `getOrderDistributions` method                               |
| `packages/shared/src/adapters/violetAdapter.ts`                     | UPDATE | Implement `getOrderDistributions`                                |
| `packages/shared/src/utils/orderPersistence.ts`                     | UPDATE | Pass `commission_rate` when inserting bags                       |
| `packages/shared/src/clients/admin.ts`                              | UPDATE | Add `getOrderDistributions` query                                |
| `packages/shared/src/clients/index.ts`                              | UPDATE | Export `getOrderDistributions`                                   |
| `apps/web/src/server/checkout.ts`                                   | UPDATE | Pass `commissionRate` in `persistAndConfirmOrderFn`              |
| `apps/web/src/server/distributions.ts`                              | CREATE | `syncOrderDistributionsFn` server function                       |
| `apps/web/src/components/admin/DistributionsTable.tsx`              | CREATE | Per-order distributions component                                |
| `apps/web/src/routes/admin/index.tsx`                               | UPDATE | Add distributions section + sync button                          |
| `apps/web/src/styles/pages/admin.css`                               | UPDATE | BEM styles for `.distributions-table`                            |
| `docs/go-live-checklist.md`                                         | CREATE | Production go-live checklist                                     |

---

## Task 1: Fix `.env.example` files (M1)

**Files:**

- Modify: `.env.example`
- Modify: `supabase/.env.example`

- [ ] **Step 1: Add missing Stripe vars to `.env.example`**

Open `.env.example`. After the existing Stripe block:

```
# ─── Stripe (Payments) ──────────────────────────────────────────────────────
# Client-side (browser + mobile)
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_key
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_key
```

Add after:

```
# Server-side only (Server Functions + Edge Functions)
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
```

- [ ] **Step 2: Add `STRIPE_SECRET_KEY` to `supabase/.env.example`**

Open `supabase/.env.example`. Add after any existing Stripe line (or create new section):

```
# ─── Stripe ─────────────────────────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
```

- [ ] **Step 3: Commit**

```bash
git add .env.example supabase/.env.example
git commit -m "chore: add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to env examples

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Add `commission_rate` to `order_bags` (M2)

**Files:**

- Create: `supabase/migrations/20260330000000_order_bags_commission_rate.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260330000000_order_bags_commission_rate.sql`:

```sql
-- M2: Add commission_rate to order_bags
--
-- Stores the Violet commission rate at time of order (snapshot).
-- DEFAULT 10.0 covers existing rows for backwards compatibility.
-- Future rows will receive the real rate from Violet's API response.

ALTER TABLE order_bags
  ADD COLUMN commission_rate NUMERIC(5,2) NOT NULL DEFAULT 10.0;

COMMENT ON COLUMN order_bags.commission_rate IS
  'Commission rate (%) from Violet at time of order. Snapshot — not updated retroactively.';
```

- [ ] **Step 2: Apply the migration locally**

```bash
supabase db reset
```

Expected: migration applies without error. Verify:

```bash
supabase db diff
```

Expected: no diff (all migrations applied).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260330000000_order_bags_commission_rate.sql
git commit -m "feat(db): add commission_rate column to order_bags

Snapshots the Violet commission rate per bag at order time.
DEFAULT 10.0 preserves backward compatibility for existing rows.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Fix materialized views to use real commission rates (M2)

**Files:**

- Create: `supabase/migrations/20260330000001_fix_commission_views.sql`

- [ ] **Step 1: Write the patch migration**

Create `supabase/migrations/20260330000001_fix_commission_views.sql`:

```sql
-- M2: Fix commission views to use real per-bag commission_rate
-- Replaces the hardcoded 10.0 with per-bag rates from order_bags.commission_rate.

-- ── Drop and recreate mv_commission_summary ──────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS public.mv_commission_summary;

CREATE MATERIALIZED VIEW public.mv_commission_summary AS
SELECT
  ob.merchant_name,
  COUNT(DISTINCT ob.id) AS bag_count,
  COALESCE(SUM(ob.subtotal), 0) AS gross_subtotal_cents,
  COALESCE(SUM(public.estimate_commission(ob.subtotal, ob.commission_rate)), 0) AS commission_estimate_cents,
  AVG(ob.commission_rate) AS commission_rate_pct,
  now() AS refreshed_at
FROM order_bags ob
JOIN orders o ON ob.order_id = o.id
WHERE o.status NOT IN ('CANCELED', 'REJECTED')
  AND ob.financial_status IN ('PAID', 'PARTIALLY_PAID')
GROUP BY ob.merchant_name;

-- Unique index required for CONCURRENTLY refresh
CREATE UNIQUE INDEX idx_mv_commission_summary_merchant
  ON public.mv_commission_summary (merchant_name);

-- Restore access control (same as original migration)
ALTER MATERIALIZED VIEW public.mv_commission_summary OWNER TO postgres;
REVOKE SELECT ON public.mv_commission_summary FROM PUBLIC;
REVOKE SELECT ON public.mv_commission_summary FROM authenticated;
REVOKE SELECT ON public.mv_commission_summary FROM anon;

-- ── Fix fn_dashboard_metrics_by_range ────────────────────────────────────────
-- Replace the implicit DEFAULT 10.0 with per-bag commission_rate.
CREATE OR REPLACE FUNCTION public.fn_dashboard_metrics_by_range(
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
) AS $$
DECLARE
  v_total_orders BIGINT;
  v_gross_revenue BIGINT;
  v_commission BIGINT;
  v_active_users BIGINT;
  v_total_visitors BIGINT;
  v_search_users BIGINT;
BEGIN
  SELECT
    COUNT(DISTINCT o.id),
    COALESCE(SUM(o.total), 0),
    COALESCE(SUM(public.estimate_commission(ob.subtotal, ob.commission_rate)), 0)
  INTO v_total_orders, v_gross_revenue, v_commission
  FROM orders o
  LEFT JOIN order_bags ob ON ob.order_id = o.id
  WHERE o.created_at BETWEEN p_start AND p_end
    AND o.status NOT IN ('CANCELED', 'REJECTED');

  SELECT COUNT(DISTINCT user_id)
  INTO v_active_users
  FROM public.user_events
  WHERE created_at BETWEEN p_start AND p_end;

  v_total_visitors := v_active_users;

  SELECT COUNT(DISTINCT user_id)
  INTO v_search_users
  FROM public.user_events
  WHERE event_type = 'search'
    AND created_at BETWEEN p_start AND p_end;

  RETURN QUERY SELECT
    v_total_orders,
    v_gross_revenue,
    v_commission,
    v_active_users,
    v_total_visitors,
    CASE WHEN v_total_visitors > 0
      THEN ROUND(v_total_orders::NUMERIC / v_total_visitors * 100, 1)
      ELSE 0.0
    END,
    CASE WHEN v_active_users > 0
      THEN ROUND(v_search_users::NUMERIC / v_active_users * 100, 1)
      ELSE 0.0
    END;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Restore access restrictions
REVOKE EXECUTE ON FUNCTION public.fn_dashboard_metrics_by_range(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_dashboard_metrics_by_range(TIMESTAMPTZ, TIMESTAMPTZ) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_dashboard_metrics_by_range(TIMESTAMPTZ, TIMESTAMPTZ) FROM anon;
```

- [ ] **Step 2: Apply migration**

```bash
supabase db reset
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260330000001_fix_commission_views.sql
git commit -m "feat(db): fix commission views to use real per-bag commission_rate

mv_commission_summary and fn_dashboard_metrics_by_range now use
order_bags.commission_rate instead of hardcoded 10.0.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Add `commissionRate` to shared types (M2)

**Files:**

- Modify: `packages/shared/src/types/order.types.ts`
- Modify: `packages/shared/src/types/orderPersistence.types.ts`

- [ ] **Step 1: Add `commissionRate` to `OrderBag`**

In `packages/shared/src/types/order.types.ts`, find `interface OrderBag` (around line 228) and add after `total`:

```typescript
export interface OrderBag {
  id: string;
  merchantName: string;
  status: BagStatus;
  financialStatus: BagFinancialStatus;
  items: OrderBagItem[];
  subtotal: number;
  shippingTotal: number;
  taxTotal: number;
  total: number;
  /** Commission rate (%) Violet applies to this bag's subtotal. */
  commissionRate: number;
  shippingMethod?: { carrier: string; label: string };
}
```

- [ ] **Step 2: Add `commissionRate` to `PersistOrderBagInput`**

In `packages/shared/src/types/orderPersistence.types.ts`, find `interface PersistOrderBagInput` (around line 221) and add `commissionRate` after `carrier`:

```typescript
export interface PersistOrderBagInput {
  violetBagId: string;
  merchantName: string;
  status: string;
  financialStatus: string;
  subtotal: number;
  shippingTotal: number;
  taxTotal: number;
  total: number;
  shippingMethod?: string;
  carrier?: string;
  /** Commission rate (%) from Violet — snapshotted at order time. */
  commissionRate: number;
  items: PersistOrderItemInput[];
}
```

- [ ] **Step 3: Add `commission_rate` to `OrderBagRow`**

In the same file, find `interface OrderBagRow` (around line 83) and add after `carrier`:

```typescript
/** Commission rate (%) snapshotted from Violet at order time */
commission_rate: number;
```

- [ ] **Step 4: Run typecheck**

```bash
bun run typecheck
```

Expected: errors in `violetAdapter.ts`, `orderPersistence.ts`, and `checkout.ts` because the new required fields are not yet set. That's expected — we fix them in the next tasks.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/types/order.types.ts packages/shared/src/types/orderPersistence.types.ts
git commit -m "feat(types): add commissionRate to OrderBag and PersistOrderBagInput

Adds commission rate snapshot fields to shared types.
Downstream compile errors expected — fixed in following commits.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Map `commission_rate` from Violet API response (M2)

**Files:**

- Modify: `packages/shared/src/adapters/violetAdapter.ts`

- [ ] **Step 1: Find where bags are mapped in VioletAdapter**

In `packages/shared/src/adapters/violetAdapter.ts`, search for `merchantName` or `financialStatus` in bag mapping. The `getOrder` method maps Violet bags to `OrderBag`. Find where `OrderBag` objects are constructed.

- [ ] **Step 2: Add `commissionRate` to the bag mapping**

In the bag mapping for `getOrder`, `VioletBag` already has `commission_rate?: number` in `violet.types.ts`. Add the mapping:

```typescript
commissionRate: bag.commission_rate ?? 10,
```

The `?? 10` fallback covers the case where Violet doesn't return the field (e.g., for older sandbox orders).

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: `orderPersistence.ts` and `checkout.ts` still error (not yet passing `commissionRate`). `violetAdapter.ts` should be clean.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/adapters/violetAdapter.ts
git commit -m "feat(adapter): map commission_rate from Violet bag to OrderBag.commissionRate

Falls back to 10 if Violet omits the field (sandbox compatibility).

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Pass `commissionRate` through persistence layer (M2)

**Files:**

- Modify: `packages/shared/src/utils/orderPersistence.ts`
- Modify: `apps/web/src/server/checkout.ts`

- [ ] **Step 1: Add `commission_rate` to the `order_bags` INSERT in `orderPersistence.ts`**

In `packages/shared/src/utils/orderPersistence.ts`, find the bag INSERT block (around line 75). Change it to:

```typescript
const { data: bagRow, error: bagError } = await supabase
  .from("order_bags")
  .insert({
    order_id: orderRow.id,
    violet_bag_id: bag.violetBagId,
    merchant_name: bag.merchantName,
    status: bag.status,
    financial_status: bag.financialStatus,
    subtotal: bag.subtotal,
    shipping_total: bag.shippingTotal,
    tax_total: bag.taxTotal,
    total: bag.total,
    shipping_method: bag.shippingMethod ?? null,
    carrier: bag.carrier ?? null,
    commission_rate: bag.commissionRate,
  })
  .select("id")
  .single();
```

- [ ] **Step 2: Pass `commissionRate` in `persistAndConfirmOrderFn`**

In `apps/web/src/server/checkout.ts`, find the `bags.map` inside `persistAndConfirmOrderFn` (around line 498). Add `commissionRate`:

```typescript
bags: orderResult.data.bags.map((bag) => ({
  violetBagId: bag.id,
  merchantName: bag.merchantName,
  status: bag.status,
  financialStatus: bag.financialStatus,
  subtotal: bag.subtotal,
  shippingTotal: bag.shippingTotal,
  taxTotal: bag.taxTotal,
  total: bag.total,
  shippingMethod: bag.shippingMethod?.label,
  carrier: bag.shippingMethod?.carrier,
  commissionRate: bag.commissionRate,
  items: bag.items.map((item) => ({
    skuId: item.skuId,
    name: item.name,
    quantity: item.quantity,
    price: item.price,
    linePrice: item.linePrice,
    thumbnail: item.thumbnail,
  })),
})),
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 4: Run existing tests**

```bash
bun --cwd=apps/web run test
bun --cwd=packages/shared run test
```

Expected: all pass (no changes to test logic).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/utils/orderPersistence.ts apps/web/src/server/checkout.ts
git commit -m "feat: persist real commission_rate from Violet into order_bags

commission_rate is now snapshotted at order time, ending the hardcoded 10%.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Create `order_distributions` table (M3)

**Files:**

- Create: `supabase/migrations/20260330000002_order_distributions.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260330000002_order_distributions.sql`:

```sql
-- M3: Order distributions — Violet's payment breakdown per order bag
--
-- Populated on-demand via GET /v1/orders/{id}/distributions (no Violet webhook).
-- The UNIQUE constraint on (violet_order_id, type, violet_bag_id) makes syncs
-- idempotent — same pattern as webhook_events.event_id.
--
-- Amounts are integer cents, matching Violet's format.

CREATE TABLE order_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_bag_id UUID NOT NULL REFERENCES order_bags(id) ON DELETE CASCADE,
  violet_order_id TEXT NOT NULL,
  violet_bag_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('PAYMENT', 'REFUND', 'ADJUSTMENT')),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'QUEUED', 'SENT', 'FAILED')),
  channel_amount_cents INTEGER NOT NULL DEFAULT 0,
  stripe_fee_cents INTEGER NOT NULL DEFAULT 0,
  merchant_amount_cents INTEGER NOT NULL DEFAULT 0,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (violet_order_id, type, violet_bag_id)
);

CREATE INDEX idx_order_distributions_order_bag ON order_distributions (order_bag_id);
CREATE INDEX idx_order_distributions_violet_order ON order_distributions (violet_order_id);

COMMENT ON TABLE order_distributions IS
  'Violet payment distributions per order bag. Synced on-demand via Violet Distributions API.';

-- RLS: only service_role can access (same as materialized views)
ALTER TABLE order_distributions ENABLE ROW LEVEL SECURITY;
-- No policies needed — service_role bypasses RLS by default
```

- [ ] **Step 2: Apply migration**

```bash
supabase db reset
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260330000002_order_distributions.sql
git commit -m "feat(db): add order_distributions table for Violet payment breakdowns

Stores per-bag channel commission, Stripe fees, and merchant payout amounts.
UNIQUE constraint on (violet_order_id, type, violet_bag_id) ensures idempotent syncs.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Create `Distribution` types (M3)

**Files:**

- Create: `packages/shared/src/types/distribution.types.ts`
- Modify: `packages/shared/src/types/index.ts`

- [ ] **Step 1: Create the types file**

Create `packages/shared/src/types/distribution.types.ts`:

```typescript
/**
 * Violet distribution types — payment breakdown per order bag.
 *
 * A Distribution records exactly how funds were split for one bag:
 * - `channelAmountCents`: our commission (before Stripe fees)
 * - `stripFeeCents`: Stripe's cut (always deducted from channel share)
 * - `merchantAmountCents`: what the merchant received
 *
 * @see https://docs.violet.io/prism/payments/payouts/distributions
 */

export type DistributionType = "PAYMENT" | "REFUND" | "ADJUSTMENT";
export type DistributionStatus = "PENDING" | "QUEUED" | "SENT" | "FAILED";

/** Distribution as returned by the Violet API (camelCase internal type). */
export interface Distribution {
  /** Violet bag ID this distribution belongs to */
  violetBagId: string | null;
  type: DistributionType;
  status: DistributionStatus;
  /** Channel commission before Stripe fees, in integer cents */
  channelAmountCents: number;
  /** Stripe processing fees deducted from channel share, in integer cents */
  stripeFee: number;
  /** Amount transferred to merchant, in integer cents */
  merchantAmountCents: number;
  /** Bag subtotal this distribution was calculated from, in integer cents */
  subtotalCents: number;
}

/** Supabase row type for the `order_distributions` table. */
export interface DistributionRow {
  id: string;
  order_bag_id: string;
  violet_order_id: string;
  violet_bag_id: string | null;
  type: DistributionType;
  status: DistributionStatus;
  channel_amount_cents: number;
  stripe_fee_cents: number;
  merchant_amount_cents: number;
  subtotal_cents: number;
  synced_at: string;
}
```

- [ ] **Step 2: Export from `packages/shared/src/types/index.ts`**

Find the export block in `packages/shared/src/types/index.ts` and add:

```typescript
export type {
  Distribution,
  DistributionRow,
  DistributionType,
  DistributionStatus,
} from "./distribution.types.js";
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/distribution.types.ts packages/shared/src/types/index.ts
git commit -m "feat(types): add Distribution and DistributionRow types for Violet payout data

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Add `getOrderDistributions` to SupplierAdapter + VioletAdapter (M3)

**Files:**

- Modify: `packages/shared/src/adapters/supplierAdapter.ts`
- Modify: `packages/shared/src/adapters/violetAdapter.ts`

- [ ] **Step 1: Add method to `SupplierAdapter` interface**

In `packages/shared/src/adapters/supplierAdapter.ts`, add after `getOrder`:

```typescript
/**
 * Fetches payment distributions for a Violet order.
 *
 * Returns per-bag breakdown of channel commission, Stripe fees, and merchant payout.
 * No Violet webhook exists for distributions — must be fetched on-demand.
 *
 * @see https://docs.violet.io/prism/payments/payouts/distributions
 */
getOrderDistributions(violetOrderId: string): Promise<ApiResponse<Distribution[]>>;
```

Also add the import at the top of the file:

```typescript
import type { ..., Distribution } from "../types/index.js";
```

- [ ] **Step 2: Implement in `VioletAdapter`**

In `packages/shared/src/adapters/violetAdapter.ts`, add the implementation. Find the section with `getOrder` and add after it:

```typescript
async getOrderDistributions(violetOrderId: string): Promise<ApiResponse<Distribution[]>> {
  const token = await this.tokenManager.getToken();
  const response = await fetch(
    `${this.baseUrl}/orders/${violetOrderId}/distributions`,
    {
      headers: {
        "X-Violet-Token": token,
        "X-Violet-App-Id": this.appId,
        "X-Violet-App-Secret": this.appSecret,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    return {
      data: null,
      error: { code: String(response.status), message: `Distributions fetch failed: ${response.statusText}` },
    };
  }

  const raw = await response.json();
  // Violet returns an array of distribution objects
  const items: unknown[] = Array.isArray(raw) ? raw : (raw.content ?? []);

  const distributions: Distribution[] = items.map((item: unknown) => {
    const d = item as Record<string, unknown>;
    return {
      violetBagId: d["bag_id"] != null ? String(d["bag_id"]) : null,
      type: (d["type"] as DistributionType) ?? "PAYMENT",
      status: (d["status"] as DistributionStatus) ?? "PENDING",
      channelAmountCents: Number(d["channel_amount"] ?? 0),
      stripeFee: Number(d["stripe_fee"] ?? 0),
      merchantAmountCents: Number(d["merchant_amount"] ?? 0),
      subtotalCents: Number(d["subtotal"] ?? 0),
    };
  });

  return { data: distributions, error: null };
}
```

Also add the import for the types used:

```typescript
import type { ..., Distribution, DistributionType, DistributionStatus } from "../types/index.js";
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/adapters/supplierAdapter.ts packages/shared/src/adapters/violetAdapter.ts
git commit -m "feat(adapter): add getOrderDistributions to SupplierAdapter + VioletAdapter

Fetches Violet payment distributions on-demand via GET /orders/{id}/distributions.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 10: Add `getOrderDistributions` Supabase client (M3)

**Files:**

- Modify: `packages/shared/src/clients/admin.ts`
- Modify: `packages/shared/src/clients/index.ts`

- [ ] **Step 1: Add the query function to `admin.ts`**

In `packages/shared/src/clients/admin.ts`, add after the existing exports:

```typescript
/**
 * Fetches persisted distributions for a Violet order from Supabase.
 *
 * Returns all distribution rows joined with bag info, ordered by type.
 * Returns empty array if no distributions have been synced yet.
 *
 * @param violetOrderId - Violet's numeric order ID (as string)
 */
export async function getOrderDistributions(
  supabase: SupabaseClient,
  violetOrderId: string,
): Promise<ApiResponse<DistributionRow[]>> {
  const { data, error } = await supabase
    .from("order_distributions")
    .select("*")
    .eq("violet_order_id", violetOrderId)
    .order("type");

  if (error) {
    return { data: null, error: { code: error.code, message: error.message } };
  }

  return { data: data as DistributionRow[], error: null };
}
```

Add the import at the top of `admin.ts`:

```typescript
import type { DistributionRow } from "../types/index.js";
```

- [ ] **Step 2: Export from `clients/index.ts`**

In `packages/shared/src/clients/index.ts`, add:

```typescript
export { getOrderDistributions } from "./admin.js";
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/clients/admin.ts packages/shared/src/clients/index.ts
git commit -m "feat(client): add getOrderDistributions Supabase query

Fetches persisted distribution rows for a given Violet order ID.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 11: Create `syncOrderDistributionsFn` server function (M3)

**Files:**

- Create: `apps/web/src/server/distributions.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/distributions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the server function infrastructure — we test the handler logic
vi.mock("@tanstack/react-start/server", () => ({
  createServerFn: () => ({
    inputValidator: (fn: unknown) => ({ handler: (h: unknown) => ({ _fn: fn, _handler: h }) }),
  }),
}));

describe("syncOrderDistributions", () => {
  it("returns error when violetOrderId is missing", async () => {
    // Input validation test — zod schema requires non-empty string
    const { z } = await import("zod");
    const schema = z.object({ violetOrderId: z.string().min(1) });
    expect(() => schema.parse({ violetOrderId: "" })).toThrow();
    expect(() => schema.parse({ violetOrderId: "12345" })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to confirm it passes (schema validation test)**

```bash
bun --cwd=apps/web run test distributions
```

Expected: PASS.

- [ ] **Step 3: Create the server function**

Create `apps/web/src/server/distributions.ts`:

```typescript
import { createServerFn } from "@tanstack/react-start/server";
import { z } from "zod";
import { getAdapter } from "./adapter";
import { getSupabaseServer } from "./supabase";
import type { ApiResponse } from "@ecommerce/shared";
import type { DistributionRow } from "@ecommerce/shared";

/**
 * Syncs Violet distributions for an order into Supabase.
 *
 * Fetches from Violet's GET /orders/{id}/distributions and upserts into
 * order_distributions. Idempotent — safe to call multiple times.
 *
 * ## Why upsert (not insert)?
 * Violet may update distribution status over time (PENDING → SENT).
 * Upserting on the UNIQUE constraint ensures we always have current status.
 */
export const syncOrderDistributionsFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const schema = z.object({
      violetOrderId: z.string().min(1),
    });
    return schema.parse(input);
  })
  .handler(async ({ data }): Promise<ApiResponse<DistributionRow[]>> => {
    const adapter = getAdapter();
    const supabase = getSupabaseServer();

    // Fetch distributions from Violet
    const distResult = await adapter.getOrderDistributions(data.violetOrderId);
    if (distResult.error) {
      return { data: null, error: distResult.error };
    }

    if (distResult.data.length === 0) {
      return { data: [], error: null };
    }

    // Resolve order_bag_id for each distribution via violet_bag_id
    const bagIds = [...new Set(distResult.data.map((d) => d.violetBagId).filter(Boolean))];

    const { data: bagRows, error: bagError } = await supabase
      .from("order_bags")
      .select("id, violet_bag_id")
      .in("violet_bag_id", bagIds.length > 0 ? bagIds : ["__none__"]);

    if (bagError) {
      return { data: null, error: { code: bagError.code, message: bagError.message } };
    }

    const bagMap = new Map((bagRows ?? []).map((b) => [b.violet_bag_id, b.id]));

    // Build upsert rows — skip distributions with no matching bag
    const rows = distResult.data
      .map((d) => {
        const orderBagId = d.violetBagId ? bagMap.get(d.violetBagId) : null;
        if (!orderBagId) return null;
        return {
          order_bag_id: orderBagId,
          violet_order_id: data.violetOrderId,
          violet_bag_id: d.violetBagId,
          type: d.type,
          status: d.status,
          channel_amount_cents: d.channelAmountCents,
          stripe_fee_cents: d.stripeFee,
          merchant_amount_cents: d.merchantAmountCents,
          subtotal_cents: d.subtotalCents,
          synced_at: new Date().toISOString(),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length === 0) {
      return { data: [], error: null };
    }

    const { data: upserted, error: upsertError } = await supabase
      .from("order_distributions")
      .upsert(rows, { onConflict: "violet_order_id,type,violet_bag_id" })
      .select();

    if (upsertError) {
      return { data: null, error: { code: upsertError.code, message: upsertError.message } };
    }

    return { data: upserted as DistributionRow[], error: null };
  });
```

- [ ] **Step 4: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/distributions.ts apps/web/src/__tests__/distributions.test.ts
git commit -m "feat: add syncOrderDistributionsFn server function

Fetches Violet distributions and upserts into order_distributions.
Idempotent via UNIQUE constraint on (violet_order_id, type, violet_bag_id).

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 12: Create `DistributionsTable` component (M3)

**Files:**

- Create: `apps/web/src/components/admin/DistributionsTable.tsx`
- Modify: `apps/web/src/styles/pages/admin.css`

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/admin/DistributionsTable.tsx`:

```tsx
import { formatPrice } from "@ecommerce/shared";
import type { DistributionRow } from "@ecommerce/shared";

interface DistributionsTableProps {
  distributions: DistributionRow[];
  violetOrderId: string;
  onSync: (violetOrderId: string) => void;
  isSyncing: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  QUEUED: "Queued",
  SENT: "Sent",
  FAILED: "Failed",
};

const TYPE_LABELS: Record<string, string> = {
  PAYMENT: "Payment",
  REFUND: "Refund",
  ADJUSTMENT: "Adjustment",
};

export default function DistributionsTable({
  distributions,
  violetOrderId,
  onSync,
  isSyncing,
}: DistributionsTableProps) {
  return (
    <div className="distributions-table">
      <div className="distributions-table__header">
        <h3 className="distributions-table__title">Distributions — Order {violetOrderId}</h3>
        <button
          className="distributions-table__sync-btn"
          onClick={() => onSync(violetOrderId)}
          disabled={isSyncing}
        >
          {isSyncing ? "Syncing…" : "Sync from Violet"}
        </button>
      </div>

      {distributions.length === 0 ? (
        <p className="distributions-table__empty">
          No distributions synced yet. Click "Sync from Violet" to fetch.
        </p>
      ) : (
        <table className="distributions-table__table">
          <thead>
            <tr>
              <th scope="col">Type</th>
              <th scope="col">Status</th>
              <th scope="col">Channel (gross)</th>
              <th scope="col">Stripe fee</th>
              <th scope="col">Channel (net)</th>
              <th scope="col">Merchant</th>
            </tr>
          </thead>
          <tbody>
            {distributions.map((d) => {
              const netChannel = d.channel_amount_cents - d.stripe_fee_cents;
              return (
                <tr
                  key={d.id}
                  className={`distributions-table__row distributions-table__row--${d.status.toLowerCase()}`}
                >
                  <td>{TYPE_LABELS[d.type] ?? d.type}</td>
                  <td>
                    <span
                      className={`distributions-table__status distributions-table__status--${d.status.toLowerCase()}`}
                    >
                      {STATUS_LABELS[d.status] ?? d.status}
                    </span>
                  </td>
                  <td>{formatPrice(d.channel_amount_cents)}</td>
                  <td className="distributions-table__fee">−{formatPrice(d.stripe_fee_cents)}</td>
                  <td className="distributions-table__net">{formatPrice(netChannel)}</td>
                  <td>{formatPrice(d.merchant_amount_cents)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add BEM styles**

In `apps/web/src/styles/pages/admin.css`, append:

```css
/* ── Distributions Table ─────────────────────────────────────────────────── */
.distributions-table {
  margin-top: var(--space-6);
}

.distributions-table__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
}

.distributions-table__title {
  font-size: var(--text-sm);
  font-weight: 600;
}

.distributions-table__sync-btn {
  font-size: var(--text-xs);
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
}

.distributions-table__sync-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.distributions-table__empty {
  font-size: var(--text-sm);
  color: var(--color-muted);
}

.distributions-table__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.distributions-table__table th,
.distributions-table__table td {
  padding: var(--space-2) var(--space-3);
  text-align: left;
  border-bottom: 1px solid var(--color-border);
}

.distributions-table__status {
  display: inline-block;
  padding: 2px var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  font-weight: 500;
}

.distributions-table__status--sent {
  background: color-mix(in srgb, var(--color-success) 15%, transparent);
  color: var(--color-success);
}

.distributions-table__status--pending,
.distributions-table__status--queued {
  background: color-mix(in srgb, var(--color-warning) 15%, transparent);
  color: var(--color-warning);
}

.distributions-table__status--failed {
  background: color-mix(in srgb, var(--color-error) 15%, transparent);
  color: var(--color-error);
}

.distributions-table__fee {
  color: var(--color-muted);
}

.distributions-table__net {
  font-weight: 600;
}
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/admin/DistributionsTable.tsx apps/web/src/styles/pages/admin.css
git commit -m "feat(ui): add DistributionsTable component for admin dashboard

Shows per-order Violet distribution breakdown: channel gross/net, Stripe fees, merchant payout.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 13: Wire distributions into admin dashboard (M3)

**Files:**

- Modify: `apps/web/src/routes/admin/index.tsx`

- [ ] **Step 1: Read the current admin route to understand state structure**

```bash
head -60 apps/web/src/routes/admin/index.tsx
```

- [ ] **Step 2: Add distributions state and sync handler**

In `apps/web/src/routes/admin/index.tsx`:

1. Add the import for the new function and component at the top:

```typescript
import { syncOrderDistributionsFn } from "../../server/distributions";
import DistributionsTable from "../../components/admin/DistributionsTable";
import type { DistributionRow } from "@ecommerce/shared";
```

2. Inside the component, add state for distributions and syncing:

```typescript
const [distributions, setDistributions] = useState<DistributionRow[]>([]);
const [syncingOrderId, setSyncingOrderId] = useState<string | null>(null);
const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
```

3. Add the sync handler:

```typescript
async function handleSyncDistributions(violetOrderId: string) {
  setSyncingOrderId(violetOrderId);
  setSelectedOrderId(violetOrderId);
  const result = await syncOrderDistributionsFn({ data: { violetOrderId } });
  if (result.data) {
    setDistributions(result.data);
  }
  setSyncingOrderId(null);
}
```

4. Add the `DistributionsTable` below `CommissionTable` in the JSX:

```tsx
{
  selectedOrderId && (
    <DistributionsTable
      distributions={distributions}
      violetOrderId={selectedOrderId}
      onSync={handleSyncDistributions}
      isSyncing={syncingOrderId === selectedOrderId}
    />
  );
}
```

5. To allow selecting an order, find where orders are listed (or add a temporary input for MVP):

```tsx
<div className="admin-dashboard__dist-input">
  <label htmlFor="dist-order-id">Check distributions for Violet order ID:</label>
  <input
    id="dist-order-id"
    type="text"
    placeholder="e.g. 123456"
    onBlur={(e) => {
      if (e.target.value) handleSyncDistributions(e.target.value);
    }}
  />
</div>
```

- [ ] **Step 3: Run typecheck and tests**

```bash
bun run typecheck
bun --cwd=apps/web run test
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/admin/index.tsx
git commit -m "feat(admin): wire DistributionsTable into admin dashboard

Admin can enter a Violet order ID to sync and view its distribution breakdown.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 14: Create go-live checklist (M4)

**Files:**

- Create: `docs/go-live-checklist.md`

- [ ] **Step 1: Create the checklist**

Create `docs/go-live-checklist.md`:

```markdown
# Go-Live Checklist — Maison Émile × Violet

This checklist must be fully checked before scheduling the Violet go-live demo.
Share this file with the Violet team at support@violet.io when booking.

## Stripe

- [ ] Stripe Platform account created at stripe.com
- [ ] Stripe Connect activated (Settings → Connect settings → Platform)
- [ ] KYC completed and approved by Stripe
- [ ] Stripe Platform account linked to Violet via channel.violet.io → App Settings → Payments
- [ ] Live publishable key (`pk_live_...`) added to production environment
- [ ] Live secret key (`sk_live_...`) added to production environment (server-side only)

## Violet Connect Configuration

- [ ] App name configured on channel.violet.io
- [ ] App logo uploaded
- [ ] Redirect URL set (post-merchant-onboarding landing page)
- [ ] At least one real merchant onboarded in Test Mode and verified end-to-end
- [ ] Commission rates configured per merchant on channel.violet.io

## Application Testing (Test Mode)

- [ ] Complete checkout flow tested: address → shipping → customer info → Stripe payment → confirmation
- [ ] 3DS challenge scenario tested (use Stripe test card `4000 0027 6000 3184`)
- [ ] Refund tested and commission correctly reversed
- [ ] Order confirmation page displays correct order details
- [ ] Admin dashboard: commission summary shows real rates (not 10% for all)
- [ ] Admin dashboard: distributions sync works for a completed test order

## Production Environment Variables

- [ ] `VIOLET_API_BASE=https://api.violet.io/v1` (not sandbox-api)
- [ ] `VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...`
- [ ] `STRIPE_SECRET_KEY=sk_live_...`
- [ ] `VIOLET_APP_ID` and `VIOLET_APP_SECRET` updated to Live Mode credentials

## Pre-Demo

- [ ] Run full checkout flow in production environment with a real card (small test amount)
- [ ] Confirm distribution appears in admin dashboard after order
- [ ] Book go-live demo with Violet: support@violet.io
```

- [ ] **Step 2: Commit**

```bash
git add docs/go-live-checklist.md
git commit -m "docs: add go-live checklist for Violet production activation

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Self-Review

### Spec coverage check

| Spec requirement                                                      | Task    |
| --------------------------------------------------------------------- | ------- |
| M1: `.env.example` — add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Task 1  |
| M2: `commission_rate` column on `order_bags`                          | Task 2  |
| M2: Fix `mv_commission_summary` and `fn_dashboard_metrics_by_range`   | Task 3  |
| M2: `commissionRate` in shared types                                  | Task 4  |
| M2: Map from VioletAdapter                                            | Task 5  |
| M2: Persist in `orderPersistence.ts` + `checkout.ts`                  | Task 6  |
| M3: `order_distributions` table                                       | Task 7  |
| M3: `Distribution` + `DistributionRow` types                          | Task 8  |
| M3: `getOrderDistributions` in SupplierAdapter + VioletAdapter        | Task 9  |
| M3: Supabase client query                                             | Task 10 |
| M3: `syncOrderDistributionsFn` server function                        | Task 11 |
| M3: `DistributionsTable` component                                    | Task 12 |
| M3: Admin dashboard integration                                       | Task 13 |
| M4: `docs/go-live-checklist.md`                                       | Task 14 |

All spec requirements covered. ✅

### Type consistency check

- `Distribution.stripeFee` used in Task 8 → referenced as `d.stripeFee` in Task 11 ✅
- `DistributionRow.stripe_fee_cents` used in Task 8 → referenced in Task 12 as `d.stripe_fee_cents` ✅
- `PersistOrderBagInput.commissionRate` added in Task 4 → passed in Task 6 ✅
- `OrderBag.commissionRate` added in Task 4 → mapped in Task 5 → consumed in Task 6 ✅
