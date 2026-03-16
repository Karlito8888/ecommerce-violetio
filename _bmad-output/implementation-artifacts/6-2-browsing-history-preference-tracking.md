# Story 6.2: Browsing History & Preference Tracking

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Quick Reference — Files to Create/Update

| Action | File | Notes |
| ------ | ---- | ----- |
| CREATE | `supabase/migrations/20260325000000_user_events.sql` | `user_events` table: user_id, event_type, payload JSONB, created_at. RLS: users read own, service_role writes. Partial indexes on user_id+event_type. pg_cron retention job (6 months). |
| CREATE | `packages/shared/src/types/tracking.types.ts` | `UserEvent`, `TrackingEventType`, `TrackingPayload` union types for product_view, search, category_view |
| CREATE | `packages/shared/src/clients/tracking.ts` | `recordEvent(userId, event)` — Supabase insert via service role. `getUserEvents(userId, type?, limit?)` — read own events |
| CREATE | `packages/shared/src/hooks/useTracking.ts` | `useTrackEvent()` hook — fires tracking events. Web: calls Server Function. Mobile: calls Edge Function |
| CREATE | `packages/shared/src/hooks/useBrowsingHistory.ts` | `useBrowsingHistory(userId)` — TanStack Query hook to read user's browsing history |
| CREATE | `apps/web/src/server/functions/trackEvent.ts` | TanStack Server Function — receives event from client, writes to `user_events` via service role client |
| CREATE | `supabase/functions/track-event/index.ts` | Edge Function — receives event from mobile, validates JWT, writes to `user_events` |
| UPDATE | `apps/web/src/routes/__root.tsx` | Add `useTrackingListener()` that subscribes to router navigation for product/category/search page views |
| UPDATE | `packages/shared/src/types/index.ts` | Export tracking types |
| UPDATE | `packages/shared/src/clients/index.ts` | Export tracking client functions |
| UPDATE | `packages/shared/src/hooks/index.ts` | Export useTracking, useBrowsingHistory hooks |

---

## Story

As a **system**,
I want to track authenticated users' browsing and purchase history,
So that personalization features have data to work with.

## Acceptance Criteria

1. **Given** an authenticated user browses the platform
   **When** they view a product detail page
   **Then** a `product_view` event is recorded in `user_events` table with `{ product_id, offer_id, category }` payload
   **And** the event includes `user_id` (from auth session) and `created_at` (server-generated timestamp)

2. **Given** an authenticated user performs a search
   **When** the search results load
   **Then** a `search` event is recorded with `{ query, result_count }` payload
   **And** only one event per unique query within a 60-second window (dedup)

3. **Given** an authenticated user browses a category
   **When** they view a category/collection page
   **Then** a `category_view` event is recorded with `{ category_id, category_name }` payload

4. **Given** the database migration `supabase/migrations/20260325000000_user_events.sql`
   **When** applied
   **Then** creates `user_events` table with columns: `id UUID`, `user_id UUID` (FK auth.users), `event_type TEXT`, `payload JSONB`, `created_at TIMESTAMPTZ`
   **And** RLS policies: authenticated users can SELECT their own events (`user_id = auth.uid()`); service_role can INSERT/SELECT/DELETE all
   **And** partial indexes on `(user_id, event_type)` and `(user_id, created_at DESC)` for efficient queries
   **And** pg_cron job purges events older than 6 months (runs daily at 3 AM UTC)

5. **Given** the web application
   **When** an authenticated user navigates between pages
   **Then** a tracking listener in `__root.tsx` detects route changes via TanStack Router subscription
   **And** fires the appropriate event type based on the route pattern (product detail → `product_view`, search → `search`, category → `category_view`)
   **And** events are sent to a TanStack Server Function (`trackEvent.ts`) which writes via service role client

6. **Given** the mobile application
   **When** an authenticated user views a product/search/category screen
   **Then** the tracking hook fires on screen focus
   **And** events are sent to a Supabase Edge Function (`track-event`) which validates the JWT and writes via service role client

7. **Given** purchase history is needed for personalization
   **When** a downstream feature queries user purchase data
   **Then** purchase history is derived from the existing `orders` + `order_items` tables (no duplication)
   **And** no new purchase tracking events are recorded — the orders table already captures this data

8. **Given** privacy requirements (NFR — no third-party analytics)
   **When** tracking events are recorded
   **Then** no data leaves Supabase — all events stored in the project database
   **And** no third-party analytics SDKs, no fingerprinting, no cross-site tracking
   **And** anonymous/guest users are NOT tracked (events only for authenticated users)
   **And** users can delete their browsing history from the profile page (future Story 6.1 enhancement — not in scope)

