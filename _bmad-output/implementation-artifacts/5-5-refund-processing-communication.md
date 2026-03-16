# Story 5.5: Refund Processing & Communication (Web + Mobile)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Quick Reference — Files to Create/Update

| Action | File | Notes |
| ------ | ---- | ----- |
| CREATE | `supabase/migrations/20260321000000_order_refunds.sql` | `order_refunds` table + RLS + Realtime |
| UPDATE | `supabase/functions/handle-webhook/orderProcessors.ts` | Replace `processBagRefunded` stub with full implementation: fetch Violet refund details + upsert `order_refunds` + invoke `send-notification` |
| UPDATE | `packages/shared/src/types/orderPersistence.types.ts` | Add `OrderRefundRow` interface |
| UPDATE | `packages/shared/src/hooks/useOrders.ts` | Update `OrderBagWithItems` type + join `order_refunds(*)` in detail query |
| UPDATE | `apps/web/src/server/orderHandlers.ts` | Add `order_refunds(*)` to `orderDetailHandler` Supabase select |
| UPDATE | `apps/web/src/routes/account/orders/$orderId.tsx` | `BagCard`: show refund info; pricing section: annotate totals |
| UPDATE | `apps/web/src/routes/order/lookup.tsx` | Show refund info in guest order detail step |
| UPDATE | `apps/mobile/src/app/order/lookup.tsx` | Show refund info in mobile guest order detail |
| UPDATE | `apps/web/src/styles/pages/orders.css` | Add `.order-detail__refund*` CSS classes |
| UPDATE | `apps/web/src/server/__tests__/orders.test.ts` | Tests for `orderDetailHandler` with refund data |

---

## Story

As a **buyer**,
I want to see refund status clearly when a merchant processes a refund,
so that I know when to expect my money back.

## Acceptance Criteria

1. **Given** a Violet `BAG_REFUNDED` webhook is received
   **When** the webhook is processed
   **Then** the corresponding `order_bag` row status is updated to `REFUNDED`
   **And** `financial_status` is updated (e.g., `REFUNDED` or `PARTIALLY_REFUNDED`)
   **And** the Violet refund details API is called: `GET /v1/orders/{violet_order_id}/bags/{violet_bag_id}/refunds`
   **And** refund details (amount, reason) are stored in the `order_refunds` table (upsert on `violet_refund_id` for idempotency)
   **And** the `supabase/functions/send-notification` Edge Function is invoked (fire-and-forget) with `{ type: "refund_processed", bag_id, order_id }` — if the function is not yet deployed (Story 5.6), the invocation fails silently with a `console.warn`

2. **Given** a `supabase/migrations/20260321000000_order_refunds.sql` migration
   **When** applied
   **Then** the `order_refunds` table is created with: `id` (UUID PK), `order_bag_id` (UUID FK → `order_bags`), `violet_refund_id` (TEXT UNIQUE), `amount` (INTEGER cents), `reason` (TEXT nullable), `currency` (TEXT default USD), `status` (TEXT), `created_at`
   **And** RLS is enabled: authenticated users read their own bag refunds; service_role has full access
   **And** `order_refunds` is added to the `supabase_realtime` publication

3. **Given** the order detail view (web `/account/orders/:orderId`)
   **When** a bag has REFUNDED status and `order_refunds` rows exist
   **Then** a refund notice is displayed inside the bag card: "Refund of $X.XX processed"
   **And** if a `reason` is available: it appears below the amount as a secondary note
   **And** the pricing section shows a "Total refunded" annotation: `— Refund: $X.XX` next to the bag total
   **And** the `CANCELED` bags without refund continue to show "Canceled" status without any refund notice

4. **Given** the guest order lookup (web `/order/lookup` and mobile `/order/lookup`)
   **When** a fetched order contains a refunded bag with `order_refunds` data
   **Then** the same refund info is shown inline (same BEM markup as the authenticated detail)

5. **Given** `OrderBagWithItems` type
   **When** updated to include `order_refunds: OrderRefundRow[]`
   **Then** all existing consumers of `OrderBagWithItems` (web detail, lookup, mobile lookup) compile without error
   **And** the Supabase query in `orderDetailHandler` includes `order_refunds(*)` in the select

6. **Given** `order_refunds` is in the `supabase_realtime` publication
   **When** a refund is stored in the DB by the webhook processor
   **Then** connected clients receive the update via Supabase Realtime and re-fetch the order (existing `useOrderRealtime` subscription + query invalidation covers this)

## Tasks / Subtasks

