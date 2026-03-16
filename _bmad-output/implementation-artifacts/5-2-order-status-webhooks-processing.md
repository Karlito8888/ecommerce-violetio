# Story 5.2: Order Status Webhooks Processing

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Quick Reference — Files to Create/Update

| Action | File                                                                | Notes                                                                                                                                                                                                                                                 |
| ------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CREATE | `supabase/migrations/20260320000000_orders_realtime.sql`            | Enable Realtime on orders + order_bags tables, add UPDATE policies for service_role (already has ALL policy but explicit for clarity)                                                                                                                 |
| UPDATE | `packages/shared/src/types/order.types.ts`                          | Add ORDER*\* and BAG*\* webhook event types to `WebhookEventType` union                                                                                                                                                                               |
| UPDATE | `packages/shared/src/schemas/webhook.schema.ts`                     | Add order/bag event types to Zod enum + new order/bag webhook payload schemas                                                                                                                                                                         |
| UPDATE | `supabase/functions/_shared/schemas.ts`                             | Mirror new event types + order/bag payload schemas (Deno copy — MUST stay in sync)                                                                                                                                                                    |
| CREATE | `supabase/functions/handle-webhook/orderProcessors.ts`              | New processors: processOrderUpdated, processOrderCompleted, processOrderCanceled, processOrderRefunded, processOrderReturned, processBagShipped, processBagCompleted, processBagCanceled, processBagRefunded, processBagAccepted, processBagSubmitted |
| UPDATE | `supabase/functions/handle-webhook/index.ts`                        | Add switch cases for all ORDER*\* and BAG*\* event types, import new processors                                                                                                                                                                       |
| UPDATE | `supabase/functions/handle-webhook/processors.ts`                   | Re-export `updateEventStatus` (already exported, no change needed)                                                                                                                                                                                    |
| CREATE | `packages/shared/src/utils/orderStatusDerivation.ts`                | Derive order-level status from bag statuses (all same → that state; mixed → "Partially Shipped"/"Partially Completed")                                                                                                                                |
| UPDATE | `packages/shared/src/utils/index.ts`                                | Export orderStatusDerivation utility                                                                                                                                                                                                                  |
| UPDATE | `packages/shared/src/types/index.ts`                                | Export new webhook event types if any new interfaces added                                                                                                                                                                                            |
| CREATE | `packages/shared/src/utils/__tests__/orderStatusDerivation.test.ts` | Unit tests for status derivation logic                                                                                                                                                                                                                |
| CREATE | `packages/shared/src/schemas/__tests__/orderWebhookSchemas.test.ts` | Zod validation tests for order/bag webhook payload schemas                                                                                                                                                                                            |

---

## Story

As a **system**,
I want to process Violet order/bag webhooks to keep order status up to date,
so that buyers always see accurate order information.

## Acceptance Criteria

1. **Given** Violet sends order webhooks (ORDER_UPDATED, ORDER_COMPLETED, ORDER_CANCELED, ORDER_REFUNDED, ORDER_RETURNED)
   **When** the webhook handler receives them at `supabase/functions/handle-webhook/index.ts`
   **Then** HMAC signature is validated via `X-Violet-Hmac` header (NFR14)
   **And** deduplication via `X-Violet-Event-Id` in `webhook_events` table (NFR26)

2. **Given** bag-level webhooks (BAG_SUBMITTED, BAG_ACCEPTED, BAG_SHIPPED, BAG_COMPLETED, BAG_CANCELED, BAG_REFUNDED)
   **When** the webhook handler processes them
   **Then** the corresponding `order_bags` row is updated with the new status
   **And** bag tracking info (tracking_number, tracking_url, carrier) is extracted and stored when BAG_SHIPPED fires

3. **Given** a bag status changes
   **When** the webhook processes the event
   **Then** the order-level status is derived from its bags: all bags same state → that state; mixed states → "Partially Shipped" / "Partially Completed" (FR25)
   **And** **CANCELED ≠ REFUNDED** — a canceled bag is tracked separately from a refunded one; cancellation does NOT auto-trigger refund status

4. **Given** an order or bag status changes
   **When** the webhook processes the event
   **Then** Supabase Realtime broadcasts status changes to connected clients (FR54)
   **And** the `orders` and `order_bags` tables are added to the `supabase_realtime` publication

5. **Given** a status change that warrants notification
   **When** the webhook processes shipped, delivered, or refunded events
   **Then** an email notification intent is recorded for Story 5.6 to process (FR23)
   **And** this story does NOT implement actual email sending — only marks the event type for future email pipeline

6. **Given** any webhook event
   **When** processed by the handler
   **Then** the handler returns 200 immediately (or as soon as processing completes — same synchronous constraint as Story 3.7)
   **And** all processing failures are logged to `webhook_events` with status "failed" + error_message

## Tasks / Subtasks