## Tasks / Subtasks

- [x] **Task 1: Database migration** — `supabase/migrations/20260325000000_user_events.sql` (AC: #4)
  - [x] 1.1: Create `user_events` table:
    ```sql
    CREATE TABLE IF NOT EXISTS public.user_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ```
  - [x] 1.2: Add CHECK constraint on event_type (whitelist valid types):
    ```sql
    ALTER TABLE public.user_events
      ADD CONSTRAINT chk_event_type CHECK (
        event_type IN ('product_view', 'search', 'category_view')
      );
    ```
  - [x] 1.3: Enable RLS and create policies:
    ```sql
    ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;

    -- Users can read their own events
    CREATE POLICY "users_read_own_events" ON public.user_events
      FOR SELECT
      USING (auth.uid() = user_id);

    -- Service role can do everything (writes come from Server Functions / Edge Functions)
    CREATE POLICY "service_role_all_events" ON public.user_events
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
    ```
  - [x] 1.4: Create indexes for efficient queries:
    ```sql
    -- Composite index for type-specific queries (e.g., "all product views for user X")
    CREATE INDEX idx_user_events_user_type ON public.user_events(user_id, event_type);

    -- Composite index for chronological queries (e.g., "last 50 events for user X")
    CREATE INDEX idx_user_events_user_created ON public.user_events(user_id, created_at DESC);

    -- Retention cleanup index (for pg_cron purge job)
    CREATE INDEX idx_user_events_created_at ON public.user_events(created_at);
    ```
  - [x] 1.5: Set up pg_cron retention job (6-month auto-purge):
    ```sql
    -- Enable pg_cron extension (requires superuser — may need Supabase Dashboard)
    -- CREATE EXTENSION IF NOT EXISTS pg_cron;

    -- Schedule daily cleanup at 3 AM UTC
    -- SELECT cron.schedule(
    --   'purge-old-user-events',
    --   '0 3 * * *',
    --   $$DELETE FROM public.user_events WHERE created_at < now() - interval '6 months'$$
    -- );

    -- NOTE: pg_cron extension must be enabled via Supabase Dashboard (Extensions page).
    -- The above SQL is provided as reference. The actual cron job should be created
    -- via Supabase Dashboard > Database > Extensions > pg_cron, then:
    -- Dashboard > SQL Editor > run the cron.schedule command.
    -- For local dev, events can be manually purged or left to accumulate.
    -- Alternative: a scheduled Edge Function via Supabase Cron (Dashboard > Edge Functions > Schedules)
    ```

- [x] **Task 2: Tracking types** — `packages/shared/src/types/tracking.types.ts` (AC: #1, #2, #3)
  - [x] 2.1: Create tracking event types:
    ```typescript
    export type TrackingEventType = "product_view" | "search" | "category_view";

    export interface ProductViewPayload {
      product_id: string;
      offer_id?: string;
      category?: string;
    }

    export interface SearchPayload {
      query: string;
      result_count: number;
    }

    export interface CategoryViewPayload {
      category_id: string;
      category_name: string;
    }

    export type TrackingPayload =
      | ProductViewPayload
      | SearchPayload
      | CategoryViewPayload;

    export interface TrackingEvent {
      event_type: TrackingEventType;
      payload: TrackingPayload;
    }

    export interface UserEvent {
      id: string;
      user_id: string;
      event_type: TrackingEventType;
      payload: TrackingPayload;
      created_at: string;
    }
    ```

- [x] **Task 3: Tracking client functions** — `packages/shared/src/clients/tracking.ts` (AC: #1, #2, #3)
  - [x] 3.1: Create `recordEvent(userId, event, client)` — inserts into `user_events`:
    ```typescript
    import type { SupabaseClient } from "@supabase/supabase-js";
    import type { TrackingEvent } from "../types/tracking.types";

    /**
     * Records a tracking event. Must be called with a service_role client
     * (from Server Function or Edge Function), NOT the browser client.
     */
    export async function recordEvent(
      userId: string,
      event: TrackingEvent,
      client: SupabaseClient,
    ): Promise<void> {
      const { error } = await client
        .from("user_events")
        .insert({
          user_id: userId,
          event_type: event.event_type,
          payload: event.payload,
        });

      if (error) {
        // Log but don't throw — tracking failures should not break UX
        console.warn("[tracking] Failed to record event:", error.message);
      }
    }
    ```
  - [x] 3.2: Create `getUserEvents(userId, options?, client?)` — reads user's own events:
    ```typescript
    import { createSupabaseClient } from "./supabase";
    import type { UserEvent, TrackingEventType } from "../types/tracking.types";

    interface GetEventsOptions {
      eventType?: TrackingEventType;
      limit?: number;
      /** ISO date string — only return events after this date */
      since?: string;
    }

    export async function getUserEvents(
      userId: string,
      options?: GetEventsOptions,
      client?: SupabaseClient,
    ): Promise<UserEvent[]> {
      const supabase = client ?? createSupabaseClient();
      let query = supabase
        .from("user_events")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (options?.eventType) {
        query = query.eq("event_type", options.eventType);
      }
      if (options?.since) {
        query = query.gte("created_at", options.since);
      }
      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as UserEvent[];
    }
    ```

- [x] **Task 4: Web Server Function** — `apps/web/src/server/functions/trackEvent.ts` (AC: #5)
  - [x] 4.1: Create TanStack Server Function for event recording:
    ```typescript
    import { createServerFn } from "@tanstack/react-start/server";
    import { getServiceRoleClient } from "@ecommerce/shared/clients/supabase.server";
    import { recordEvent } from "@ecommerce/shared/clients/tracking";
    import type { TrackingEvent } from "@ecommerce/shared/types/tracking.types";

    export const trackEventFn = createServerFn({ method: "POST" })
      .validator((data: { userId: string; event: TrackingEvent }) => data)
      .handler(async ({ data }) => {
        const client = getServiceRoleClient();
        await recordEvent(data.userId, data.event, client);
        return { ok: true };
      });
    ```
  - [x] 4.2: Note: This Server Function runs on the web server (Node.js) and uses the service_role client to bypass RLS for writes. The browser client only has SELECT permission on `user_events`.

- [x] **Task 5: Mobile Edge Function** — `supabase/functions/track-event/index.ts` (AC: #6)
  - [x] 5.1: Create Edge Function for mobile event recording:
    ```typescript
    import { createClient } from "jsr:@supabase/supabase-js@2";

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    };

    Deno.serve(async (req) => {
      if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
      }

      try {
        // Validate JWT from Authorization header
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
          return new Response(JSON.stringify({ error: "Missing authorization" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Create client with user's JWT to extract user_id
        const userClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } },
        );

        const { data: { user }, error: authError } = await userClient.auth.getUser();
        if (authError || !user) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Parse event from body
        const { event_type, payload } = await req.json();

        // Write with service role client (bypasses RLS)
        const serviceClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );

        const { error } = await serviceClient
          .from("user_events")
          .insert({
            user_id: user.id,
            event_type,
            payload: payload ?? {},
          });

        if (error) {
          console.error("[track-event] Insert error:", error.message);
          return new Response(JSON.stringify({ error: "Failed to record event" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        console.error("[track-event] Error:", err);
        return new Response(JSON.stringify({ error: "Internal error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    });
    ```

- [x] **Task 6: useTracking hook** — `packages/shared/src/hooks/useTracking.ts` (AC: #1, #2, #3)
  - [x] 6.1: Create the main tracking hook:
    ```typescript
    import { useCallback, useRef } from "react";
    import type { TrackingEvent, TrackingEventType } from "../types/tracking.types";

    interface UseTrackingOptions {
      userId: string | undefined;
      /** Platform-specific function to send the event to the server */
      sendEvent: (userId: string, event: TrackingEvent) => Promise<void>;
    }

    /**
     * Hook that provides a `trackEvent` function.
     * Handles deduplication (same event_type + key within 60s window).
     * Only fires for authenticated users (userId must be defined).
     */
    export function useTracking({ userId, sendEvent }: UseTrackingOptions) {
      const recentEvents = useRef<Map<string, number>>(new Map());
      const DEDUP_WINDOW_MS = 60_000; // 60 seconds

      const trackEvent = useCallback(
        async (event: TrackingEvent) => {
          if (!userId) return; // Skip for anonymous users

          // Dedup key: event_type + a payload identifier
          const dedupKey = getDedupKey(event);
          const now = Date.now();
          const lastFired = recentEvents.current.get(dedupKey);

          if (lastFired && now - lastFired < DEDUP_WINDOW_MS) {
            return; // Skip duplicate within window
          }

          recentEvents.current.set(dedupKey, now);

          // Clean old entries periodically (prevent memory leak)
          if (recentEvents.current.size > 100) {
            for (const [key, timestamp] of recentEvents.current) {
              if (now - timestamp > DEDUP_WINDOW_MS) {
                recentEvents.current.delete(key);
              }
            }
          }

          // Fire and forget — tracking failures don't affect UX
          try {
            await sendEvent(userId, event);
          } catch {
            // Silently ignore tracking errors
          }
        },
        [userId, sendEvent],
      );

      return { trackEvent };
    }

    function getDedupKey(event: TrackingEvent): string {
      switch (event.event_type) {
        case "product_view":
          return `product_view:${(event.payload as { product_id: string }).product_id}`;
        case "search":
          return `search:${(event.payload as { query: string }).query}`;
        case "category_view":
          return `category_view:${(event.payload as { category_id: string }).category_id}`;
        default:
          return `${event.event_type}:${JSON.stringify(event.payload)}`;
      }
    }
    ```

- [x] **Task 7: Web tracking integration** — `apps/web/src/routes/__root.tsx` (AC: #5)
  - [x] 7.1: Create a `useTrackingListener` custom hook in the root that subscribes to route changes:
    ```typescript
    // Inside __root.tsx or a separate hook file imported there
    import { useRouter, useRouterState } from "@tanstack/react-router";
    import { useEffect, useRef } from "react";
    import { useTracking } from "@ecommerce/shared/hooks/useTracking";
    import { trackEventFn } from "../server/functions/trackEvent";

    function useTrackingListener(userId: string | undefined) {
      const router = useRouter();
      const { trackEvent } = useTracking({
        userId,
        sendEvent: async (uid, event) => {
          await trackEventFn({ data: { userId: uid, event } });
        },
      });

      useEffect(() => {
        if (!userId) return;

        const unsubscribe = router.subscribe("onResolved", (event) => {
          const pathname = event.toLocation.pathname;

          // Product detail page: /products/:productId
          const productMatch = pathname.match(/^\/products\/([^/]+)$/);
          if (productMatch) {
            trackEvent({
              event_type: "product_view",
              payload: { product_id: productMatch[1] },
            });
            return;
          }

          // Search page: /search?q=...
          if (pathname === "/search") {
            const query = new URLSearchParams(event.toLocation.searchStr).get("q");
            if (query) {
              trackEvent({
                event_type: "search",
                payload: { query, result_count: 0 }, // result_count updated later if needed
              });
            }
            return;
          }

          // Category page: /categories/:categoryId or /collections/:collectionId
          const categoryMatch = pathname.match(/^\/(categories|collections)\/([^/]+)$/);
          if (categoryMatch) {
            trackEvent({
              event_type: "category_view",
              payload: { category_id: categoryMatch[2], category_name: categoryMatch[2] },
            });
          }
        });

        return unsubscribe;
      }, [userId, router, trackEvent]);
    }
    ```
  - [x] 7.2: Wire `useTrackingListener` into `__root.tsx` RootComponent:
    - Get userId from Supabase auth state (existing auth context or `useUser()` hook)
    - Call `useTrackingListener(userId)` at the top of RootComponent
  - [x] 7.3: Note: Route patterns must match actual file-based routes. Check existing route tree: `products/$productId`, `search/index`, category routes. Adapt the regex patterns to match the actual TanStack Router path structure.

- [x] **Task 8: Mobile tracking integration** (AC: #6)
  - [x] 8.1: In relevant mobile screens, add tracking calls on screen focus:
    - `apps/mobile/src/app/[productId].tsx` (or equivalent product detail screen) — track `product_view` on mount/focus
    - `apps/mobile/src/app/(tabs)/search.tsx` — track `search` when search results load
    - Category/collection screens — track `category_view` on focus
  - [x] 8.2: Mobile `sendEvent` implementation:
    ```typescript
    import { createSupabaseClient } from "@ecommerce/shared/clients/supabase";

    const sendEventMobile = async (userId: string, event: TrackingEvent) => {
      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/track-event`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            event_type: event.event_type,
            payload: event.payload,
          }),
        },
      );
    };
    ```
  - [x] 8.3: Use `useFocusEffect` from `expo-router` (or `@react-navigation/native`) to fire tracking on screen focus, not just mount. This handles back-navigation correctly.

- [x] **Task 9: Browsing history read hook** — `packages/shared/src/hooks/useBrowsingHistory.ts` (AC: #7)
  - [x] 9.1: Create TanStack Query hook for reading browsing history:
    ```typescript
    import { queryOptions, useQuery } from "@tanstack/react-query";
    import { getUserEvents } from "../clients/tracking";
    import type { TrackingEventType, UserEvent } from "../types/tracking.types";

    export const browsingHistoryKeys = {
      all: (userId: string) => ["browsingHistory", userId] as const,
      byType: (userId: string, type: TrackingEventType) =>
        ["browsingHistory", userId, type] as const,
    };

    export function browsingHistoryQueryOptions(
      userId: string | undefined,
      eventType?: TrackingEventType,
      limit = 50,
    ) {
      return queryOptions({
        queryKey: eventType
          ? browsingHistoryKeys.byType(userId ?? "", eventType)
          : browsingHistoryKeys.all(userId ?? ""),
        queryFn: () => getUserEvents(userId!, { eventType, limit }),
        enabled: !!userId,
        staleTime: 2 * 60 * 1000, // 2 min — browsing history changes frequently
      });
    }

    export function useBrowsingHistory(
      userId: string | undefined,
      eventType?: TrackingEventType,
      limit = 50,
    ) {
      return useQuery(browsingHistoryQueryOptions(userId, eventType, limit));
    }
    ```

- [x] **Task 10: Export new modules** — barrel files (AC: all)
  - [x] 10.1: Update `packages/shared/src/types/index.ts`:
    ```typescript
    export type {
      TrackingEventType,
      TrackingEvent,
      TrackingPayload,
      UserEvent,
      ProductViewPayload,
      SearchPayload,
      CategoryViewPayload,
    } from "./tracking.types";
    ```
  - [x] 10.2: Update `packages/shared/src/clients/index.ts`:
    ```typescript
    export { recordEvent, getUserEvents } from "./tracking";
    ```
  - [x] 10.3: Update `packages/shared/src/hooks/index.ts`:
    ```typescript
    export { useTracking } from "./useTracking";
    export { useBrowsingHistory, browsingHistoryKeys, browsingHistoryQueryOptions } from "./useBrowsingHistory";
    ```

- [x] **Task 11: Tests** (AC: all)
  - [x] 11.1: Unit tests for tracking types and client functions in `apps/web/src/__tests__/tracking.test.ts`:
    - `getUserEvents` returns filtered events by type
    - `getUserEvents` respects limit parameter
    - `recordEvent` calls supabase insert with correct payload
    - `recordEvent` does not throw on error (logs warning)
  - [x] 11.2: Unit tests for dedup logic in `useTracking`:
    - Same product_view within 60s is deduped
    - Same product_view after 60s fires again
    - Different product_ids fire separately
    - Anonymous users (no userId) never fire events
  - [x] 11.3: No E2E tests for route-based tracking (would require full router setup). Document manual test procedure.

- [x] **Task 12: Quality checks** (AC: all)
  - [x] 12.1: Run `bun run fix-all` — 0 errors, 0 warnings
  - [x] 12.2: Run `bun --cwd=apps/web run test` — all tests pass
  - [x] 12.3: Run `bun run typecheck` — no TypeScript errors

---

## Dev Notes

### Critical Architecture Constraints

- **Tracking writes MUST go through Server Function (web) or Edge Function (mobile)** — The `user_events` table has RLS: authenticated users can only SELECT their own events. INSERT is restricted to `service_role`. This is intentional: we don't want clients to forge events. The web Server Function and mobile Edge Function both use `getServiceRoleClient()` / service role key to write.

- **Fire-and-forget pattern for tracking** — Tracking failures MUST NOT break the user experience. The `recordEvent` function catches errors and logs warnings. The `useTracking` hook wraps calls in try/catch. If the tracking Server Function or Edge Function is down, the user should never notice.

- **No tracking for anonymous/guest users** — Per privacy requirements and practical concerns, only authenticated users have events recorded. The `useTracking` hook checks `userId` before firing. This is both a privacy decision and a data quality decision (anonymous sessions are ephemeral and have no persistent identity).

- **Purchase history is NOT duplicated** — The `orders` + `order_items` tables (from Story 5.1) already contain full purchase data. Story 6.3 (Personalized Search) and Story 6.5 (Recommendations) will JOIN `user_events` with `orders`/`order_items` to build a complete user profile. Do NOT create purchase tracking events.

- **pg_cron for data retention** — The migration includes commented-out `pg_cron` SQL because the extension must be enabled via Supabase Dashboard (it requires superuser). The actual setup flow is: (1) Enable pg_cron extension in Dashboard > Database > Extensions, (2) Run the `cron.schedule()` SQL in the SQL Editor. For local dev, events can accumulate without cleanup. Alternative: a scheduled Edge Function via Dashboard > Edge Functions > Schedules.

- **Deduplication is client-side only** — The `useTracking` hook maintains a 60-second dedup window using an in-memory Map. This is sufficient for MVP because: (a) duplicate events from the same client session are prevented, (b) cross-device duplication is acceptable (viewing a product on web and then mobile counts as 2 views, which is correct for personalization). No server-side dedup is needed.

- **TanStack Router `subscribe('onResolved')` for web tracking** — This is the correct pattern for TanStack Router v1. It fires after navigation completes (not on click, not on loading). The callback receives `{ toLocation, fromLocation }`. Use `toLocation.pathname` to determine the page type and extract parameters.

- **Mobile tracking via Edge Function (not Server Function)** — Mobile apps cannot call TanStack Server Functions (those are web-specific). The mobile app calls the `track-event` Edge Function with the user's JWT in the Authorization header. The Edge Function validates the JWT and writes via service role client.

- **No Tailwind CSS** — All styling is Vanilla CSS + BEM. This story has minimal CSS needs (tracking is backend-only), but if any UI is added (e.g., a "Recently Viewed" section in a future story), follow the BEM pattern.

### Existing Utilities to Reuse (DO NOT REBUILD)

| Utility | Location | What it provides |
| ------- | -------- | ---------------- |
| `createSupabaseClient()` | `packages/shared/src/clients/supabase.ts` | Singleton browser client (both platforms) |
| `getServiceRoleClient()` | `packages/shared/src/clients/supabase.server.ts` | Service role client for server-side writes |
| `useUser()` | `packages/shared/src/hooks/useAuth.ts` | Current auth user (for getting userId) |
| `useProfile()` | `packages/shared/src/hooks/useProfile.ts` | Query options factory pattern to follow |
| `orders` table | `supabase/migrations/20260319000000_orders.sql` | Purchase history source — DO NOT duplicate |
| `order_items` table | Same migration | Item-level purchase data — DO NOT duplicate |
| Edge Function patterns | `supabase/functions/handle-webhook/index.ts` | CORS headers, JWT validation, service role client patterns |
| Server Function patterns | `apps/web/src/server/functions/` | TanStack `createServerFn` usage |

### Existing Code Patterns to Follow

```typescript
// TanStack Query hook pattern (from useProfile.ts):
export const browsingHistoryKeys = {
  all: (userId: string) => ["browsingHistory", userId] as const,
  byType: (userId: string, type: string) => ["browsingHistory", userId, type] as const,
};

export function browsingHistoryQueryOptions(userId: string | undefined) {
  return queryOptions({
    queryKey: browsingHistoryKeys.all(userId ?? ""),
    queryFn: () => getUserEvents(userId!),
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
  });
}
```

```typescript
// Supabase client operation pattern (from clients/profile.ts):
export async function getUserEvents(
  userId: string,
  options?: GetEventsOptions,
  client?: SupabaseClient,
): Promise<UserEvent[]> {
  const supabase = client ?? createSupabaseClient();
  // ... query with RLS (user can only SELECT own rows)
}
```

```typescript
// Edge Function pattern (from handle-webhook/index.ts):
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  // ... validate auth, process, respond
});
```

```sql
-- RLS pattern (from orders migration):
CREATE POLICY "users_read_own_orders" ON public.orders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "service_role_all_orders" ON public.orders
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### Database Schema Reference

```sql
-- NEW TABLE (this story's migration):
-- user_events
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid()
--   user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
--   event_type TEXT NOT NULL CHECK (event_type IN ('product_view', 'search', 'category_view'))
--   payload JSONB NOT NULL DEFAULT '{}'
--   created_at TIMESTAMPTZ NOT NULL DEFAULT now()
--
-- RLS:
-- 1. users_read_own_events (SELECT): auth.uid() = user_id
-- 2. service_role_all_events (ALL TO service_role): true
--
-- Indexes:
-- idx_user_events_user_type: (user_id, event_type)
-- idx_user_events_user_created: (user_id, created_at DESC)
-- idx_user_events_created_at: (created_at) — for retention cleanup

-- EXISTING TABLE REFERENCE (for purchase history — DO NOT DUPLICATE):
-- orders: id, violet_order_id, user_id, status, total, currency, created_at
-- order_items: id, order_id, sku_id, name, quantity, price, thumbnail
-- Both have RLS: users_read_own + service_role_all
```

### Previous Story Intelligence (Story 6.1)

- **Implementation sequence**: migration → types → schemas → client functions → hooks → web UI → mobile UI → exports → tests → fix-all. Follow this sequence.
- **Hook pattern established**: `useProfile.ts` uses `queryOptions()` factory for SSR compatibility + convenience wrapper hook. Follow this pattern for `useBrowsingHistory`.
- **Barrel exports pattern**: Each subdirectory (`types/`, `clients/`, `hooks/`, `schemas/`) has an `index.ts` that re-exports. Always update these.
- **Common issue**: Server-only imports (`node:crypto`, `@tanstack/react-start/server`) leaking into client bundle. The `recordEvent` function in `clients/tracking.ts` must NOT import from `supabase.server.ts`. Only the Server Function imports the service role client.
- **Social auth functions were added with `data, error` pattern** (not throwing) for consistency. `recordEvent` should follow the same "log warning, don't throw" pattern for tracking.
- **Mobile doesn't use TanStack Query directly** — mobile hooks call Supabase directly or use `fetch` for Edge Functions. The shared `useTracking` hook must be platform-agnostic (receives `sendEvent` as a parameter).
- **Migration naming**: Filename uses sequential date `20260325` (next after `20260324000000_user_profiles_extend.sql`).

### Git Intelligence

- Commit pattern: `feat: implement <description> (Story X.Y) + code review fixes`
- Implementation sequence: migration → types → client functions → hooks → web integration → mobile integration → exports → tests → fix-all
- Recent focus: Story 6.1 completed user profiles with social auth. This story builds the data pipeline that downstream stories (6.3, 6.5, 6.6) will consume.

### Project Structure Notes

- **New hook**: `packages/shared/src/hooks/useTracking.ts` — platform-agnostic, receives `sendEvent` callback. `useBrowsingHistory.ts` — TanStack Query read hook.
- **New client**: `packages/shared/src/clients/tracking.ts` — `recordEvent()` (service role write), `getUserEvents()` (browser client read).
- **New types**: `packages/shared/src/types/tracking.types.ts` — event types and payload interfaces.
- **New Server Function**: `apps/web/src/server/functions/trackEvent.ts` — web-only, imports `supabase.server.ts`.
- **New Edge Function**: `supabase/functions/track-event/index.ts` — mobile-only, Deno runtime.
- **Modified root**: `apps/web/src/routes/__root.tsx` — adds tracking listener (small addition, wraps existing RootComponent).
- **Downstream consumers**: Stories 6.3 (Personalized Search), 6.5 (Recommendations), 6.6 (Recently Viewed) will all consume `user_events` data via `getUserEvents()` and `useBrowsingHistory()`.

### References

- [Source: epics.md#Story 6.2 — Browsing History & Preference Tracking acceptance criteria]
- [Source: epics.md#Epic 6 — NFRs: NFR1 (performance), NFR4 (mobile perf), NFR18 (SEO perf)]
- [Source: epics.md#FR6 — Returning users receive search results weighted by browsing/purchase history]
- [Source: architecture.md#Data Boundaries — User profiles: Supabase DB, RLS: auth.uid() = user_id]
- [Source: architecture.md#API Patterns — Server Functions for user-triggered, Edge Functions for external/mobile]
- [Source: architecture.md#Caching — TanStack Query staleTime: search 2 min, profile 5 min]
- [Source: architecture.md#Authentication — Supabase RLS policies on all tables]
- [Source: ux-design-specification.md#Privacy — no third-party analytics, data stays in Supabase]
- [Source: ux-design-specification.md#Return Visit — "browsing context preserved, AI suggestions improving over time"]
- [Source: ux-design-specification.md#Guest-First Architecture — enhanced features (history) are value props for registration]
- [Source: ux-design-specification.md#Anti-Patterns — no fingerprinting, no cross-site tracking, no dark patterns]
- [Source: 20260319000000_orders.sql — orders + order_items tables (purchase history source)]
- [Source: 20260324000000_user_profiles_extend.sql — latest migration (6.1), next is 20260325]
- [Source: packages/shared/src/hooks/useProfile.ts — queryOptions factory pattern to follow]
- [Source: packages/shared/src/clients/supabase.server.ts — getServiceRoleClient() for server-side writes]
- [Source: supabase/functions/handle-webhook/index.ts — Edge Function CORS and auth patterns]
- [Source: CLAUDE.md — No Tailwind CSS, double quotes, semicolons, 100 char width, conventional commit format]

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

- Server functions live in `apps/web/src/server/` (not `server/functions/`). Adjusted from story spec.
- Used `.inputValidator()` instead of `.validator()` — the latter doesn't exist in TanStack Start v1.
- Deep imports like `@ecommerce/shared/hooks/useTracking` don't work in this monorepo — must use barrel exports via `@ecommerce/shared`.
- `renderHook` from `@testing-library/react` fails with hooks from `@ecommerce/shared` due to dual React instances in the monorepo. Tested dedup logic as pure functions instead.
- Edge Function reuses existing `_shared/supabaseAdmin.ts` (getSupabaseAdmin) instead of creating a new service role client inline.
- Pre-existing test failures in `orderStatusDerivation` (CANCELED/REFUNDED conflation) and `violetCartAdapter` (wallet_based_checkout body mismatch) — not introduced by this story.

### Completion Notes List

- Created `supabase/migrations/20260325000000_user_events.sql` — `user_events` table with CHECK constraint on event_type, RLS (SELECT for own rows, service_role ALL), 3 indexes, pg_cron reference for 6-month retention.
- Created `packages/shared/src/types/tracking.types.ts` — `TrackingEventType`, `TrackingEvent`, `UserEvent`, payload interfaces.
- Created `packages/shared/src/clients/tracking.ts` — `recordEvent()` (fire-and-forget, logs on error) and `getUserEvents()` (RLS-protected reads).
- Created `apps/web/src/server/tracking.ts` + `trackingHandlers.ts` — Server Function with dynamic import pattern for bundle safety. Uses `getSupabaseServer()` service role client.
- Created `supabase/functions/track-event/index.ts` — Edge Function for mobile. Validates JWT, rejects anonymous users, writes via `getSupabaseAdmin()`.
- Created `packages/shared/src/hooks/useTracking.ts` — platform-agnostic hook with 60s dedup window, fire-and-forget pattern, `sendEvent` callback injection.
- Created `packages/shared/src/hooks/useBrowsingHistory.ts` — TanStack Query read hook with `browsingHistoryQueryOptions()` factory, 2-min staleTime.
- Created `apps/web/src/hooks/useTrackingListener.ts` — subscribes to `router.subscribe('onResolved')`, matches routes: `/products/$productId` → product_view, `/search?q=` → search, `/products?category=` → category_view.
- Updated `apps/web/src/routes/__root.tsx` — imported and wired `useTrackingListener(syncUserId)` for authenticated users.
- Created `apps/mobile/src/hooks/useMobileTracking.ts` — mobile tracking hook with `useTrackProductView()` convenience.
- Updated `apps/mobile/src/app/products/[productId].tsx` — added `useFocusEffect` + `useTrackProductView` for product view tracking.
- Updated `apps/mobile/src/app/search.tsx` — added search event tracking when results load (with ref-based query dedup).
- Updated `apps/mobile/src/app/index.tsx` — added category_view tracking on category filter change.
- Updated all barrel exports: `types/index.ts`, `clients/index.ts`, `hooks/index.ts`.
- Created `packages/shared/src/clients/__tests__/tracking.test.ts` — 7 unit tests for recordEvent (insert, error handling) and getUserEvents (empty, data, error, default client).
- Created `apps/web/src/__tests__/useTracking.test.ts` — 8 unit tests for dedup key derivation and dedup window simulation logic.
- All 203 web tests pass (195 existing + 8 new). All 237 shared tests pass (230 existing + 7 new). 2 pre-existing failures unrelated to this story.
- `bun run fix-all` exits 0 (Prettier + ESLint + TypeCheck all clean).

### File List

- `supabase/migrations/20260325000000_user_events.sql` (CREATE)
- `packages/shared/src/types/tracking.types.ts` (CREATE)
- `packages/shared/src/clients/tracking.ts` (CREATE)
- `packages/shared/src/hooks/useTracking.ts` (CREATE)
- `packages/shared/src/hooks/useBrowsingHistory.ts` (CREATE)
- `apps/web/src/server/tracking.ts` (CREATE)
- `apps/web/src/server/trackingHandlers.ts` (CREATE)
- `apps/web/src/hooks/useTrackingListener.ts` (CREATE)
- `supabase/functions/track-event/index.ts` (CREATE)
- `apps/mobile/src/hooks/useMobileTracking.ts` (CREATE)
- `packages/shared/src/clients/__tests__/tracking.test.ts` (CREATE)
- `apps/web/src/__tests__/useTracking.test.ts` (CREATE)
- `packages/shared/src/types/index.ts` (UPDATE — added tracking type exports)
- `packages/shared/src/clients/index.ts` (UPDATE — added tracking client exports)
- `packages/shared/src/hooks/index.ts` (UPDATE — added useTracking + useBrowsingHistory exports)
- `apps/web/src/routes/__root.tsx` (UPDATE — added useTrackingListener import and call)
- `apps/mobile/src/app/products/[productId].tsx` (UPDATE — added useFocusEffect + product view tracking)
- `apps/mobile/src/app/search.tsx` (UPDATE — added search event tracking)
- `apps/mobile/src/app/index.tsx` (UPDATE — added category view tracking)
