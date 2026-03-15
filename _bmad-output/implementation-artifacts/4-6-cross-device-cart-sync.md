# Story 4.6: Cross-Device Cart Sync

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Quick Reference — Files to Create/Update

| Action | File | Notes |
| ------ | ---- | ----- |
| CREATE | `supabase/migrations/YYYYMMDDHHMMSS_enable_carts_realtime.sql` | Enable Realtime on `carts` table + add `updated_at` trigger + REPLICA IDENTITY |
| CREATE | `packages/shared/src/hooks/useCartSync.ts` | Supabase Realtime subscription hook — invalidates TanStack Query cache on cross-device cart changes |
| CREATE | `apps/web/src/server/cartSync.ts` | Server Functions: `getUserCartFn` (lookup by user_id), `mergeAnonymousCartFn` (merge anonymous → authenticated) |
| UPDATE | `apps/web/src/server/cartActions.ts` | Update `createCartFn` to check for existing user cart on authenticated creation; add `claimCartFn` for anonymous→auth ownership transfer |
| UPDATE | `apps/web/src/contexts/CartContext.tsx` | Integrate `useCartSync` — subscribe on auth, swap `violetCartId` on Realtime event |
| UPDATE | `apps/web/src/routes/__root.tsx` | Pass Supabase client + user session to CartProvider for Realtime subscription |
| UPDATE | `apps/web/src/hooks/useAuthSession.ts` | Trigger cart merge/claim on SIGNED_IN event when previous session was anonymous |
| UPDATE | `supabase/functions/cart/index.ts` | Add `GET /cart/user/{userId}` route; add `POST /cart/merge` route; ensure all cart mutations touch `updated_at` |
| UPDATE | `apps/mobile/src/app/_layout.tsx` | Integrate `useCartSync` in mobile app shell |
| UPDATE | `apps/mobile/src/context/AuthContext.tsx` | Trigger cart merge on anonymous→authenticated transition |
| UPDATE | `packages/shared/src/adapters/supplierAdapter.ts` | Add `addToCart` batch signature (for merge: add multiple items) |
| UPDATE | `packages/shared/src/adapters/violetAdapter.ts` | Ensure `addToCart` handles duplicate SKU (Violet may auto-merge or reject) |
| UPDATE | `packages/shared/src/types/cart.types.ts` | Add `CartSyncEvent` type for Realtime payload |

---

## Story

As a **returning visitor**,
I want my cart to sync across my devices when I'm logged in,
so that I can start shopping on mobile and finish on web (or vice versa).

## Acceptance Criteria

1. **Given** an authenticated user with items in their cart on Device A
   **When** they access the platform from Device B (web or mobile)
   **Then** their cart is loaded from Supabase (linked by `user_id`)
   **And** cart data is synced with Violet's cart state via `GET /checkout/cart/{id}`

2. **Given** an authenticated user modifies their cart on Device A
   **When** Device B has the platform open
   **Then** Device B receives a Supabase Realtime event within < 1 second
   **And** TanStack Query cache is invalidated, triggering a refetch from Violet
   **And** the cart UI updates without manual refresh

3. **Given** an anonymous guest with items in their cart
   **When** they log in or create an account
   **Then** if they have no prior authenticated cart, their anonymous cart ownership is transferred to their user_id
   **And** if they already have an authenticated cart, items from the anonymous cart are merged into the authenticated cart
   **And** merge strategy: duplicate SKUs increase quantity; new SKUs are added
   **And** the anonymous cart is marked as `merged` status
   **And** the client's `violet_cart_id` (cookie/SecureStore) is updated to the authenticated cart

4. **Given** a cart sync event
   **When** an item in the synced cart has gone out of stock or changed price
   **Then** the Violet API returns current stock/price status
   **And** the user sees a notification about changed items (handled by existing 200-with-errors pattern)

5. **Given** a Realtime subscription
   **When** the user logs out or the session expires
   **Then** the Realtime subscription is properly unsubscribed (cleanup)
   **And** no memory leaks occur