- [x] **Task 1: Database migration** — `supabase/migrations/20260321000000_order_refunds.sql` (AC: #2)
  - [x] 1.1: Create `order_refunds` table:
    ```sql
    CREATE TABLE order_refunds (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_bag_id UUID NOT NULL REFERENCES order_bags(id) ON DELETE CASCADE,
      violet_refund_id TEXT NOT NULL UNIQUE,
      amount INTEGER NOT NULL,
      reason TEXT,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT 'PROCESSED',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_order_refunds_order_bag_id ON order_refunds(order_bag_id);
    ```
  - [x] 1.2: Enable RLS:
    ```sql
    ALTER TABLE order_refunds ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "service_role_all_order_refunds" ON order_refunds
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    CREATE POLICY "users_read_own_order_refunds" ON order_refunds
      FOR SELECT TO authenticated
      USING (order_bag_id IN (
        SELECT ob.id FROM order_bags ob
        JOIN orders o ON ob.order_id = o.id
        WHERE o.user_id = auth.uid()
      ));
    ```
  - [x] 1.3: Enable Realtime:
    ```sql
    ALTER PUBLICATION supabase_realtime ADD TABLE order_refunds;
    ```

- [x] **Task 2: Extend webhook processor** — `supabase/functions/handle-webhook/orderProcessors.ts` (AC: #1)
  - [x] 2.1: Add import of `getVioletHeaders` at the top of the file:
    ```typescript
    import { getVioletHeaders } from "../_shared/violetAuth.ts";
    ```
  - [x] 2.2: Replace the `processBagRefunded = processBagUpdated` stub at the bottom with a real function:
    ```typescript
    export async function processBagRefunded(
      supabase: SupabaseClient,
      eventId: string,
      payload: VioletBagPayload,
    ): Promise<void> {
      try {
        // Step 1: Update bag status (same as processBagUpdated)
        const updateData: Record<string, unknown> = { status: payload.status };
        if (payload.financial_status) updateData.financial_status = payload.financial_status;
        const { error: bagError } = await supabase
          .from("order_bags")
          .update(updateData)
          .eq("violet_bag_id", String(payload.id));
        if (bagError) {
          await updateEventStatus(supabase, eventId, "failed", `Bag refund update failed: ${bagError.message}`);
          return;
        }
        // Step 2: Derive and update parent order status
        await deriveAndUpdateOrderStatus(supabase, String(payload.order_id));
        // Step 3: Get order_bags.id (UUID) for FK in order_refunds
        const { data: bagRow } = await supabase
          .from("order_bags")
          .select("id")
          .eq("violet_bag_id", String(payload.id))
          .single();
        // Step 4: Fetch refund details from Violet API (best-effort — bag status already saved)
        if (bagRow) {
          await fetchAndStoreRefundDetails(supabase, payload, bagRow.id);
        }
        // Step 5: Trigger refund email (fire-and-forget — Story 5.6 implements send-notification)
        supabase.functions
          .invoke("send-notification", {
            body: { type: "refund_processed", bag_id: String(payload.id), order_id: String(payload.order_id) },
          })
          .catch((err: unknown) => {
            console.warn(
              `[processBagRefunded] send-notification invoke failed (non-critical, Story 5.6): ${err instanceof Error ? err.message : "Unknown"}`,
            );
          });
        await updateEventStatus(supabase, eventId, "processed");
      } catch (err) {
        await updateEventStatus(
          supabase, eventId, "failed",
          err instanceof Error ? err.message : "Unknown error in processBagRefunded",
        );
      }
    }
    ```
  - [x] 2.3: Add `fetchAndStoreRefundDetails` private helper above `processBagRefunded`:
    ```typescript
    async function fetchAndStoreRefundDetails(
      supabase: SupabaseClient,
      payload: VioletBagPayload,
      orderBagId: string,
    ): Promise<void> {
      const violetHeadersResult = await getVioletHeaders();
      if (violetHeadersResult.error) {
        console.warn(`[processBagRefunded] Cannot fetch refund details — Violet auth failed: ${violetHeadersResult.error.message}`);
        return;
      }
      const apiBase = Deno.env.get("VIOLET_API_BASE") ?? "https://sandbox-api.violet.io/v1";
      const url = `${apiBase}/orders/${payload.order_id}/bags/${payload.id}/refunds`;
      try {
        const res = await fetch(url, {
          headers: { ...violetHeadersResult.data, "Content-Type": "application/json" },
        });
        if (!res.ok) {
          console.warn(`[processBagRefunded] Violet refund API returned ${res.status} for bag ${payload.id}`);
          return;
        }
        const raw = await res.json() as unknown;
        // Violet paginates: { content: [...] } or plain array
        const refunds: unknown[] = Array.isArray(raw) ? raw : ((raw as Record<string, unknown>).content as unknown[] ?? []);
        for (const refund of refunds) {
          const r = refund as Record<string, unknown>;
          const { error } = await supabase.from("order_refunds").upsert(
            {
              order_bag_id: orderBagId,
              violet_refund_id: String(r.id),
              amount: Number(r.amount),
              reason: (r.refund_reason as string | undefined) ?? null,
              currency: (r.refund_currency as string | undefined) ?? "USD",
              status: (r.status as string | undefined) ?? "PROCESSED",
            },
            { onConflict: "violet_refund_id" },
          );
          if (error) {
            console.error(`[processBagRefunded] Failed to upsert refund ${r.id}: ${error.message}`);
          }
        }
      } catch (err) {
        console.warn(`[processBagRefunded] Violet refund fetch error: ${err instanceof Error ? err.message : "Unknown"}`);
      }
    }
    ```
  - [x] 2.4: Update `index.ts` routing for `BAG_REFUNDED` — change the case to call `processBagRefunded` instead of `processBagUpdated`:
    ```typescript
    // In index.ts, in the switch block:
    case "BAG_REFUNDED": {
      const result = violetBagWebhookPayloadSchema.safeParse(payload);
      if (!result.success) {
        await updateEventStatus(supabase, eventId, "failed", `Zod validation failed: ${result.error.message}`);
        break;
      }
      await processBagRefunded(supabase, eventId, result.data);  // ← was processBagUpdated
      break;
    }
    ```
  - [x] 2.5: Update the import in `index.ts` to include `processBagRefunded`:
    ```typescript
    import { processOrderUpdated, processBagUpdated, processBagShipped, processBagRefunded } from "./orderProcessors.ts";
    ```

- [x] **Task 3: Shared types** — `packages/shared/src/types/orderPersistence.types.ts` (AC: #5)
  - [x] 3.1: Add `OrderRefundRow` interface after `OrderItemRow`:
    ```typescript
    /** Supabase row type for order_refunds table */
    export interface OrderRefundRow {
      id: string;
      order_bag_id: string;
      violet_refund_id: string;
      amount: number;        // integer cents
      reason: string | null;
      currency: string;
      status: string;
      created_at: string;
    }
    ```

- [x] **Task 4: Update shared hook types** — `packages/shared/src/hooks/useOrders.ts` (AC: #5)
  - [x] 4.1: Import `OrderRefundRow` from `orderPersistence.types`:
    ```typescript
    import type { OrderRow, OrderBagRow, OrderItemRow, OrderRefundRow } from "../types/orderPersistence.types.js";
    ```
  - [x] 4.2: Update `OrderBagWithItems` type:
    ```typescript
    export type OrderBagWithItems = OrderBagRow & {
      order_items: OrderItemRow[];
      order_refunds: OrderRefundRow[];
    };
    ```
  - [x] 4.3: Export `OrderRefundRow` re-export (add to the index re-export if it's done there):
    - Check `packages/shared/src/hooks/index.ts` — if it re-exports from `useOrders`, add `OrderRefundRow` to the re-export chain from `orderPersistence.types`

- [x] **Task 5: Update web server handler** — `apps/web/src/server/orderHandlers.ts` (AC: #5)
  - [x] 5.1: Update the Supabase select in `orderDetailHandler` to include refunds:
    ```typescript
    const { data: order, error } = await supabase
      .from("orders")
      .select(
        `
        *,
        order_bags (
          *,
          order_items (*),
          order_refunds (*)
        )
      `,
      )
      .eq("id", orderId)
      .eq("user_id", user.id)
      .single();
    ```
  - [x] 5.2: Note: `OrderWithBagsAndItems` type already derives from `OrderBagWithItems` so this change propagates automatically once Task 4 is done

- [x] **Task 6: Update web order detail UI** — `apps/web/src/routes/account/orders/$orderId.tsx` (AC: #3)
  - [x] 6.1: Import `OrderRefundRow` from `@ecommerce/shared`:
    ```typescript
    import type { OrderBagWithItems, OrderItemRow, OrderRefundRow } from "@ecommerce/shared";
    ```
  - [x] 6.2: Add `RefundNotice` sub-component:
    ```typescript
    function RefundNotice({ refunds, currency }: { refunds: OrderRefundRow[]; currency: string }) {
      if (refunds.length === 0) return null;
      const totalRefunded = refunds.reduce((sum, r) => sum + r.amount, 0);
      const firstReason = refunds.find((r) => r.reason)?.reason;
      return (
        <div className="order-detail__refund">
          <span className="order-detail__refund-notice">
            Refund of {formatPrice(totalRefunded, currency)} processed
          </span>
          {firstReason && (
            <span className="order-detail__refund-reason">{firstReason}</span>
          )}
        </div>
      );
    }
    ```
  - [x] 6.3: Update `BagCard` to render `RefundNotice` (after tracking info, before bag footer):
    ```tsx
    {bag.order_refunds.length > 0 && (
      <RefundNotice refunds={bag.order_refunds} currency={orderCurrency} />
    )}
    ```
  - [x] 6.4: Update the bag footer to annotate the bag total when refunded:
    ```tsx
    <div className="order-detail__bag-footer">
      <span className="order-detail__bag-shipping-method">
        {bag.shipping_method && `Shipped via ${bag.shipping_method}`}
      </span>
      <span className="order-detail__bag-total">
        {formatPrice(bag.total, orderCurrency)}
        {bag.order_refunds.length > 0 && (
          <span className="order-detail__bag-refund-annotation">
            {` — Refund: ${formatPrice(bag.order_refunds.reduce((s, r) => s + r.amount, 0), orderCurrency)}`}
          </span>
        )}
      </span>
    </div>
    ```

- [x] **Task 7: Update guest lookup web** — `apps/web/src/routes/order/lookup.tsx` (AC: #4)
  - [x] 7.1: The `lookup.tsx` step `"results"` and `"token-result"` reuse the `.order-detail` BEM classes (per Story 5.4). Since `OrderBagWithItems` now includes `order_refunds`, the refund info will be visible IF the expanded order card uses the same `BagCard` sub-component.
  - [x] 7.2: Check whether `lookup.tsx` uses a shared `BagCard` component or inlines the order detail markup. If the detail markup is inlined/duplicated: replicate the `RefundNotice` integration (same JSX as Task 6.3–6.4).
  - [x] 7.3: The `lookupOrderByTokenFn` and `lookupOrdersByEmailFn` handlers call `getSupabaseServer()` and select `"*, order_bags(*, order_items(*))"`— these are in `guestOrders.ts`. Update the select to include `order_refunds(*)`:
    ```typescript
    // In lookupOrderByTokenHandler and lookupOrdersByEmailHandler:
    .select("*, order_bags(*, order_items(*), order_refunds(*))")
    ```

- [x] **Task 8: Update mobile guest lookup** — `apps/mobile/src/app/order/lookup.tsx` (AC: #4)
  - [x] 8.1: Mobile order detail fetches via the `guest-order-lookup` Edge Function (`supabase/functions/guest-order-lookup/index.ts`). Update the Edge Function's Supabase select to include `order_refunds(*)`:
    ```typescript
    // For "token" path: .select("*, order_bags(*, order_items(*), order_refunds(*))")
    // For "email" path: .select("*, order_bags(*, order_items(*), order_refunds(*))")
    ```
  - [x] 8.2: In the mobile `lookup.tsx` order card, after the bag status display, add a refund notice:
    ```tsx
    {bag.order_refunds?.length > 0 && (
      <ThemedText type="small" themeColor="textSecondary">
        {`Refund of ${formatPrice(bag.order_refunds.reduce((s: number, r: { amount: number }) => s + r.amount, 0), order.currency)} processed`}
        {bag.order_refunds[0]?.reason ? ` — ${bag.order_refunds[0].reason}` : ""}
      </ThemedText>
    )}
    ```
  - [x] 8.3: Use optional chaining (`bag.order_refunds?.length`) since older mobile data may not have this field yet

- [x] **Task 9: CSS** — `apps/web/src/styles/pages/orders.css` (AC: #3)
  - [x] 9.1: Add after `.order-detail__tracking` block:
    ```css
    .order-detail__refund {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      padding: var(--space-3) var(--space-4);
      background: rgba(39, 174, 96, 0.06);
      border-left: 2px solid var(--color-success, #27ae60);
      border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
      margin-top: var(--space-3);
    }

    .order-detail__refund-notice {
      font-size: var(--text-sm);
      color: var(--color-success, #27ae60);
      font-weight: 500;
    }

    .order-detail__refund-reason {
      font-size: var(--text-xs);
      color: var(--color-muted);
    }

    .order-detail__bag-refund-annotation {
      font-size: var(--text-sm);
      color: var(--color-success, #27ae60);
      font-weight: normal;
    }
    ```

- [x] **Task 10: Tests** — `apps/web/src/server/__tests__/orders.test.ts` (AC: #5)
  - [x] 10.1: Add test for `orderDetailHandler` when a bag has refunds — mock Supabase to return an order where `order_bags` includes an `order_refunds` array with one refund
  - [x] 10.2: Add test for `orderDetailHandler` when bags have no refunds — `order_refunds` is empty array `[]`
  - [x] 10.3: Verify `orderDetailHandler` select string now includes `order_refunds (*)` (e.g., by checking the mock `.select()` call arg)

- [x] **Task 11: Quality checks** (AC: all)
  - [x] 11.1: Run `bun run fix-all` — 0 errors, 0 warnings
  - [x] 11.2: Run `bun --cwd=apps/web run test` — all tests pass
  - [x] 11.3: Run `bun run typecheck` — no TypeScript errors

---

## Dev Notes

### Critical Architecture Constraints

- **`processBagRefunded` secondary API call adds latency** — The Edge Function already has an H1 limitation (synchronous processing within the 10s Violet timeout window). Calling Violet's refund API adds 200–500ms. This is acceptable because: (a) the bag status update is committed BEFORE the API call, (b) if the API call fails, the bag status is still "REFUNDED" (just without refund amount details), (c) retries will hit idempotency on `webhook_events` and return 200 immediately, but `order_refunds` upsert is idempotent on `violet_refund_id`. **Never throw** inside `fetchAndStoreRefundDetails` — it must be best-effort.

- **`processBagRefunded` replaces the current `const processBagRefunded = processBagUpdated` stub** — The stub at line 252 of `orderProcessors.ts` must be replaced with a real `export async function`. Also update `index.ts` import and routing (Tasks 2.4 and 2.5).

- **Violet refund API response format** — The endpoint `GET /v1/orders/{order_id}/bags/{bag_id}/refunds` returns a paginated Violet response. Handle both `[...]` (flat array) and `{ content: [...] }` (paginated) to be defensive:
  ```typescript
  const raw = await res.json();
  const refunds = Array.isArray(raw) ? raw : (raw.content ?? []);
  ```

- **`violet_bag_id` in DB is TEXT, `payload.id` is number** — Always `String(payload.id)` when querying `order_bags.violet_bag_id`. Same for `payload.order_id` when calling the Violet API URL: `/orders/${payload.order_id}/bags/${payload.id}/refunds`.

- **`send-notification` invocation is fire-and-forget** — Use `.catch()` on the promise. Story 5.6 creates the actual function. Until then, the invocation will fail with "function not found" — swallowed silently.

- **Do NOT add `updated_at` to `order_refunds`** — Refunds are immutable once created. No `updated_at` trigger needed. Simplifies schema.

- **`order_refunds` in guest lookup** — The `guest-order-lookup` Edge Function (`supabase/functions/guest-order-lookup/index.ts`) uses service_role and queries directly. Update its `.select()` calls to add `order_refunds(*)`. The RLS `service_role_all_order_refunds` policy covers this.

- **Mobile: `bag.order_refunds` may be undefined** — The mobile guest lookup screen fetches via the Edge Function. If the Edge Function returns data before the query includes `order_refunds`, the field may be absent. Use `bag.order_refunds?.length > 0` (optional chaining) throughout mobile code.

- **`CANCELED` bags never show refund info** — The `RefundNotice` component only renders when `bag.order_refunds.length > 0`. A canceled bag without a refund will always have `order_refunds: []`, so no refund notice appears. This correctly satisfies AC: "CANCELED bags without refund show 'Canceled' status, NOT 'Refunded'".

- **`OrderBagWithItems` type widening is backward-compatible** — Adding `order_refunds: OrderRefundRow[]` to the existing type means all current consumers (lookup page, mobile lookup) will compile with TypeScript strict. They already spread or map the bag object so the new field is silently ignored until they render it. No breaking changes.

### Existing Utilities to Reuse (DO NOT REBUILD)

| Utility | Location | What it provides |
| ------- | -------- | ---------------- |
| `getVioletHeaders()` | `supabase/functions/_shared/violetAuth.ts` | Returns `{ "X-Violet-Token", "X-Violet-App-Id", "X-Violet-App-Secret" }` with automatic refresh |
| `getSupabaseAdmin()` | `supabase/functions/_shared/supabaseAdmin.ts` | Service role Supabase client for Edge Functions |
| `updateEventStatus()` | `supabase/functions/handle-webhook/processors.ts` | Updates `webhook_events.status` |
| `deriveAndUpdateOrderStatus()` | `supabase/functions/handle-webhook/orderProcessors.ts` | Re-derives order status from all bags (already used by processBagUpdated) |
| `processBagUpdated()` | `supabase/functions/handle-webhook/orderProcessors.ts` | Generic bag update — the NEW `processBagRefunded` should inline this logic (NOT call `processBagUpdated` then add on top) |
| `formatPrice()` | `packages/shared/src/utils/formatPrice.ts` | Integer cents → "$X.XX" |
| `OrderBagWithItems` | `packages/shared/src/hooks/useOrders.ts` | Type: OrderBagRow + order_items (+ order_refunds after Task 4) |
| `BAG_STATUS_LABELS` | `packages/shared/src/utils/orderStatusDerivation.ts` | Bag status → user-friendly label (already has REFUNDED: "Refunded") |

### Existing Code Patterns to Follow

```typescript
// processBagUpdated pattern (reference — replicate inline in processBagRefunded, don't call it):
export async function processBagUpdated(supabase, eventId, payload) {
  try {
    const updateData = { status: payload.status };
    if (payload.financial_status) updateData.financial_status = payload.financial_status;
    const { error } = await supabase
      .from("order_bags")
      .update(updateData)
      .eq("violet_bag_id", String(payload.id));
    if (error) { await updateEventStatus(...); return; }
    await deriveAndUpdateOrderStatus(supabase, String(payload.order_id));
    await updateEventStatus(supabase, eventId, "processed");
  } catch (err) { await updateEventStatus(...); }
}
```

```typescript
// Violet API call pattern (from cart/index.ts):
const violetHeadersResult = await getVioletHeaders();
if (violetHeadersResult.error) { /* handle */ return; }
const apiBase = Deno.env.get("VIOLET_API_BASE") ?? "https://sandbox-api.violet.io/v1";
const res = await fetch(`${apiBase}/orders/${orderId}/bags/${bagId}/refunds`, {
  headers: { ...violetHeadersResult.data, "Content-Type": "application/json" },
});
if (!res.ok) { /* warn, return */ }
const data = await res.json();
```

```typescript
// Supabase upsert pattern (idempotent on unique column):
await supabase
  .from("order_refunds")
  .upsert(
    { order_bag_id, violet_refund_id, amount, reason, currency, status },
    { onConflict: "violet_refund_id" }
  );
```

```typescript
// OrderBagWithItems consumer (existing BagCard — reference for where to add refund):
function BagCard({ bag, orderCurrency }) {
  // ... existing items, tracking ...
  {/* ADD: refund notice here, after tracking info */}
  {bag.order_refunds.length > 0 && (
    <RefundNotice refunds={bag.order_refunds} currency={orderCurrency} />
  )}
  {/* existing bag footer */}
}
```

```sql
-- order_refunds RLS policy pattern (same as order_items — nested join through order_bags):
CREATE POLICY "users_read_own_order_refunds" ON order_refunds
  FOR SELECT TO authenticated
  USING (order_bag_id IN (
    SELECT ob.id FROM order_bags ob
    JOIN orders o ON ob.order_id = o.id
    WHERE o.user_id = auth.uid()
  ));
```

### Violet.io Refund API Reference

**Endpoint**: `GET /v1/orders/{order_id}/bags/{bag_id}/refunds`

**Headers** (from `getVioletHeaders()`):
- `X-Violet-Token: {token}`
- `X-Violet-App-Id: {appId}`
- `X-Violet-App-Secret: {appSecret}`

**Response** (paginated list — defensive handling required):
```json
{
  "content": [
    {
      "id": 12345,
      "order_id": 67890,
      "bag_id": 11111,
      "merchant_id": 22222,
      "amount": 4999,
      "refund_reason": "Item not as described",
      "refund_currency": "USD",
      "status": "PROCESSED"
    }
  ],
  "number": 0,
  "size": 20,
  "total_elements": 1,
  "total_pages": 1
}
```

**BAG_REFUNDED webhook payload** (via `violetBagWebhookPayloadSchema`):
- `id`: bag ID (number) — maps to `order_bags.violet_bag_id`
- `order_id`: parent order ID (number) — needed for the refund API URL
- `status`: e.g. `"REFUNDED"`
- `financial_status`: e.g. `"REFUNDED"` or `"PARTIALLY_REFUNDED"`

> **Note**: The webhook does NOT include refund amount or reason. These must be fetched from the Refund API endpoint. This is a Violet.io architecture decision — webhooks are thin notifications, detail requires an API call.

### Database Schema Reference

```sql
-- NEW: order_refunds (created in Task 1)
CREATE TABLE order_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_bag_id UUID NOT NULL REFERENCES order_bags(id) ON DELETE CASCADE,
  violet_refund_id TEXT NOT NULL UNIQUE,  -- Violet's numeric refund ID as TEXT
  amount INTEGER NOT NULL,                -- in cents, e.g. 4999 = $49.99
  reason TEXT,                            -- nullable — Violet may omit it
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'PROCESSED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- order_bags.financial_status (already exists from 20260319000000_orders.sql):
-- 'UNPAID' → 'PAID' → 'REFUNDED' | 'PARTIALLY_REFUNDED'
-- This column is already updated by processBagUpdated (and processBagRefunded inherits this)

-- Relevant existing indexes:
-- idx_order_bags_violet_bag_id ON order_bags(violet_bag_id) -- used in processBagRefunded lookup
```

### Previous Story Intelligence (Story 5.4)

- **`processBagRefunded = processBagUpdated` is a stub** — The line `export const processBagRefunded = processBagUpdated;` at bottom of `orderProcessors.ts` is intentionally a stub to be replaced in Story 5.5. Confirm before implementing.
- **`supabase.functions.invoke()` from within Edge Functions** — This works in Supabase Edge Functions (Deno). The service role client (`getSupabaseAdmin()`) can invoke other Edge Functions. The call does NOT need CORS headers since it's server-to-server.
- **Edge Function debug pattern**: Use `console.warn` for non-critical failures, `console.error` for DB/processing failures. This is the pattern throughout `handle-webhook/`.
- **Story 5.4 debug (D1)**: Import path correction — actual package.json exports differ from story notes. Double-check `@ecommerce/shared` re-exports when adding `OrderRefundRow`.
- **Story 5.3 pattern**: `orderDetailHandler` uses `getSupabaseSessionClient()` (RLS) not `getSupabaseServer()` (service role). The new `order_refunds(*)` join is covered by the `users_read_own_order_refunds` RLS policy — this is why RLS is important to set up correctly in Task 1.
- **`guest-order-lookup` Edge Function** (Story 5.4): Uses `SUPABASE_SERVICE_ROLE_KEY` directly (via `getSupabaseAdmin()` or `createClient(..., serviceRoleKey)`). It bypasses RLS, so the `service_role_all_order_refunds` policy covers it automatically.

### Git Intelligence

- Commit pattern: `feat: implement <description> (Story X.Y) + code review fixes`
- Implementation sequence established: migration → shared types → server/edge functions → routes/components → CSS → tests → fix-all
- Story 5.4 = web + mobile (both platforms). Story 5.5 continues this pattern.
- Last commit: `c59f333 feat: implement guest order lookup web + mobile (Story 5.4) + code review fixes`

### Project Structure Notes

- **No change to `violetBagWebhookPayloadSchema`** — The existing schema already captures `status` and `financial_status`. Refund amount/reason come from the Violet API call, not the webhook. Do NOT add `refund_amount` to the Zod schema — it's not in the webhook payload.
- **`send-notification` Edge Function not created in this story** — Story 5.6 creates `supabase/functions/send-notification/index.ts`. In Story 5.5, the invocation is fire-and-forget with graceful failure. The function folder should NOT be created here to avoid confusing Story 5.6 implementation.
- **Mobile has no authenticated orders list/detail yet** — Story 5.3 implemented web-only orders view. Mobile only shows order confirmation (Story 5.1) and guest lookup (Story 5.4). For Story 5.5, refund info is visible on mobile ONLY via the guest lookup screen. Authenticated mobile order detail is deferred.
- **Supabase Realtime**: The existing `useOrderRealtime` hook (from Story 5.3) subscribes to `orders` and `order_bags` table changes. Supabase Realtime automatically broadcasts `order_refunds` INSERT events to all subscribers once the table is in the publication. However, the current `useOrderRealtime` invalidates the full order query on any DB change, so new refund rows will trigger a re-fetch automatically — no Realtime code change needed.

### References

- [Source: epics.md#Story 5.5 — Refund Processing & Communication acceptance criteria]
- [Source: epics.md#Story 5.6 — Email Notifications Pipeline (send-notification function, refund email template)]
- [Source: prd.md#FR26 — System can process bag-level refunds and communicate refund status to buyers]
- [Source: prd.md#FR23 — Email notifications for order status changes including refund]
- [Source: 5-4-guest-order-lookup.md — processBagRefunded stub note, getVioletHeaders pattern, Edge Function service_role pattern, fire-and-forget .invoke() pattern]
- [Source: 5-3-unified-order-tracking-view.md — useOrderRealtime hook + query invalidation pattern, orderDetailHandler Supabase select pattern]
- [Source: supabase/functions/_shared/violetAuth.ts — getVioletHeaders(), VIOLET_API_BASE env var]
- [Source: supabase/functions/handle-webhook/orderProcessors.ts — processBagUpdated pattern, deriveAndUpdateOrderStatus, updateEventStatus]
- [Source: supabase/functions/handle-webhook/index.ts — BAG_REFUNDED routing at line 382, synchronous processing H1 limitation]
- [Source: supabase/migrations/20260319000000_orders.sql — order_bags.financial_status column, RLS policy patterns]
- [Source: supabase/migrations/20260320000000_orders_realtime.sql — ALTER PUBLICATION supabase_realtime ADD TABLE pattern]
- [Source: packages/shared/src/types/orderPersistence.types.ts — OrderBagRow, OrderItemRow interface pattern]
- [Source: apps/web/src/server/orderHandlers.ts — orderDetailHandler Supabase nested select, line 75–96]
- [Source: apps/web/src/routes/account/orders/$orderId.tsx — BagCard component, RefundNotice insertion points]
- [Source: apps/web/src/styles/pages/orders.css — .order-detail__tracking as insertion anchor for new .order-detail__refund* rules]
- [Source: CLAUDE.md — No Tailwind CSS, BEM convention, double quotes, semicolons, 100 char width]
- [Source: Violet.io docs — GET /v1/orders/{order_id}/bags/{bag_id}/refunds, refund object fields (id, amount, refund_reason, refund_currency, status), paginated response format]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- D1: Mobile TypeScript strict error — `bag.order_refunds?.length > 0` does not narrow the type inside the conditional. Fixed by using explicit truthy guard: `bag.order_refunds && bag.order_refunds.length > 0`.
- D2: Existing guestOrders.test.ts checked the old select string `"*, order_bags(*, order_items(*))"`; updated to `"*, order_bags(*, order_items(*), order_refunds(*))"` after updating guestOrderHandlers.ts.

### Completion Notes List

- Replaced `processBagRefunded = processBagUpdated` stub in `orderProcessors.ts` with real async function that: (1) updates bag status + derives order status, (2) fetches refund details from Violet `/v1/orders/{id}/bags/{id}/refunds` API (best-effort), (3) upserts into `order_refunds` (idempotent on `violet_refund_id`), (4) fires `send-notification` fire-and-forget.
- Updated `index.ts` routing: `BAG_REFUNDED` now calls `processBagRefunded` instead of `processBagUpdated`; other BAG_* events still use `processBagUpdated`.
- Added `OrderRefundRow` interface to `orderPersistence.types.ts`; widened `OrderBagWithItems` in `useOrders.ts` to include `order_refunds: OrderRefundRow[]`.
- Re-exported `OrderRefundRow` from `packages/shared/src/hooks/index.ts`.
- Updated `orderDetailHandler`, `lookupOrderByTokenHandler`, `lookupOrdersByEmailHandler`, and `guest-order-lookup` Edge Function to include `order_refunds(*)` in all Supabase selects.
- Added `RefundNotice` sub-component (web authenticated detail + web guest lookup) with BEM classes; annotated bag footer with refund amount.
- Added mobile refund notice in `OrderDetailView` with optional chaining guard for backward compatibility.
- Created `supabase/migrations/20260321000000_order_refunds.sql` with RLS policies and Realtime publication.
- Added CSS for `.order-detail__refund`, `.order-detail__refund-notice`, `.order-detail__refund-reason`, `.order-detail__bag-refund-annotation`.
- 4 new tests added for `orderDetailHandler` (refund present, empty refunds, select string includes order_refunds). 1 existing guestOrders test updated for new select string.
- All 178 tests pass; `bun run fix-all` exits 0.

### Code Review Fixes (AI — 2026-03-17)

- **H1 (Fixed)**: Replaced `Content-Type: application/json` with `Accept: application/json` on the GET request to Violet's refund API in `fetchAndStoreRefundDetails`. GET requests have no body, so `Content-Type` was semantically incorrect.
- **M2 (Fixed)**: Added `Number.isFinite(amount) && amount >= 0` validation before upserting refund rows. Prevents `NaN` or negative values from reaching the database if Violet returns unexpected data.
- **M3 (Fixed)**: Added comprehensive JSDoc documentation with Violet.io API references across all modified files: `orderProcessors.ts`, `orderPersistence.types.ts`, `useOrders.ts`, `orderHandlers.ts`, `guestOrderHandlers.ts`, `guest-order-lookup/index.ts`, `$orderId.tsx`, `lookup.tsx` (web + mobile), `order_refunds.sql`.
- **M1 (Noted)**: Code duplication of `RefundNotice`, `BagCard`, `ItemRow`, `getBagStatusClass` between `$orderId.tsx` and `lookup.tsx` — pre-existing from Story 5.4, added NOTE comment in `lookup.tsx` for future extraction.
- **L1 (Noted)**: Mobile hardcoded color `#27ae60` for refund notice — should use design token from `@ecommerce/ui`.
- **L2 (Noted)**: Realtime `order_refunds` relies on side-effect (bag UPDATE subscription) rather than direct `order_refunds` INSERT subscription.

### File List

- `supabase/migrations/20260321000000_order_refunds.sql` (CREATE)
- `supabase/functions/handle-webhook/orderProcessors.ts` (UPDATE)
- `supabase/functions/handle-webhook/index.ts` (UPDATE)
- `supabase/functions/guest-order-lookup/index.ts` (UPDATE)
- `packages/shared/src/types/orderPersistence.types.ts` (UPDATE)
- `packages/shared/src/hooks/useOrders.ts` (UPDATE)
- `packages/shared/src/hooks/index.ts` (UPDATE)
- `apps/web/src/server/orderHandlers.ts` (UPDATE)
- `apps/web/src/server/guestOrderHandlers.ts` (UPDATE)
- `apps/web/src/routes/account/orders/$orderId.tsx` (UPDATE)
- `apps/web/src/routes/order/lookup.tsx` (UPDATE)
- `apps/mobile/src/app/order/lookup.tsx` (UPDATE)
- `apps/web/src/styles/pages/orders.css` (UPDATE)
- `apps/web/src/server/__tests__/orders.test.ts` (UPDATE)
- `apps/web/src/server/__tests__/guestOrders.test.ts` (UPDATE)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (UPDATE)