- [x] Task 1: Create Realtime migration for orders tables (AC: #4)
  - [x]Create `supabase/migrations/20260320000000_orders_realtime.sql`:

    ```sql
    -- Enable Realtime on orders and order_bags tables
    -- Story 5.2 — Order Status Webhooks Processing
    -- Uses DEFAULT replica identity (PK only) since clients use Realtime
    -- as a cache-invalidation signal, same pattern as carts (Epic 4 review fix).
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
    ALTER PUBLICATION supabase_realtime ADD TABLE order_bags;

    -- DEFAULT replica identity — PK in WAL is sufficient for cache-invalidation.
    -- Avoids WAL bloat from FULL (which logs entire old row on every UPDATE).
    -- Same decision as carts table (20260318000000_epic4_review_fixes.sql).
    ALTER TABLE orders REPLICA IDENTITY DEFAULT;
    ALTER TABLE order_bags REPLICA IDENTITY DEFAULT;
    ```

  - [x]Verify migration applies cleanly: `supabase db reset`

- [x] Task 2: Add order/bag webhook event types to TypeScript types (AC: #1, #2)
  - [x]Update `packages/shared/src/types/order.types.ts`:
    - Add to `WebhookEventType` union:
      ```typescript
      | "ORDER_UPDATED"
      | "ORDER_COMPLETED"
      | "ORDER_CANCELED"
      | "ORDER_REFUNDED"
      | "ORDER_RETURNED"
      | "BAG_SUBMITTED"
      | "BAG_ACCEPTED"
      | "BAG_SHIPPED"
      | "BAG_COMPLETED"
      | "BAG_CANCELED"
      | "BAG_REFUNDED"
      ```
    - Add new webhook payload interfaces:

      ```typescript
      /** Violet ORDER_* webhook payload */
      export interface OrderWebhookPayload {
        /** Violet order ID (numeric) */
        id: number;
        status: string; // Use string, not OrderStatus enum — Violet may send undocumented values
        app_order_id?: string; // Our appOrderId from submission
        customer_id?: number;
        date_last_modified?: string;
      }

      /** Violet BAG_* webhook payload */
      export interface BagWebhookPayload {
        /** Violet bag ID (numeric) */
        id: number;
        /** Violet order ID that owns this bag */
        order_id: number;
        status: string; // BagStatus — use string for forward-compat
        financial_status?: string; // BagFinancialStatus
        merchant_id: number;
        merchant_name?: string;
        tracking_number?: string;
        tracking_url?: string;
        carrier?: string;
        date_last_modified?: string;
      }
      ```

- [x] Task 3: Add Zod schemas for order/bag webhook payloads (AC: #1, #2)
  - [x]Update `packages/shared/src/schemas/webhook.schema.ts` (canonical Node source):
    - Add to `webhookEventTypeSchema` z.enum:
      ```typescript
      ("ORDER_UPDATED",
        "ORDER_COMPLETED",
        "ORDER_CANCELED",
        "ORDER_REFUNDED",
        "ORDER_RETURNED",
        "BAG_SUBMITTED",
        "BAG_ACCEPTED",
        "BAG_SHIPPED",
        "BAG_COMPLETED",
        "BAG_CANCELED",
        "BAG_REFUNDED");
      ```
    - Add new schemas:

      ```typescript
      export const violetOrderWebhookPayloadSchema = z.object({
        id: z.number(),
        status: z.string(),
        app_order_id: z.string().optional(),
        customer_id: z.number().optional(),
        date_last_modified: z.string().optional(),
      });

      export const violetBagWebhookPayloadSchema = z.object({
        id: z.number(),
        order_id: z.number(),
        status: z.string(),
        financial_status: z.string().optional(),
        merchant_id: z.number(),
        merchant_name: z.string().optional(),
        tracking_number: z.string().optional(),
        tracking_url: z.string().optional(),
        carrier: z.string().optional(),
        date_last_modified: z.string().optional(),
      });
      ```

  - [x]Update `supabase/functions/_shared/schemas.ts` (Deno copy — **MUST stay in sync**):
    - Mirror ALL changes from canonical source above
    - Add `export type` for `VioletOrderPayload` and `VioletBagPayload`

- [x] Task 4: Create order webhook processors (AC: #1, #2, #3, #5)
  - [x]Create `supabase/functions/handle-webhook/orderProcessors.ts`:

    ```typescript
    import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
    import type { VioletOrderPayload, VioletBagPayload } from "../_shared/schemas.ts";
    import { updateEventStatus } from "./processors.ts";

    /**
     * Derives the overall order status from its bags' statuses.
     *
     * Rules (FR25):
     * - All bags same status → that status
     * - Mixed with any SHIPPED → "PARTIALLY_SHIPPED"
     * - Mixed with any COMPLETED → "PARTIALLY_COMPLETED"
     * - Otherwise → highest-priority status wins
     *
     * CANCELED ≠ REFUNDED — these are tracked separately per AC#3.
     */
    async function deriveAndUpdateOrderStatus(
      supabase: SupabaseClient,
      violetOrderId: string,
    ): Promise<void> {
      // Fetch all bags for this order
      const { data: order } = await supabase
        .from("orders")
        .select("id, status")
        .eq("violet_order_id", violetOrderId)
        .single();

      if (!order) return; // Order not persisted yet (race condition with Story 5.1)

      const { data: bags } = await supabase
        .from("order_bags")
        .select("status")
        .eq("order_id", order.id);

      if (!bags || bags.length === 0) return;

      const statuses = bags.map((b) => b.status);
      const uniqueStatuses = [...new Set(statuses)];

      let derivedStatus: string;
      if (uniqueStatuses.length === 1) {
        // All bags have the same status
        derivedStatus = uniqueStatuses[0];
      } else if (statuses.some((s) => s === "SHIPPED") && statuses.some((s) => s !== "SHIPPED")) {
        derivedStatus = "PARTIALLY_SHIPPED";
      } else if (
        statuses.some((s) => s === "COMPLETED") &&
        statuses.some((s) => s !== "COMPLETED")
      ) {
        derivedStatus = "PARTIALLY_COMPLETED";
      } else {
        // Mixed states — use the "most advanced" status
        // Priority: COMPLETED > SHIPPED > ACCEPTED > SUBMITTED > IN_PROGRESS > CANCELED > REFUNDED
        derivedStatus = "PROCESSING";
      }

      // Only update if status actually changed
      if (order.status !== derivedStatus) {
        await supabase.from("orders").update({ status: derivedStatus }).eq("id", order.id);
      }
    }

    // ─── ORDER event processors ──────────────────────────────────────

    export async function processOrderUpdated(
      supabase: SupabaseClient,
      eventId: string,
      payload: VioletOrderPayload,
    ): Promise<void> {
      try {
        const { error } = await supabase
          .from("orders")
          .update({ status: payload.status })
          .eq("violet_order_id", String(payload.id));

        if (error) {
          await updateEventStatus(
            supabase,
            eventId,
            "failed",
            `Order update failed: ${error.message}`,
          );
          return;
        }
        await updateEventStatus(supabase, eventId, "processed");
      } catch (err) {
        await updateEventStatus(
          supabase,
          eventId,
          "failed",
          err instanceof Error ? err.message : "Unknown error",
        );
      }
    }

    export async function processOrderCompleted(
      supabase: SupabaseClient,
      eventId: string,
      payload: VioletOrderPayload,
    ): Promise<void> {
      // Same as ORDER_UPDATED — Violet already sets the final status
      return processOrderUpdated(supabase, eventId, payload);
    }

    export async function processOrderCanceled(
      supabase: SupabaseClient,
      eventId: string,
      payload: VioletOrderPayload,
    ): Promise<void> {
      return processOrderUpdated(supabase, eventId, payload);
    }

    export async function processOrderRefunded(
      supabase: SupabaseClient,
      eventId: string,
      payload: VioletOrderPayload,
    ): Promise<void> {
      return processOrderUpdated(supabase, eventId, payload);
    }

    export async function processOrderReturned(
      supabase: SupabaseClient,
      eventId: string,
      payload: VioletOrderPayload,
    ): Promise<void> {
      return processOrderUpdated(supabase, eventId, payload);
    }

    // ─── BAG event processors ────────────────────────────────────────

    export async function processBagUpdated(
      supabase: SupabaseClient,
      eventId: string,
      payload: VioletBagPayload,
    ): Promise<void> {
      try {
        const updateData: Record<string, unknown> = {
          status: payload.status,
        };
        if (payload.financial_status) {
          updateData.financial_status = payload.financial_status;
        }

        const { error } = await supabase
          .from("order_bags")
          .update(updateData)
          .eq("violet_bag_id", String(payload.id));

        if (error) {
          await updateEventStatus(
            supabase,
            eventId,
            "failed",
            `Bag update failed: ${error.message}`,
          );
          return;
        }

        // Derive order-level status from all bags
        await deriveAndUpdateOrderStatus(supabase, String(payload.order_id));

        await updateEventStatus(supabase, eventId, "processed");
      } catch (err) {
        await updateEventStatus(
          supabase,
          eventId,
          "failed",
          err instanceof Error ? err.message : "Unknown error",
        );
      }
    }

    export async function processBagShipped(
      supabase: SupabaseClient,
      eventId: string,
      payload: VioletBagPayload,
    ): Promise<void> {
      try {
        // BAG_SHIPPED includes tracking info — extract and persist
        const updateData: Record<string, unknown> = {
          status: payload.status,
        };
        if (payload.financial_status) updateData.financial_status = payload.financial_status;
        if (payload.tracking_number) updateData.tracking_number = payload.tracking_number;
        if (payload.tracking_url) updateData.tracking_url = payload.tracking_url;
        if (payload.carrier) updateData.carrier = payload.carrier;

        const { error } = await supabase
          .from("order_bags")
          .update(updateData)
          .eq("violet_bag_id", String(payload.id));

        if (error) {
          await updateEventStatus(
            supabase,
            eventId,
            "failed",
            `Bag shipped update failed: ${error.message}`,
          );
          return;
        }

        // Derive order-level status
        await deriveAndUpdateOrderStatus(supabase, String(payload.order_id));

        await updateEventStatus(supabase, eventId, "processed");
      } catch (err) {
        await updateEventStatus(
          supabase,
          eventId,
          "failed",
          err instanceof Error ? err.message : "Unknown error",
        );
      }
    }

    // Bag status processors that delegate to processBagUpdated
    export const processBagSubmitted = processBagUpdated;
    export const processBagAccepted = processBagUpdated;
    export const processBagCompleted = processBagUpdated;
    export const processBagCanceled = processBagUpdated;
    export const processBagRefunded = processBagUpdated;
    ```

- [x] Task 5: Update webhook handler switch statement (AC: #1, #2, #6)
  - [x]Update `supabase/functions/handle-webhook/index.ts`:
    - Add imports for new schemas and processors:
      ```typescript
      import {
        violetOrderWebhookPayloadSchema,
        violetBagWebhookPayloadSchema,
      } from "../_shared/schemas.ts";
      import {
        processOrderUpdated,
        processOrderCompleted,
        processOrderCanceled,
        processOrderRefunded,
        processOrderReturned,
        processBagSubmitted,
        processBagAccepted,
        processBagShipped,
        processBagCompleted,
        processBagCanceled,
        processBagRefunded,
      } from "./orderProcessors.ts";
      ```
    - Add new cases to the switch statement (AFTER existing OFFER*\*/PRODUCT_SYNC*\* cases, BEFORE default):

      ```typescript
      // ─── ORDER events (Story 5.2) ────────────────────────────
      case "ORDER_UPDATED": {
        const result = violetOrderWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(supabase, eventId, "failed", `Zod validation failed: ${result.error.message}`);
          break;
        }
        await processOrderUpdated(supabase, eventId, result.data);
        break;
      }
      case "ORDER_COMPLETED": {
        const result = violetOrderWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(supabase, eventId, "failed", `Zod validation failed: ${result.error.message}`);
          break;
        }
        await processOrderCompleted(supabase, eventId, result.data);
        break;
      }
      case "ORDER_CANCELED": {
        const result = violetOrderWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(supabase, eventId, "failed", `Zod validation failed: ${result.error.message}`);
          break;
        }
        await processOrderCanceled(supabase, eventId, result.data);
        break;
      }
      case "ORDER_REFUNDED": {
        const result = violetOrderWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(supabase, eventId, "failed", `Zod validation failed: ${result.error.message}`);
          break;
        }
        await processOrderRefunded(supabase, eventId, result.data);
        break;
      }
      case "ORDER_RETURNED": {
        const result = violetOrderWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(supabase, eventId, "failed", `Zod validation failed: ${result.error.message}`);
          break;
        }
        await processOrderReturned(supabase, eventId, result.data);
        break;
      }

      // ─── BAG events (Story 5.2) ──────────────────────────────
      case "BAG_SUBMITTED": {
        const result = violetBagWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(supabase, eventId, "failed", `Zod validation failed: ${result.error.message}`);
          break;
        }
        await processBagSubmitted(supabase, eventId, result.data);
        break;
      }
      case "BAG_ACCEPTED": {
        const result = violetBagWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(supabase, eventId, "failed", `Zod validation failed: ${result.error.message}`);
          break;
        }
        await processBagAccepted(supabase, eventId, result.data);
        break;
      }
      case "BAG_SHIPPED": {
        const result = violetBagWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(supabase, eventId, "failed", `Zod validation failed: ${result.error.message}`);
          break;
        }
        await processBagShipped(supabase, eventId, result.data);
        break;
      }
      case "BAG_COMPLETED": {
        const result = violetBagWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(supabase, eventId, "failed", `Zod validation failed: ${result.error.message}`);
          break;
        }
        await processBagCompleted(supabase, eventId, result.data);
        break;
      }
      case "BAG_CANCELED": {
        const result = violetBagWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(supabase, eventId, "failed", `Zod validation failed: ${result.error.message}`);
          break;
        }
        await processBagCanceled(supabase, eventId, result.data);
        break;
      }
      case "BAG_REFUNDED": {
        const result = violetBagWebhookPayloadSchema.safeParse(payload);
        if (!result.success) {
          await updateEventStatus(supabase, eventId, "failed", `Zod validation failed: ${result.error.message}`);
          break;
        }
        await processBagRefunded(supabase, eventId, result.data);
        break;
      }
      ```

- [x] Task 6: Create order status derivation utility for shared package (AC: #3)
  - [x]Create `packages/shared/src/utils/orderStatusDerivation.ts`:

    ```typescript
    /**
     * Derives a user-friendly order status from individual bag statuses.
     *
     * This logic mirrors the Edge Function's deriveAndUpdateOrderStatus()
     * but is available client-side for display purposes (e.g., when rendering
     * order lists before Realtime pushes the derived status).
     *
     * Rules (FR25):
     * - All bags same status → that status
     * - Any SHIPPED + non-SHIPPED → "PARTIALLY_SHIPPED"
     * - Any COMPLETED + non-COMPLETED → "PARTIALLY_COMPLETED"
     * - CANCELED ≠ REFUNDED — tracked separately
     */

    /** Map BagStatus to user-friendly display labels */
    export const BAG_STATUS_LABELS: Record<string, string> = {
      IN_PROGRESS: "Processing",
      SUBMITTED: "Processing",
      ACCEPTED: "Confirmed",
      SHIPPED: "Shipped",
      COMPLETED: "Delivered",
      CANCELED: "Canceled",
      REFUNDED: "Refunded",
      PARTIALLY_REFUNDED: "Partially Refunded",
      REJECTED: "Rejected",
    };

    /** Map derived order status to user-friendly display labels */
    export const ORDER_STATUS_LABELS: Record<string, string> = {
      IN_PROGRESS: "Processing",
      PROCESSING: "Processing",
      ACCEPTED: "Confirmed",
      SHIPPED: "Shipped",
      COMPLETED: "Delivered",
      CANCELED: "Canceled",
      REFUNDED: "Refunded",
      REJECTED: "Rejected",
      PARTIALLY_SHIPPED: "Partially Shipped",
      PARTIALLY_COMPLETED: "Partially Delivered",
    };

    export function deriveOrderStatusFromBags(bagStatuses: string[]): string {
      if (bagStatuses.length === 0) return "PROCESSING";

      const unique = [...new Set(bagStatuses)];

      if (unique.length === 1) {
        return unique[0];
      }

      // Mixed states — check for partial progress
      if (bagStatuses.some((s) => s === "SHIPPED") && bagStatuses.some((s) => s !== "SHIPPED")) {
        return "PARTIALLY_SHIPPED";
      }
      if (
        bagStatuses.some((s) => s === "COMPLETED") &&
        bagStatuses.some((s) => s !== "COMPLETED")
      ) {
        return "PARTIALLY_COMPLETED";
      }

      // Default for other mixed states
      return "PROCESSING";
    }

    /**
     * Returns a summary string for mixed bag states.
     * e.g., "2 of 3 items shipped" (FR25)
     */
    export function getBagStatusSummary(bagStatuses: string[], targetStatus: string): string {
      const matchCount = bagStatuses.filter((s) => s === targetStatus).length;
      const total = bagStatuses.length;
      const label = BAG_STATUS_LABELS[targetStatus]?.toLowerCase() ?? targetStatus.toLowerCase();
      return `${matchCount} of ${total} items ${label}`;
    }
    ```

  - [x]Export from `packages/shared/src/utils/index.ts`

- [x] Task 7: Unit tests for order status derivation (AC: #3)
  - [x]Create `packages/shared/src/utils/__tests__/orderStatusDerivation.test.ts`:
    - Test: all bags same status returns that status
    - Test: mixed SHIPPED/ACCEPTED returns PARTIALLY_SHIPPED
    - Test: mixed COMPLETED/SHIPPED returns PARTIALLY_COMPLETED
    - Test: empty bags returns PROCESSING
    - Test: single bag returns its status
    - Test: CANCELED and REFUNDED are not conflated
    - Test: `getBagStatusSummary` returns correct "X of Y items shipped" format
    - Test: `BAG_STATUS_LABELS` maps all known statuses
    - Test: `ORDER_STATUS_LABELS` maps all known statuses including derived ones

- [x] Task 8: Zod schema tests for order/bag webhook payloads (AC: #1, #2)
  - [x]Create `packages/shared/src/schemas/__tests__/orderWebhookSchemas.test.ts`:
    - Test: violetOrderWebhookPayloadSchema accepts valid order payload
    - Test: violetOrderWebhookPayloadSchema rejects missing id
    - Test: violetOrderWebhookPayloadSchema accepts optional fields missing
    - Test: violetBagWebhookPayloadSchema accepts valid bag payload with tracking
    - Test: violetBagWebhookPayloadSchema accepts bag without tracking info
    - Test: violetBagWebhookPayloadSchema rejects missing order_id
    - Test: webhookEventTypeSchema accepts all new ORDER*\* and BAG*\* types
    - Test: webhookEventTypeSchema rejects unknown types (e.g., "CART_UPDATED")

- [x] Task 9: Integration verification (AC: #1-#6)
  - [x]Verify migration applies cleanly: `supabase db reset`
  - [x]Verify Zod schemas are identical between canonical and Edge Function copies
  - [x]Verify all new event types appear in both `webhookEventTypeSchema` copies
  - [x]Run `bun run fix-all` — 0 errors, 0 warnings
  - [x]Run `bun --cwd=apps/web run test` — all tests pass (existing + new)
  - [x]Verify TypeScript types compile: `bun run typecheck`

## Dev Notes

### Critical Architecture Constraints

- **Existing webhook infrastructure is production-ready** — Story 3.7 built a complete pipeline: HMAC validation, idempotency, two-phase header validation, event routing, processor pattern. Story 5.2 EXTENDS this infrastructure — do NOT rebuild it. Add new event types + processors only.

- **Two-phase header validation already handles unknown events** — The handler returns 200 for unknown event types (e.g., ORDER\_\* before 5.2 is deployed). Once Story 5.2 is deployed, these events will be routed to the new processors. The existing Phase 2 comment even says "e.g., ORDER_UPDATED before Story 5.2 is deployed."

- **Dual Zod schema copies (Deno/Node boundary)** — Schemas exist in TWO places:
  1. `packages/shared/src/schemas/webhook.schema.ts` (canonical, Node/Bun)
  2. `supabase/functions/_shared/schemas.ts` (Deno copy for Edge Functions)
     Both files have `⚠️ SYNC WARNING` JSDoc. **MUST update both simultaneously.** Any drift will cause webhook validation failures.

- **`updateEventStatus()` is already exported** — From `processors.ts`. Import it in `orderProcessors.ts`. Do NOT duplicate.

- **Synchronous processing constraint** — Same as Story 3.7: Supabase Edge Functions (Deno) have NO `waitUntil()`. Processing runs inline before 200 response. The idempotency check mitigates timeout risk on retries. Order/bag status updates are fast DB writes (no OpenAI calls like OFFER_ADDED), so timeout is very unlikely.

- **Supabase Realtime via DB writes** — No explicit Realtime broadcast needed. Adding `orders` and `order_bags` to `supabase_realtime` publication means ANY UPDATE to these tables automatically broadcasts via WebSocket. The status update in the processor triggers Realtime. Clients subscribe to `orders:user_{userId}` channel pattern (per architecture.md).

- **REPLICA IDENTITY DEFAULT, not FULL** — Same pattern as carts table (Epic 4 review fix). Since clients use Realtime as a cache-invalidation signal (they re-fetch from Supabase/Violet on change), only the PK needs to be in the WAL. FULL would bloat WAL unnecessarily.

- **`orders.violet_order_id` is TEXT, not UUID** — Violet order IDs are numeric stored as strings. The `eq("violet_order_id", String(payload.id))` pattern in processors converts the numeric webhook payload to string for lookup.

- **CANCELED ≠ REFUNDED** — Per AC#3, these are distinct states. A bag can be CANCELED without being REFUNDED (e.g., merchant cancels before shipping). The refund flow is handled separately in Story 5.5 which adds an `order_refunds` table. Do NOT auto-set refund status on cancellation.

- **`order_id` in BAG\_\* payloads** — Violet includes the parent order ID in bag webhook payloads. This is used to look up the Supabase `orders` row and derive the order-level status after each bag update.

- **Email notifications deferred to Story 5.6** — This story records the event type in `webhook_events` (it's already stored) but does NOT implement email sending. Story 5.6 creates `supabase/functions/send-notification/index.ts` with transactional email. For now, the webhook_events audit trail IS the notification intent record.

### Existing Code Patterns to Follow

```typescript
// Processor pattern (from processors.ts):
export async function processOfferAdded(
  supabase: SupabaseClient,
  eventId: string,
  payload: VioletOfferPayload,
): Promise<void> {
  try {
    // ... business logic with supabase calls ...
    await updateEventStatus(supabase, eventId, "processed");
  } catch (err) {
    await updateEventStatus(supabase, eventId, "failed",
      err instanceof Error ? err.message : "Unknown error");
  }
}

// Alias pattern for identical logic:
export const processOfferDeleted = processOfferRemoved;

// Deno import pattern (Edge Functions):
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { VioletOfferPayload } from "../_shared/schemas.ts";

// Zod schema pattern:
export const violetOfferWebhookPayloadSchema = z.object({
  id: z.number(),
  status: z.string(),  // NOT z.enum — Violet may send undocumented values
  // ...
});

// Switch case pattern (index.ts):
case "OFFER_ADDED": {
  const result = violetOfferWebhookPayloadSchema.safeParse(payload);
  if (!result.success) {
    await updateEventStatus(supabase, eventId, "failed",
      `Zod validation failed: ${result.error.message}`);
    break;
  }
  await processOfferAdded(supabase, eventId, result.data);
  break;
}
```

### Existing Files to Understand Before Coding

| File                                                           | What's there                                                                                     | What to change                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `supabase/functions/handle-webhook/index.ts`                   | 350-line webhook handler with HMAC, idempotency, switch routing for OFFER*\* and PRODUCT_SYNC*\* | ADD switch cases for ORDER*\* and BAG*\* events, import new schemas + processors      |
| `supabase/functions/handle-webhook/processors.ts`              | OFFER*\* and PRODUCT_SYNC*\* processors, `updateEventStatus()` utility                           | Do NOT modify — import `updateEventStatus` in orderProcessors.ts                      |
| `supabase/functions/_shared/schemas.ts`                        | Zod schemas for webhook headers + offer/sync payloads. 190 lines                                 | ADD order/bag payload schemas, extend webhookEventTypeSchema enum                     |
| `supabase/functions/_shared/webhookAuth.ts`                    | HMAC validation + header extraction. 86 lines                                                    | Do NOT modify — reused as-is                                                          |
| `packages/shared/src/schemas/webhook.schema.ts`                | Canonical Node-side Zod schemas. 135 lines                                                       | ADD order/bag payload schemas + extend enum (sync with Deno copy)                     |
| `packages/shared/src/types/order.types.ts`                     | WebhookEventType union, OrderStatus, BagStatus, OrderDetail, WebhookEvent                        | EXTEND WebhookEventType union, ADD OrderWebhookPayload + BagWebhookPayload interfaces |
| `supabase/migrations/20260319000000_orders.sql`                | Orders + order_bags + order_items tables with RLS (Story 5.1)                                    | Do NOT modify — Realtime enablement goes in new migration                             |
| `supabase/migrations/20260316000000_enable_carts_realtime.sql` | Carts Realtime enablement pattern (reference for orders)                                         | Do NOT modify — reference for migration pattern                                       |
| `packages/shared/src/utils/constants.ts`                       | queryKeys factory with orders.all(), orders.list(), orders.detail()                              | Do NOT modify — already has order query keys                                          |

### Previous Story Intelligence (from Story 5.1)

- **D1**: `expo-clipboard` not installed — mobile used `Alert.alert()` as fallback for guest token display. Story 5.3 (tracking view) may need clipboard.
- **D2**: Mobile app has no `(tabs)` layout group — `router.replace("/(tabs)")` is invalid, use `router.replace("/")`.
- **D3**: Pre-existing test failures in `webhookSchemas.test.ts` (2 tests) — unrelated to Story 5.1 changes. Verify if still present and whether adding new event types fixes/breaks them.
- **Story 5.1 created**: orders + order_bags + order_items tables, `persistOrder()` utility, `persistAndConfirmOrderFn` server function, guest token auth in Edge Function.
- **service_role ALL policy** already exists on orders, order_bags, order_items — the webhook processor (running as service_role via `getSupabaseAdmin()`) can UPDATE these tables.

### Git Intelligence (from recent commits)

- Latest: `5f71f5f feat: implement order confirmation & data persistence (Story 5.1) + code review fixes`
- Story 5.1 pattern: shared types → shared utils → migration → Edge Function update → tests → fix-all
- Conventional commit: `feat: <description> (Story X.Y) + code review fixes`
- Story 5.2 is purely backend (no UI changes) — simpler scope than 5.1

### Violet API Reference — Story 5.2

**Order Webhook Event Types:**

| Event           | Trigger                           | Payload Key Fields       |
| --------------- | --------------------------------- | ------------------------ |
| ORDER_UPDATED   | Any order state change            | id, status, app_order_id |
| ORDER_COMPLETED | Order fully fulfilled             | id, status               |
| ORDER_CANCELED  | Order canceled by merchant/system | id, status               |
| ORDER_REFUNDED  | Full refund processed             | id, status               |
| ORDER_RETURNED  | Return processed                  | id, status               |

**Bag Webhook Event Types:**

| Event         | Trigger                   | Payload Key Fields                                           |
| ------------- | ------------------------- | ------------------------------------------------------------ |
| BAG_SUBMITTED | Bag submitted to merchant | id, order_id, status, merchant_id                            |
| BAG_ACCEPTED  | Merchant accepts bag      | id, order_id, status                                         |
| BAG_SHIPPED   | Bag shipped with tracking | id, order_id, status, tracking_number, tracking_url, carrier |
| BAG_COMPLETED | All items delivered       | id, order_id, status                                         |
| BAG_CANCELED  | Merchant cancels bag      | id, order_id, status                                         |
| BAG_REFUNDED  | Refund processed for bag  | id, order_id, status, financial_status                       |

**Violet Order State Machine:**

```
IN_PROGRESS → PROCESSING → COMPLETED (happy path)
IN_PROGRESS → PROCESSING → REQUIRES_ACTION → PROCESSING → COMPLETED (3DS)
IN_PROGRESS → PROCESSING → REJECTED (payment failure)
COMPLETED → CANCELED (post-fulfillment cancellation)
```

**Violet Bag State Machine:**

```
IN_PROGRESS → SUBMITTED → ACCEPTED → SHIPPED → COMPLETED (happy path)
ACCEPTED → CANCELED (merchant cancellation — NO auto-refund)
COMPLETED → REFUNDED (return + refund — terminal)
COMPLETED → PARTIALLY_REFUNDED (partial return)
```

**Webhook Delivery:**

- Same retry policy as OFFER\_\* events: 10 attempts over 24h with exponential backoff
- Same HMAC-SHA256 authentication
- Same headers: X-Violet-Hmac, X-Violet-Event-Id, X-Violet-Topic
- **CRITICAL**: Return 2xx always (except HMAC failure → 401)

### Status Derivation Rules (FR25)

```
Order with 3 bags: [SHIPPED, SHIPPED, SHIPPED] → SHIPPED
Order with 3 bags: [SHIPPED, ACCEPTED, ACCEPTED] → PARTIALLY_SHIPPED
Order with 3 bags: [COMPLETED, COMPLETED, SHIPPED] → PARTIALLY_COMPLETED
Order with 3 bags: [CANCELED, CANCELED, CANCELED] → CANCELED
Order with 3 bags: [CANCELED, REFUNDED, COMPLETED] → PROCESSING (mixed terminal states)
Order with 1 bag: [SHIPPED] → SHIPPED
```

**User-facing status labels (FR25):**

- IN_PROGRESS → "Processing"
- SUBMITTED → "Processing"
- ACCEPTED → "Confirmed"
- SHIPPED → "Shipped"
- COMPLETED → "Delivered"
- CANCELED → "Canceled"
- REFUNDED → "Refunded"
- PARTIALLY_SHIPPED → "Partially Shipped"
- PARTIALLY_COMPLETED → "Partially Delivered"

### Supabase Realtime Setup

**Channel convention** (from architecture.md):

```typescript
"orders:user_{userId}"; // User's order updates
```

**What clients do** (Story 5.3 will implement this — NOT Story 5.2):

```typescript
// Client subscribes to order changes for their user
const channel = supabase
  .channel(`orders:user_${userId}`)
  .on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "orders",
      filter: `user_id=eq.${userId}`,
    },
    (payload) => {
      // Invalidate TanStack Query cache to re-fetch
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all() });
    },
  )
  .subscribe();
```

**What Story 5.2 does:**

1. Migration adds orders + order_bags to `supabase_realtime` publication
2. Webhook processors UPDATE rows → Realtime fires automatically
3. No explicit broadcast code needed in processors

### Project Structure Notes

- New migration: `supabase/migrations/20260320000000_orders_realtime.sql` (next after 20260319000000)
- New processor file: `supabase/functions/handle-webhook/orderProcessors.ts` (separate from `processors.ts` for OFFER\_\* events)
- New shared util: `packages/shared/src/utils/orderStatusDerivation.ts`
- New tests: 2 test files (orderStatusDerivation + orderWebhookSchemas)
- Updated files: 4 (handle-webhook/index.ts, schemas.ts Deno + Node copies, order.types.ts)
- **NO UI changes** — Story 5.3 handles the tracking view, Story 5.6 handles emails

### References

- [Source: epics.md#Story 5.2 — Order Status Webhooks Processing acceptance criteria]
- [Source: prd.md#FR22 — Order confirmation with summary, tracking, estimated delivery]
- [Source: prd.md#FR23 — Email notifications for order status changes]
- [Source: prd.md#FR25 — Map Violet bag-level states to user-facing unified status]
- [Source: prd.md#NFR14 — Webhook endpoints must validate request authenticity]
- [Source: prd.md#NFR26 — Zero lost order status updates; retry failed webhook processing]
- [Source: architecture.md#Webhook Event Processing — HMAC → deduplicate → process → Realtime]
- [Source: architecture.md#Supabase Realtime Channel Convention — "orders:user_{userId}"]
- [Source: architecture.md#Data Ownership — Orders: Violet API + Supabase mirror, webhook updates → Realtime]
- [Source: architecture.md#Communication — Realtime: Supabase channels for order status updates]
- [Source: 5-1-order-confirmation-data-persistence.md — Previous story, orders table schema, persistence patterns]
- [Source: 3-7-product-catalog-sync-via-webhooks.md — Webhook infrastructure implementation, code review fixes]
- [Source: supabase/functions/handle-webhook/index.ts — Existing webhook handler with two-phase validation]
- [Source: supabase/functions/handle-webhook/processors.ts — Processor pattern, updateEventStatus utility]
- [Source: supabase/functions/_shared/schemas.ts — Deno Zod schemas (must sync with Node copy)]
- [Source: supabase/functions/_shared/webhookAuth.ts — HMAC validation, header extraction]
- [Source: packages/shared/src/types/order.types.ts — OrderStatus, BagStatus, BagFinancialStatus, WebhookEventType]
- [Source: packages/shared/src/schemas/webhook.schema.ts — Canonical Node-side webhook Zod schemas]
- [Source: supabase/migrations/20260316000000_enable_carts_realtime.sql — Realtime enablement migration pattern]
- [Source: supabase/migrations/20260318000000_epic4_review_fixes.sql — REPLICA IDENTITY DEFAULT rationale]
- [Source: supabase/migrations/20260319000000_orders.sql — Orders table schema (Story 5.1)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

- D1: Status derivation priority fix — initial implementation checked SHIPPED before COMPLETED, causing `["COMPLETED", "COMPLETED", "SHIPPED"]` to return "PARTIALLY_SHIPPED" instead of "PARTIALLY_COMPLETED". Fixed by reordering checks: COMPLETED first (more advanced state), then SHIPPED. Applied to both shared util and Edge Function processor.
- D2: Pre-existing test failures fixed — `webhookSchemas.test.ts` had 2 stale tests: (1) "rejects ORDER\_\* event types" now expects acceptance since Story 5.2 implements them, (2) "rejects invalid status value" was wrong since Epic 3 Review Fix I3 changed status to `z.string()`. Both fixed.
- D3: Pre-existing `violetCartAdapter.test.ts` failure (1 test) — unrelated to Story 5.2. Same issue noted in Story 5.1 D3.

### Completion Notes List

- Task 1: Created `20260320000000_orders_realtime.sql` — enables Supabase Realtime on orders + order_bags tables with DEFAULT replica identity (PK only, same pattern as carts table).
- Task 2: Extended `WebhookEventType` union in `order.types.ts` with 11 new event types (5 ORDER*\* + 6 BAG*\*). Added `OrderWebhookPayload` and `BagWebhookPayload` interfaces. Exported from `types/index.ts`.
- Task 3: Added `violetOrderWebhookPayloadSchema` and `violetBagWebhookPayloadSchema` Zod schemas to BOTH `packages/shared/src/schemas/webhook.schema.ts` (canonical) and `supabase/functions/_shared/schemas.ts` (Deno copy). Extended `webhookEventTypeSchema` enum in both files. All schemas and types stay in sync.
- Task 4: Created `supabase/functions/handle-webhook/orderProcessors.ts` — 5 ORDER*\* processors (all delegate to `processOrderUpdated` which updates `orders.status`), 6 BAG*\* processors (generic `processBagUpdated` + specialized `processBagShipped` for tracking info). `deriveAndUpdateOrderStatus()` computes order-level status from all bags after each bag update.
- Task 5: Added 11 new switch cases to `handle-webhook/index.ts` (5 ORDER*\* + 6 BAG*\_), following exact same pattern as existing OFFER\_\_ cases. Imported new schemas and processors.
- Task 6: Created `packages/shared/src/utils/orderStatusDerivation.ts` — client-side status derivation + label maps (`BAG_STATUS_LABELS`, `ORDER_STATUS_LABELS`) + `getBagStatusSummary()` utility. Exported from `utils/index.ts`.
- Task 7: Created `orderStatusDerivation.test.ts` — 15 tests covering derivation logic, summary formatting, and label maps. All pass.
- Task 8: Created `orderWebhookSchemas.test.ts` — 22 tests covering order/bag payload validation + event type enum. Fixed 2 pre-existing stale tests in `webhookSchemas.test.ts`. All pass.
- Task 9: `bun run fix-all` — 0 errors, 0 warnings. 150 web tests pass. 213/214 shared tests pass (1 pre-existing failure in violetCartAdapter unrelated to Story 5.2). TypeScript compiles clean.

### Change Log

- 2026-03-16: Story 5.2 implementation — order status webhooks processing (9 tasks completed)
- 2026-03-16: Code review — 6 fixes applied (H1: ORDER_STATUS_LABELS missing SUBMITTED/PARTIALLY_REFUNDED, H2: deriveAndUpdateOrderStatus .update() error handling, H3: .select() error handling, M1: getBagStatusSummary "items"→"packages", M2: switch case deduplication, M3: added SUBMITTED/PARTIALLY_REFUNDED/REJECTED tests)

### File List

- `supabase/migrations/20260320000000_orders_realtime.sql` — NEW: Enable Realtime on orders + order_bags tables
- `packages/shared/src/types/order.types.ts` — Added 11 webhook event types + OrderWebhookPayload + BagWebhookPayload interfaces
- `packages/shared/src/types/index.ts` — Added OrderWebhookPayload, BagWebhookPayload exports
- `packages/shared/src/schemas/webhook.schema.ts` — Added order/bag event types to enum + 2 new payload schemas + 2 new types
- `supabase/functions/_shared/schemas.ts` — Mirrored all changes from canonical webhook.schema.ts (Deno copy)
- `supabase/functions/handle-webhook/orderProcessors.ts` — NEW: Order/bag webhook processors with status derivation
- `supabase/functions/handle-webhook/index.ts` — Added 11 switch cases + imports for ORDER*\*/BAG*\* events
- `packages/shared/src/utils/orderStatusDerivation.ts` — NEW: Client-side status derivation + label maps
- `packages/shared/src/utils/index.ts` — Added orderStatusDerivation exports
- `packages/shared/src/utils/__tests__/orderStatusDerivation.test.ts` — NEW: 15 unit tests
- `packages/shared/src/schemas/__tests__/orderWebhookSchemas.test.ts` — NEW: 22 Zod schema tests
- `packages/shared/src/schemas/__tests__/webhookSchemas.test.ts` — Fixed 2 pre-existing stale tests (ORDER\_\* now accepted, status is z.string())
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Sprint status sync