6. **And** the `useCartSync` hook is implemented in `packages/shared/src/hooks/useCartSync.ts` (FR31)
   **And** both web and mobile use the same hook via shared package (FR54)
   **And** sync latency is < 1 second per NFR5

## Tasks / Subtasks

- [x] Task 1: Database migration — Enable Realtime + updated_at trigger (AC: #2, #6)
  - [x] Create migration `supabase/migrations/YYYYMMDDHHMMSS_enable_carts_realtime.sql`:
    ```sql
    -- Enable Realtime for carts table
    ALTER PUBLICATION supabase_realtime ADD TABLE carts;

    -- Set REPLICA IDENTITY so Realtime sends old+new on UPDATE
    -- Note: with RLS enabled, only PK is sent to clients — we use the event
    -- as a cache-invalidation signal, not as the data source
    ALTER TABLE carts REPLICA IDENTITY FULL;

    -- Auto-update updated_at on row modification
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ language 'plpgsql';

    CREATE TRIGGER carts_updated_at
      BEFORE UPDATE ON carts
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();

    -- Add 'merged' to valid cart statuses (for anonymous→auth merge)
    -- (status is TEXT, no enum constraint to update)
    COMMENT ON COLUMN carts.status IS 'active | completed | abandoned | merged';
    ```
  - [x] Verify migration applies cleanly against local Supabase (`supabase db reset`)

- [x] Task 2: Add `CartSyncEvent` type (AC: #2)
  - [x] In `packages/shared/src/types/cart.types.ts`:
    ```typescript
    /** Realtime event payload for cart changes (used as invalidation signal) */
    export interface CartSyncEvent {
      /** Supabase cart UUID (primary key) */
      cartId: string;
      /** Violet cart ID for API calls */
      violetCartId: string;
      /** Event type from Supabase Realtime */
      eventType: "INSERT" | "UPDATE" | "DELETE";
    }
    ```
  - [x] Export from `types/index.ts`

- [x] Task 3: Create `useCartSync` hook (AC: #2, #5, #6)
  - [x] Create `packages/shared/src/hooks/useCartSync.ts`:
    ```typescript
    import { useEffect, useRef } from "react";
    import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
    import { useQueryClient } from "@tanstack/react-query";
    // queryKeys lives at packages/shared/src/utils/constants.ts
// Cart keys: cart.current(), cart.detail(cartId), cart.count()
// To invalidate ALL cart queries, use queryKey: ["cart"] (prefix match)

    interface UseCartSyncOptions {
      /** Supabase client instance */
      supabase: SupabaseClient;
      /** Authenticated user ID (null = no subscription) */
      userId: string | null;
      /** Current violet cart ID on this device */
      currentVioletCartId: string | null;
      /** Callback when a DIFFERENT device updates the cart */
      onRemoteCartChange?: (violetCartId: string) => void;
    }

    /**
     * Subscribes to Supabase Realtime changes on the `carts` table,
     * filtered by the authenticated user's ID. When another device
     * modifies the cart, invalidates the TanStack Query cache so the
     * cart UI refetches from Violet (source of truth).
     *
     * Does nothing if userId is null (anonymous users don't sync).
     */
    export function useCartSync({
      supabase,
      userId,
      currentVioletCartId,
      onRemoteCartChange,
    }: UseCartSyncOptions): void {
      const channelRef = useRef<RealtimeChannel | null>(null);

      useEffect(() => {
        if (!userId) return;

        const queryClient = useQueryClient();
        const channel = supabase
          .channel(`cart:user_${userId}`)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "carts",
              filter: `user_id=eq.${userId}`,
            },
            (payload) => {
              const newVioletCartId = (payload.new as Record<string, unknown>)
                .violet_cart_id as string;

              // Only react to changes from OTHER devices
              // (same-device changes are already handled by optimistic updates)
              if (newVioletCartId === currentVioletCartId) {
                // Same cart was updated on another device — invalidate all cart queries
                queryClient.invalidateQueries({ queryKey: ["cart"] });
              }

              // If the violet_cart_id changed (e.g., merge happened), notify
              if (
                newVioletCartId &&
                newVioletCartId !== currentVioletCartId &&
                onRemoteCartChange
              ) {
                onRemoteCartChange(newVioletCartId);
              }
            }
          )
          .subscribe();

        channelRef.current = channel;

        return () => {
          channel.unsubscribe();
          channelRef.current = null;
        };
      }, [supabase, userId, currentVioletCartId, onRemoteCartChange]);
    }
    ```
  - [x] Note: `useQueryClient()` must be called inside the hook body, NOT inside the effect. Move it outside the effect as shown — this follows React hooks rules. **Correction**: `useQueryClient()` MUST be called at the top level of the hook, not inside `useEffect`. Restructure accordingly.
  - [x] Export from `hooks/index.ts`

- [x] Task 4: Server Functions — user cart lookup + merge (AC: #1, #3)
  - [x] Create `apps/web/src/server/cartSync.ts`:
    ```typescript
    import { createServerFn } from "@tanstack/react-start/server";
    import { getServiceSupabase } from "./supabaseServer";
    import { getAdapter } from "@ecommerce/shared";

    /** Finds the active cart for an authenticated user */
    export const getUserCartFn = createServerFn({ method: "GET" })
      .inputValidator((data: { userId: string }) => data)
      .handler(async ({ data }) => {
        const supabase = getServiceSupabase();
        const { data: cart } = await supabase
          .from("carts")
          .select("violet_cart_id")
          .eq("user_id", data.userId)
          .eq("status", "active")
          .order("updated_at", { ascending: false })
          .limit(1)
          .single();
        return { violetCartId: cart?.violet_cart_id ?? null };
      });

    /** Merges anonymous cart items into authenticated cart via Violet API */
    export const mergeAnonymousCartFn = createServerFn({ method: "POST" })
      .inputValidator(
        (data: { anonymousVioletCartId: string; targetVioletCartId: string }) =>
          data
      )
      .handler(async ({ data }) => {
        const adapter = getAdapter();

        // 1. Fetch both carts from Violet
        const [anonResult, targetResult] = await Promise.all([
          adapter.getCart(data.anonymousVioletCartId),
          adapter.getCart(data.targetVioletCartId),
        ]);

        if (anonResult.error || !anonResult.data) {
          return { success: false, error: "Failed to fetch anonymous cart" };
        }
        if (targetResult.error || !targetResult.data) {
          return { success: false, error: "Failed to fetch target cart" };
        }

        const anonCart = anonResult.data;
        const targetCart = targetResult.data;

        // 2. Build set of existing SKU IDs in target cart
        const existingSkus = new Map<string, { quantity: number }>();
        for (const bag of targetCart.bags) {
          for (const item of bag.items) {
            existingSkus.set(item.skuId, { quantity: item.quantity });
          }
        }

        // 3. For each anon item, add to target or update qty
        const errors: string[] = [];
        for (const bag of anonCart.bags) {
          for (const item of bag.items) {
            const existing = existingSkus.get(item.skuId);
            if (existing) {
              // SKU exists in target — increase quantity
              const newQty = existing.quantity + item.quantity;
              const updateResult = await adapter.updateCartItem(
                data.targetVioletCartId,
                item.skuId,
                newQty
              );
              if (updateResult.error) {
                errors.push(
                  `Failed to update qty for SKU ${item.skuId}: ${updateResult.error.message}`
                );
              }
            } else {
              // New SKU — add to target cart
              const addResult = await adapter.addToCart(
                data.targetVioletCartId,
                { skuId: item.skuId, quantity: item.quantity }
              );
              if (addResult.error) {
                errors.push(
                  `Failed to add SKU ${item.skuId}: ${addResult.error.message}`
                );
              }
            }
          }
        }

        // 4. Mark anonymous cart as merged in Supabase
        const supabase = getServiceSupabase();
        await supabase
          .from("carts")
          .update({ status: "merged" })
          .eq("violet_cart_id", data.anonymousVioletCartId);

        return {
          success: true,
          mergedItemCount: anonCart.bags.reduce(
            (sum, bag) => sum + bag.items.length,
            0
          ),
          errors: errors.length > 0 ? errors : undefined,
        };
      });

    /** Transfers ownership of an anonymous cart to an authenticated user */
    export const claimCartFn = createServerFn({ method: "POST" })
      .inputValidator(
        (data: { violetCartId: string; userId: string }) => data
      )
      .handler(async ({ data }) => {
        const supabase = getServiceSupabase();
        const { error } = await supabase
          .from("carts")
          .update({ user_id: data.userId, session_id: null })
          .eq("violet_cart_id", data.violetCartId);
        return { success: !error, error: error?.message };
      });
    ```

- [x] Task 5: Edge Function routes — user cart lookup + merge (mobile) (AC: #1, #3)
  - [x] In `supabase/functions/cart/index.ts`, add:
    - `GET /cart/user` — Looks up the authenticated user's active cart by `user_id` from JWT
      ```typescript
      // Extract user from JWT (already verified), query carts table
      const { data: cart } = await supabase
        .from("carts")
        .select("violet_cart_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();
      return new Response(JSON.stringify({ violetCartId: cart?.violet_cart_id ?? null }));
      ```
    - `POST /cart/merge` — Same logic as `mergeAnonymousCartFn` but for mobile
    - `POST /cart/claim` — Same logic as `claimCartFn` but for mobile
  - [x] Ensure ALL existing cart mutation routes (`POST /cart`, `POST /cart/{id}/skus`, `PUT`, `DELETE`) call `upsertCart()` which triggers `updated_at` via the DB trigger

- [x] Task 6: Integrate `useCartSync` into web CartContext (AC: #2, #5)
  - [x] Update `apps/web/src/contexts/CartContext.tsx`:
    - Accept `supabase` and `userId` as `CartProvider` props
    - Call `useCartSync({ supabase, userId, currentVioletCartId: violetCartId, onRemoteCartChange })` inside the provider
    - `onRemoteCartChange` callback: updates `violetCartId` state + updates the cookie via a Server Function
  - [x] Update `apps/web/src/routes/__root.tsx`:
    - Pass `supabaseClient` and `session?.user?.id` to `CartProvider`
    - These are already available from `useAuthSession()` hook

- [x] Task 7: Anonymous→Authenticated cart merge flow (web) (AC: #3)
  - [x] In `apps/web/src/hooks/useAuthSession.ts`:
    - On `SIGNED_IN` event, check if previous state was anonymous (track via ref)
    - If transitioning from anonymous → authenticated:
      1. Call `getUserCartFn` to check for existing authenticated cart
      2. If exists: call `mergeAnonymousCartFn` with current `violetCartId` as anonymous, retrieved cart as target
      3. If not exists: call `claimCartFn` to transfer anonymous cart ownership
      4. Update `CartContext` with the final `violetCartId`
    - Handle edge case: no anonymous cart exists (user had empty cart) — do nothing

- [x] Task 8: Anonymous→Authenticated cart merge flow (mobile) (AC: #3)
  - [x] In `apps/mobile/src/context/AuthContext.tsx`:
    - Same logic as web Task 7, but using Edge Function endpoints instead of Server Functions
    - On auth state change `SIGNED_IN` (from anonymous):
      1. `GET /cart/user` to check for existing authenticated cart
      2. If exists: `POST /cart/merge`
      3. If not exists: `POST /cart/claim`
      4. Update SecureStore `violet_cart_id` with the final cart ID

- [x] Task 9: Integrate `useCartSync` into mobile app (AC: #2, #5)
  - [x] In `apps/mobile/src/app/_layout.tsx`:
    - Import and call `useCartSync` with the Supabase client from `AuthContext`
    - On `onRemoteCartChange`: update SecureStore `violet_cart_id`
    - Ensure subscription is cleaned up on unmount

- [x] Task 10: Verify existing cart mutations update `updated_at` (AC: #2)
  - [x] Confirm that ALL cart mutation paths (web Server Functions + mobile Edge Function) perform a Supabase `carts` table write that triggers the `updated_at` trigger:
    - `createCartFn` → calls `upsert` on `carts` ✓
    - `addToCartFn` → calls `upsert` on `cart_items` (but does it touch `carts.updated_at`? If not, add explicit `carts` row update)
    - `updateCartItemFn` → check if it touches `carts` row
    - `removeFromCartFn` → check if it touches `carts` row
  - [x] If any mutation does NOT update the `carts` row, add an explicit `supabase.from('carts').update({ updated_at: new Date().toISOString() }).eq('violet_cart_id', violetCartId)` call
  - [x] This is critical — Realtime only fires on actual row changes to `carts` table

## Dev Notes

### Critical Architecture Constraints

- **Violet is the source of truth for cart data** — Supabase `carts` table is a registry (maps `user_id` ↔ `violet_cart_id`) and notification bus (Realtime triggers on `updated_at` changes). The actual cart items, prices, and stock come from Violet API.

- **Realtime as cache-invalidation signal** — With RLS enabled on `carts`, Supabase Realtime only sends the primary key to clients. Do NOT rely on the Realtime payload for cart data. Use the event purely to trigger `queryClient.invalidateQueries()`, which causes TanStack Query to refetch from Violet.

- **Supabase Realtime channel naming convention** (from architecture.md): `cart:user_{userId}`. Filter: `user_id=eq.{userId}`.

- **Anonymous users do NOT get Realtime sync** — Only authenticated users (`user_id IS NOT NULL`) subscribe to Realtime. Anonymous sessions are per-device by definition.

- **Cart merge is NOT atomic** — Violet doesn't support batch operations. Each item is added individually via `POST /checkout/cart/{id}/skus`. If merge partially fails (e.g., item out of stock), the user sees the errors via the existing 200-with-errors pattern. The anonymous cart is still marked as `merged` to prevent double-merge.

- **`updated_at` trigger is essential** — Realtime listens for Postgres row changes. If cart mutations don't update the `carts` row itself (e.g., only `cart_items` changes), Realtime won't fire. The trigger auto-updates `updated_at` on any `carts` row modification, BUT we must ensure every cart action WRITES to the `carts` row (not just `cart_items`).

- **`useQueryClient()` hook rules** — Must be called at the top level of the `useCartSync` hook, NOT inside `useEffect`. Store the `queryClient` in a ref or use it directly in the effect closure.

### C1 — Supabase Realtime subscription pattern (from official docs, confirmed 2026-03-15)

```typescript
// Subscribe to a specific user's cart changes
const channel = supabase
  .channel(`cart:user_${userId}`)
  .on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "carts",
      filter: `user_id=eq.${userId}`,
    },
    (payload) => {
      // payload.new contains the updated row (or just PK with RLS)
      // Use as signal to invalidate TanStack Query cache
    }
  )
  .subscribe();

// Cleanup
channel.unsubscribe();
```

### C2 — Enable Realtime for a table (Supabase migration)

```sql
-- Enable Realtime on carts table
ALTER PUBLICATION supabase_realtime ADD TABLE carts;
-- Set REPLICA IDENTITY for old+new on UPDATE events
ALTER TABLE carts REPLICA IDENTITY FULL;
```

### C3 — Anonymous→Authenticated merge flow

```
Guest browses → adds items → cart A (session_id = anon_uuid)
    ↓
Guest signs up/logs in → Supabase Auth transitions anon → authenticated
    ↓
System checks: does user already have an active cart?
    ↓
  ┌─── NO ────────────────────────────┐
  │ CLAIM: update cart A ownership    │
  │ SET user_id = auth.uid()          │
  │ SET session_id = NULL             │
  │ Client keeps same violet_cart_id  │
  └───────────────────────────────────┘
  ┌─── YES (cart B exists) ──────────┐
  │ MERGE: for each item in cart A:  │
  │   if SKU exists in B → += qty    │
  │   if new SKU → add to B          │
  │ Mark cart A as 'merged'          │
  │ Client switches to B's violet_id │
  └──────────────────────────────────┘
```

### C4 — Cart mutation → Realtime trigger chain

```
User adds item on Device A
    ↓
Server Function / Edge Function
    ↓
1. Violet API: POST /checkout/cart/{id}/skus
2. Supabase: upsert cart_items row
3. Supabase: UPDATE carts SET updated_at = now() (trigger fires)
    ↓
Supabase Realtime: postgres_changes event on carts table
    ↓
Device B: useCartSync receives event
    ↓
Device B: queryClient.invalidateQueries({ queryKey: queryKeys.cart.all })
    ↓
Device B: TanStack Query refetches → Violet GET /checkout/cart/{id}
    ↓
Device B: UI updates with new cart state
```

### C5 — Conflict handling (out-of-stock, price changes)

No special conflict resolution needed. When Device B refetches from Violet:
- Violet returns current stock/price (always fresh, staleTime: 0)
- If an item went out of stock, Violet returns it with error/status in the response
- Existing `parseAndTransformCart()` in VioletAdapter already handles 200-with-errors
- Cart UI already displays item-level errors (from Story 4.1/4.2)

### Previous Story Intelligence (from Story 4.5)

- **`inputValidator` NOT `validator`** — TanStack Start uses `.inputValidator()` on ServerFnBuilder
- **`getAdapter()` singleton** — never `new VioletAdapter()` in Server Functions
- **`getServiceSupabase()`** — for server-side Supabase queries that bypass RLS
- **`formatPrice(cents)` from `@ecommerce/shared`** — not `formatCents`
- **TanStack Router `useNavigate()`** — for client-side navigation
- **Violet 200-with-errors** — always check `errors[]` array even on HTTP 200
- **Cart query invalidation** — use `queryKey: ["cart"]` for prefix-match invalidation of all cart queries, or `queryKeys.cart.detail(violetCartId)` for a specific cart. There is NO `queryKeys.cart.all` — the existing keys are `cart.current()`, `cart.detail(cartId)`, `cart.count()` (in `packages/shared/src/utils/constants.ts`)
- **Mobile: spacing scale** — only `half` → `six` + `eight` are valid `Spacing` constants
- **`clearCartCookieFn`** — already exists from Story 4.4, clears `violet_cart_id` cookie
- **Route tree regeneration** — new routes require vite dev server start to trigger auto-gen
- **Mobile: `SecureStore.setItemAsync()` / `getItemAsync()`** — for persisting `violet_cart_id`

### Git Intelligence (from recent commits)

- Latest commit: `9842a80 feat: implement payment confirmation & 3D Secure handling (Story 4.5) + code review fixes`
- Pattern: Stories create/update files across shared types, adapters, server functions, route components, CSS, and Edge Functions
- Code review fixes applied in same commit
- Conventional commit format: `feat: <description> (Story X.Y) + code review fixes`

### Violet API Reference — Story 4.6

| Action | Method | Endpoint | Notes |
| ------ | ------ | -------- | ----- |
| Get cart | GET | `/v1/checkout/cart/{id}` | Returns full cart with bags, items, totals |
| Add item | POST | `/v1/checkout/cart/{id}/skus` | `{ sku_id, quantity }` — used during merge |
| Update qty | PUT | `/v1/checkout/cart/{id}/skus/{skuId}` | `{ quantity }` — used during merge for duplicates |
| Create cart | POST | `/v1/checkout/cart` | `{ channel_id, currency, wallet_based_checkout }` |

**No Violet-side cross-device sync exists** — Violet carts are stateless API resources identified by integer ID. Cross-device sync is entirely our responsibility via Supabase.

### Project Structure Notes

- Shared hook: `packages/shared/src/hooks/useCartSync.ts` (new — per architecture.md file tree)
- Server Functions: `apps/web/src/server/cartSync.ts` (new)
- Cart context: `apps/web/src/contexts/CartContext.tsx` (update)
- Auth hook: `apps/web/src/hooks/useAuthSession.ts` (update)
- Mobile auth: `apps/mobile/src/context/AuthContext.tsx` (update)
- Mobile layout: `apps/mobile/src/app/_layout.tsx` (update)
- Edge Function: `supabase/functions/cart/index.ts` (update — add 3 routes)
- Migration: `supabase/migrations/` (new — enable Realtime on carts)

### References

- [Source: epics.md#Story 4.6 — Cross-Device Cart Sync acceptance criteria, merge strategy]
- [Source: epics.md#Story 4.7 — Checkout Error Handling (adjacent story, conflict resolution deferred)]
- [Source: prd.md#FR29 — Optional account for persistent features including cross-device sync]
- [Source: prd.md#FR31 — Registered users can access cart across web and mobile in real-time]
- [Source: prd.md#FR54 — GDPR data minimization, session data handling]
- [Source: prd.md#NFR5 — Cross-device cart sync latency < 1s via Supabase Realtime]
- [Source: architecture.md#Supabase Realtime Channel Convention — "cart:user_{userId}"]
- [Source: architecture.md#Data Architecture — Cart state source of truth: Violet API]
- [Source: architecture.md#Authentication & Security — Anonymous sessions, RLS policies]
- [Source: architecture.md#API Communication Patterns — Realtime: Supabase Postgres Changes]
- [Source: architecture.md#Cross-Cutting Concerns — Dual Authentication Layer, Cross-Platform State Management]
- [Source: ux-design-specification.md#Moment 5 — "My cart is still here" — Return Visit Recognition]
- [Source: ux-design-specification.md#Effortless by Default — cross-device sync just works]
- [Source: ux-design-specification.md#Surprise/Delight — cross-device cart "just works"]
- [Source: 4-5-payment-confirmation-3d-secure-handling.md — Previous story patterns and learnings]
- [Source: 20260314000000_carts.sql — carts table schema, RLS policies, constraints]
- [Source: Supabase Official Docs — Realtime Postgres Changes, filter: column=eq.value]
- [Source: Supabase Official Docs — REPLICA IDENTITY FULL, enable Realtime publication]

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

- D1: Conditional hook call — initial implementation had `if (supabase) { useCartSync(...) }` in CartProvider, violating React hooks rules. Fixed by making `supabase` a required prop (always available in browser context).
- D2: Mobile TanStack Query — `useCartSync` initially used `useQueryClient()` internally, but mobile doesn't use TanStack Query. Refactored hook to accept generic `onCartUpdated` and `onRemoteCartChange` callbacks instead — web passes query invalidation, mobile passes state update.
- D3: Edge Function route ordering — new `/cart/user`, `/cart/claim`, `/cart/merge` routes placed AFTER `GET /cart/{id}` (regex `^\/([^/]+)$`), which matched "user" as a cart ID. Fixed by moving new routes before the generic pattern.
- D4: `useAuthSession` circular dependency — initial approach put cart merge logic in `useAuthSession` which needed `useCartContext()`, but `useAuthSession` is called before `CartProvider` mounts in `__root.tsx`. Moved merge logic into `CartProvider` which already owns both `userId` and `violetCartId`.

### Completion Notes List

- Task 1: Created migration `20260316000000_enable_carts_realtime.sql` — enables Realtime publication on `carts` table, sets REPLICA IDENTITY FULL, adds `updated_at` auto-update trigger, documents `merged` cart status.
- Task 2: Added `CartSyncEvent` interface to `cart.types.ts`, added `"merged"` to Cart status union type, exported from `types/index.ts`.
- Task 3: Created `useCartSync` hook in shared package — subscribes to Supabase Realtime `postgres_changes` on `carts` table filtered by `user_id`. Uses ref-stabilized callbacks to avoid re-subscription on render. Portable: doesn't depend on TanStack Query (uses generic `onCartUpdated`/`onRemoteCartChange` callbacks).
- Task 4: Created `cartSync.ts` with 3 Server Functions: `getUserCartFn` (lookup by user_id), `mergeAnonymousCartFn` (merge items via Violet API + mark anonymous as "merged"), `claimCartFn` (transfer ownership). Merge also updates the `violet_cart_id` cookie.
- Task 5: Added 3 Edge Function routes (before generic `GET /cart/{id}` to avoid regex conflicts): `GET /cart/user`, `POST /cart/claim`, `POST /cart/merge`. Merge route fetches both carts from Violet, adds/updates items in target, marks anonymous as merged, and touches target cart for Realtime.
- Task 6: Updated `CartProvider` to accept `supabase` (required) and `userId` props. Integrated `useCartSync` with `onCartUpdated` (invalidates all `["cart"]` queries via `useQueryClient`) and `onRemoteCartChange` (updates `violetCartId` state). Updated `__root.tsx` to pass `supabase` client and non-anonymous `userId` from `useAuthSession()`.
- Task 7: Added cart merge effect in `CartProvider` — when `userId` transitions from null → non-null (and `violetCartId` exists), calls `getUserCartFn` → `mergeAnonymousCartFn` or `claimCartFn`. Uses `prevUserIdRef` and `mergeInProgressRef` to prevent double-execution.
- Task 8: Added cart merge logic to mobile `AuthProvider` — on `SIGNED_IN` event when transitioning from anonymous, calls Edge Function endpoints `GET /cart/user` → `POST /cart/merge` or `POST /cart/claim`. Updates `SecureStore` with final `violet_cart_id`.
- Task 9: Integrated `useCartSync` in mobile `AppContent` component — reads `violet_cart_id` from SecureStore, passes `onCartUpdated` (triggers re-render) and `onRemoteCartChange` (updates SecureStore + triggers re-render).
- Task 10: Added explicit `carts` row touch in `updateCartItemFn` and `removeFromCartFn` (web Server Functions) — these only modified `cart_items` before, so Realtime wouldn't fire. Edge Function already calls `upsertCart()` on all mutation routes.

### Change Log

- 2026-03-15: Story 4.6 implementation — cross-device cart sync (10 tasks completed)
- 2026-03-16: Code review fixes — 6 issues resolved (1 HIGH security, 5 MEDIUM):
  - H1: Added `.is("user_id", null)` guard to claimCartFn + Edge Function /cart/claim (prevents cart theft)
  - M1: Fixed merge effect triggering on page refresh (undefined sentinel for initial mount)
  - M2: Moved createSupabaseClient() outside render in mobile _layout.tsx (referential stability)
  - M3: Added local MergeBag type alias in Edge Function merge route (type safety)
  - M4: Merge only marks anonymous cart as "merged" if ≥1 item transferred (retry on total failure)
  - M5: mergedCount now only counts successfully transferred items

### File List

- `supabase/migrations/20260316000000_enable_carts_realtime.sql` — NEW: Enable Realtime, REPLICA IDENTITY, updated_at trigger, merged status
- `packages/shared/src/types/cart.types.ts` — Added `CartSyncEvent` interface, `"merged"` to Cart status
- `packages/shared/src/types/index.ts` — Exported `CartSyncEvent`
- `packages/shared/src/hooks/useCartSync.ts` — NEW: Supabase Realtime subscription hook (platform-agnostic)
- `packages/shared/src/hooks/index.ts` — Exported `useCartSync`
- `apps/web/src/server/cartSync.ts` — NEW: getUserCartFn, mergeAnonymousCartFn, claimCartFn
- `apps/web/src/server/cartActions.ts` — Added carts row touch in updateCartItemFn and removeFromCartFn
- `apps/web/src/contexts/CartContext.tsx` — Added useCartSync integration, cart merge effect, supabase/userId props
- `apps/web/src/routes/__root.tsx` — Pass supabase client + userId to CartProvider, use useAuthSession
- `apps/web/src/hooks/useAuthSession.ts` — No changes (merge logic moved to CartProvider)
- `supabase/functions/cart/index.ts` — Added GET /cart/user, POST /cart/claim, POST /cart/merge routes
- `apps/mobile/src/context/AuthContext.tsx` — Added cart merge on anonymous→authenticated transition
- `apps/mobile/src/app/_layout.tsx` — Integrated useCartSync in AppContent component
