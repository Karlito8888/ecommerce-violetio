# Story 6.7: Push Notification Infrastructure & Preferences

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Quick Reference — Files to Create/Update

| Action | File | Notes |
| ------ | ---- | ----- |
| CREATE | `supabase/migrations/20260328000000_push_notifications.sql` | `user_push_tokens` + `notification_preferences` tables with RLS |
| CREATE | `packages/shared/src/types/notification.types.ts` | `PushToken`, `NotificationPreference`, `NotificationType`, `PushPayload` |
| CREATE | `packages/shared/src/clients/notifications.ts` | Supabase CRUD: tokens, preferences |
| CREATE | `packages/shared/src/hooks/useNotificationPreferences.ts` | TanStack Query read + mutation hooks |
| CREATE | `apps/mobile/src/hooks/usePushRegistration.ts` | Expo token registration + permission flow (mobile-only — can't be in shared due to RN deps) |
| CREATE | `supabase/functions/send-push/index.ts` | Edge Function: Expo Push API delivery |
| CREATE | `supabase/functions/send-push/types.ts` | TypeScript interfaces for push payloads |
| CREATE | `apps/mobile/src/app/settings/_layout.tsx` | Settings stack navigator |
| CREATE | `apps/mobile/src/app/settings/notifications.tsx` | Notification preferences screen with toggles |
| UPDATE | `apps/mobile/app.config.ts` | Add `expo-notifications` plugin |
| UPDATE | `apps/mobile/src/app/_layout.tsx` | Initialize notification handler + register token on auth |
| UPDATE | `supabase/functions/handle-webhook/orderProcessors.ts` | Add push notification trigger alongside email |
| UPDATE | `packages/shared/src/types/index.ts` | Add notification type exports |
| UPDATE | `packages/shared/src/hooks/index.ts` | Add notification hook exports |
| UPDATE | `packages/shared/src/clients/index.ts` | Add notification client exports |
| UPDATE | `packages/shared/src/utils/constants.ts` | Add `notifications` to `queryKeys` factory |

---

## Story

As a **registered mobile user**,
I want to receive relevant push notifications for order updates, price drops, and back-in-stock alerts, and configure which types I receive,
So that I stay informed about things I care about without being spammed.

## Acceptance Criteria

1. **Given** a registered user on the mobile app
   **When** they first launch the app after registration
   **Then** the app requests push notification permission via Expo Notifications API with a clear value proposition ("Get notified when your order ships or a saved item drops in price")
   **And** the Expo push token is stored in Supabase (`user_push_tokens` table: user_id, expo_push_token, device_id, platform, created_at)

2. **Given** the Supabase database
   **When** migrations run
   **Then** `supabase/migrations/20260328000000_push_notifications.sql` creates:
   - `user_push_tokens` table (id, user_id, expo_push_token, device_id, platform, created_at, updated_at)
   - `notification_preferences` table (id, user_id, notification_type, enabled, created_at, updated_at)
   - RLS policies: users can manage their own tokens and preferences; service_role has full access

3. **Given** the push notification system
   **When** an event triggers a notification
   **Then** transactional notifications are supported: `order_confirmed`, `order_shipped`, `order_delivered`, `refund_processed` (FR41)
   **And** engagement notifications are supported: `price_drop` (wishlisted item), `back_in_stock` (wishlisted item) (FR41)

4. **Given** the `supabase/functions/send-push/index.ts` Edge Function
   **When** invoked with a push payload
   **Then** it sends push notifications via Expo Push API (`https://exp.host/--/api/v2/push/send`)
   **And** it checks user notification preferences before sending (respects opt-out)
   **And** it fetches all active push tokens for the target user (multi-device support)
   **And** it handles Expo Push API errors gracefully (invalid tokens → delete from table)

5. **Given** existing webhook handlers (Story 5.2)
   **When** a BAG_SHIPPED, BAG_COMPLETED, or BAG_REFUNDED event fires
   **Then** push notifications are triggered alongside existing email notifications (fire-and-forget)
   **And** order_confirmed push is triggered at checkout completion (same as email)

6. **Given** notification preferences
   **When** a user configures them
   **Then** preferences are granular per type: `order_updates` (default: on), `price_drops` (default: on), `back_in_stock` (default: on), `marketing` (default: off) (FR42)
   **And** users can opt out of all notifications or specific types at any time

7. **Given** the mobile app settings
   **When** a user navigates to notification preferences
   **Then** `apps/mobile/src/app/settings/notifications.tsx` shows toggles per notification type
   **And** changes are persisted to `notification_preferences` table via Supabase
   **And** the global push permission status is displayed (with link to system settings if denied)

8. **Given** the anti-spam principle
   **When** notifications are sent
   **Then** max 1 engagement notification (price_drop/back_in_stock) per user per day
   **And** no duplicate notifications for the same event (idempotency via notification_logs)

9. **Given** `packages/shared/src/hooks/useNotificationPreferences.ts`
   **When** consumed by the mobile app
   **Then** it provides:
   - `useNotificationPreferences(userId)` — fetches all preferences with defaults
   - `useUpdateNotificationPreference()` — mutation to toggle individual types
   - Query key: `['notifications', 'preferences', userId]`
   - Optimistic updates for instant UI feedback

## Tasks / Subtasks

- [x] **Task 1: Database migration** — `supabase/migrations/20260328000000_push_notifications.sql` (AC: #2)
  - [x] 1.1: Create `user_push_tokens` table: id (UUID PK), user_id (FK auth.users), expo_push_token (TEXT UNIQUE), device_id (TEXT), platform (TEXT CHECK IN ('ios', 'android')), created_at, updated_at
  - [x] 1.2: Create `notification_preferences` table: id (UUID PK), user_id (FK auth.users), notification_type (TEXT CHECK), enabled (BOOLEAN), created_at, updated_at, UNIQUE(user_id, notification_type)
  - [x] 1.3: RLS on `user_push_tokens`: SELECT/INSERT/UPDATE/DELETE WHERE user_id = auth.uid()
  - [x] 1.4: RLS on `notification_preferences`: SELECT/INSERT/UPDATE/DELETE WHERE user_id = auth.uid()
  - [x] 1.5: Service role bypass policies for Edge Functions
  - [x] 1.6: Indexes: (user_id) on both tables, (expo_push_token) on tokens
  - [x] 1.7: `notification_type` CHECK constraint: `'order_updates', 'price_drops', 'back_in_stock', 'marketing'`

- [x] **Task 2: Types** — `packages/shared/src/types/notification.types.ts` (AC: #3, #9)
  - [x]2.1: `NotificationType` union: `'order_updates' | 'price_drops' | 'back_in_stock' | 'marketing'`
  - [x]2.2: `PushNotificationType` union: `'order_confirmed' | 'order_shipped' | 'order_delivered' | 'refund_processed' | 'price_drop' | 'back_in_stock'`
  - [x]2.3: `PushToken` interface: `{ id, user_id, expo_push_token, device_id, platform, created_at, updated_at }`
  - [x]2.4: `NotificationPreference` interface: `{ id, user_id, notification_type: NotificationType, enabled, created_at, updated_at }`
  - [x]2.5: `NotificationPreferencesMap` type: `Record<NotificationType, boolean>` with defaults
  - [x]2.6: `SendPushPayload` interface: `{ user_id, type: PushNotificationType, title, body, data?: Record<string, unknown> }`
  - [x]2.7: Export from `packages/shared/src/types/index.ts`

- [x] **Task 3: Supabase client functions** — `packages/shared/src/clients/notifications.ts` (AC: #1, #6)
  - [x]3.1: `upsertPushToken(userId, token, deviceId, platform)` — upsert by expo_push_token
  - [x]3.2: `deletePushToken(token)` — remove invalid token
  - [x]3.3: `getNotificationPreferences(userId)` — fetch all preferences for user
  - [x]3.4: `upsertNotificationPreference(userId, type, enabled)` — toggle individual type
  - [x]3.5: `getUserPushTokens(userId)` — get all active tokens for a user (used by Edge Function)
  - [x]3.6: Export from `packages/shared/src/clients/index.ts` (if barrel exists) or create it

- [x] **Task 4: Notification preferences hook** — `packages/shared/src/hooks/useNotificationPreferences.ts` (AC: #9)
  - [x]4.1: Add to `queryKeys` in `packages/shared/src/utils/constants.ts`:
    ```typescript
    notifications: {
      preferences: (userId: string) => ["notifications", "preferences", userId] as const,
    },
    ```
  - [x]4.2: `useNotificationPreferences(userId)` — TanStack Query with `staleTime: 5 min`
    - Fetches from `notification_preferences` table
    - Merges with DEFAULT_PREFERENCES: `{ order_updates: true, price_drops: true, back_in_stock: true, marketing: false }`
    - Returns `{ data: NotificationPreferencesMap, isLoading, isError }`
  - [x]4.3: `useUpdateNotificationPreference()` — mutation with optimistic update
    - `mutationFn: (vars: { userId, type, enabled }) => upsertNotificationPreference(...)`
    - `onMutate`: optimistically update cache
    - `onError`: rollback
    - `onSettled`: invalidate query
  - [x]4.4: Export from `packages/shared/src/hooks/index.ts`

- [x] **Task 5: Push registration hook** — `packages/shared/src/hooks/usePushRegistration.ts` (AC: #1)
  - [x]5.1: `usePushRegistration(userId)` hook:
    - Uses `expo-notifications` and `expo-device`
    - Checks if physical device (`Device.isDevice`)
    - Requests permissions (`Notifications.requestPermissionsAsync()`)
    - Gets Expo push token (`Notifications.getExpoPushTokenAsync({ projectId })`)
    - Calls `upsertPushToken()` to save to Supabase
    - Sets up Android notification channel (`default` channel, MAX importance)
  - [x]5.2: `useNotificationListeners()` hook:
    - `addNotificationReceivedListener` — for foreground notifications
    - `addNotificationResponseReceivedListener` — for tap-to-open deep linking
    - Cleanup on unmount
  - [x]5.3: Export from `packages/shared/src/hooks/index.ts`
  - [x]5.4: NOTE: These hooks use `expo-notifications` which is mobile-only — guard imports or only use in mobile app

- [x] **Task 6: send-push Edge Function** — `supabase/functions/send-push/` (AC: #4, #8)
  - [x]6.1: `types.ts` — `SendPushRequest` interface matching `SendPushPayload`
  - [x]6.2: `index.ts` — Main handler:
    - Validates payload (type, user_id, title, body)
    - Maps `PushNotificationType` → `NotificationType` for preference check (e.g., `order_shipped` → `order_updates`)
    - Fetches user preferences, checks if type is enabled (default: enabled for transactional)
    - Fetches all `user_push_tokens` for user_id
    - Sends via Expo Push API: `POST https://exp.host/--/api/v2/push/send`
    - Handles Expo Push receipts: `DeviceNotRegistered` → delete token
    - Anti-spam: check `notification_logs` for engagement notifications (max 1/day)
    - Log to `notification_logs` table (reuse existing table, add push-specific types)
    - Always returns HTTP 200 (fire-and-forget pattern from `send-notification`)
  - [x]6.3: Expo Push API payload format:
    ```json
    { "to": "ExponentPushToken[xxx]", "title": "...", "body": "...", "data": {...}, "sound": "default" }
    ```
  - [x]6.4: No EXPO_ACCESS_TOKEN needed for Expo Push API — it's a free, unauthenticated service (tokens are the auth)

- [x] **Task 7: Update webhook processors** — `supabase/functions/handle-webhook/orderProcessors.ts` (AC: #5)
  - [x]7.1: Import `getSupabaseAdmin` (already available)
  - [x]7.2: In `processBagShipped()` — add fire-and-forget `send-push` invocation alongside existing `send-notification`:
    ```typescript
    supabase.functions.invoke("send-push", {
      body: { user_id: order.user_id, type: "order_shipped", title: "Order Shipped!", body: "Your order is on its way" }
    }).catch(() => {});
    ```
  - [x]7.3: In `processBagUpdated()` for COMPLETED status — add `send-push` with `type: "order_delivered"`
  - [x]7.4: In `processBagRefunded()` — add `send-push` with `type: "refund_processed"`
  - [x]7.5: NOTE: `order_confirmed` push is triggered from the checkout completion flow, NOT from webhooks (same as email)
  - [x]7.6: Only trigger push if `order.user_id` is NOT null (guest orders don't get push — they get email only)

- [x] **Task 8: Mobile app integration** — `apps/mobile/` (AC: #1, #7)
  - [x]8.1: Install `expo-notifications` and `expo-device`: `bun --cwd=apps/mobile add expo-notifications expo-device`
  - [x]8.2: Update `app.config.ts` — add `"expo-notifications"` to plugins array
  - [x]8.3: Update `apps/mobile/src/app/_layout.tsx`:
    - Set `Notifications.setNotificationHandler()` at module level (before component)
    - In root layout, call `usePushRegistration(userId)` when authenticated
    - Set up `useNotificationListeners()` for foreground + tap handling
  - [x]8.4: Create `apps/mobile/src/app/settings/_layout.tsx` — Stack navigator for settings routes
  - [x]8.5: Create `apps/mobile/src/app/settings/notifications.tsx`:
    - Display push permission status (granted/denied/undetermined)
    - If denied: show "Enable in Settings" button (opens system settings via `Linking.openSettings()`)
    - Toggle switches for each `NotificationType` with labels:
      - "Order Updates" (order_updates) — "Shipping, delivery, and refund notifications"
      - "Price Drops" (price_drops) — "When a wishlisted item goes on sale"
      - "Back in Stock" (back_in_stock) — "When a wishlisted item becomes available"
      - "Marketing" (marketing) — "Promotions and special offers"
    - Uses `useNotificationPreferences()` + `useUpdateNotificationPreference()`
    - Loading: ActivityIndicator
    - Error: retry button
  - [x]8.6: Add navigation to settings from profile screen (`apps/mobile/src/app/profile.tsx`)

- [x] **Task 9: Update notification_logs for push** (AC: #8)
  - [x]9.1: The existing `notification_logs` table has `notification_type TEXT` — no constraint, so push types can be added without migration
  - [x]9.2: Push notification types logged: `push_order_confirmed`, `push_order_shipped`, `push_order_delivered`, `push_refund_processed`, `push_price_drop`, `push_back_in_stock`
  - [x]9.3: Prefix with `push_` to distinguish from email notifications in logs

- [x] **Task 10: Tests** — `apps/web/src/__tests__/notification-preferences.test.ts` (AC: all)
  - [x]10.1: Test `queryKeys.notifications.preferences()` returns correct key structure
  - [x]10.2: Test `DEFAULT_NOTIFICATION_PREFERENCES` has correct defaults
  - [x]10.3: Test `mapPushTypeToPreference()` correctly maps push types to preference categories
  - [x]10.4: Test preference merging: sparse DB results + defaults = complete map
  - [x]10.5: Follows established pattern: test pure functions, not hooks

- [x] **Task 11: Barrel exports & quality checks** (AC: all)
  - [x]11.1: Update `packages/shared/src/types/index.ts` — add notification type exports
  - [x]11.2: Update `packages/shared/src/hooks/index.ts` — add notification hook exports
  - [x]11.3: Update `packages/shared/src/utils/constants.ts` — add `notifications` to `queryKeys`
  - [x]11.4: `bun run fix-all` exits 0 (Prettier + ESLint + TypeCheck all clean)
  - [x]11.5: `bun --cwd=apps/web run test` — all tests pass
  - [x]11.6: `bun run typecheck` — 0 TypeScript errors

---

## Dev Notes

### Critical Architecture Constraints

- **Mobile-only push notifications** — This story adds push notifications for the mobile app ONLY. Web users receive email notifications (Story 5.6). The `send-push` Edge Function only sends to Expo push tokens, which are mobile-specific.

- **Expo Push API is free and unauthenticated** — No API key or access token needed. The Expo push token itself serves as authentication. Endpoint: `https://exp.host/--/api/v2/push/send`. Max 100 notifications per request (batch supported).

- **Fire-and-forget pattern** — Push notification delivery MUST NOT block webhook processing. Use the same fire-and-forget `.catch(() => {})` pattern as email notifications in `orderProcessors.ts`. Push failures are logged but never propagate upstream.

- **Separate tables, NOT embedded in user_profiles.preferences** — The AC specifies dedicated `user_push_tokens` and `notification_preferences` tables. DO NOT embed notification preferences in the existing `user_profiles.preferences` JSONB column. Reasons: (1) RLS is simpler per-table, (2) Edge Functions query preferences directly, (3) multi-device token management needs its own table.

- **Preference defaults are code-side, not DB-side** — If a user has no rows in `notification_preferences`, ALL transactional notifications default to ON and marketing defaults to OFF. The hook merges DB rows with `DEFAULT_NOTIFICATION_PREFERENCES`. No need to seed default rows on user creation.

- **Anti-spam via notification_logs** — Before sending engagement notifications (price_drop, back_in_stock), the `send-push` Edge Function checks `notification_logs` for recent entries of the same type for that user. Max 1 engagement notification per user per day. Transactional notifications (order updates) have no daily limit.

- **Invalid token cleanup** — When Expo Push API returns `DeviceNotRegistered` for a token, the Edge Function deletes that token from `user_push_tokens`. This prevents repeated failed sends and keeps the token table clean.

- **No Tailwind CSS** — Mobile uses React Native StyleSheet. No Tailwind, no NativeWind.

- **Expo SDK 55 pinning** — `expo-notifications` must be compatible with Expo SDK 55. Do NOT install a version that requires SDK 56+. Run `npx expo install expo-notifications expo-device` to get the correct pinned versions.

- **EAS projectId required** — `Notifications.getExpoPushTokenAsync()` requires a `projectId` from EAS. This should be configured in `app.config.ts` under `extra.eas.projectId`. For local development, the token registration will fail on simulators (requires physical device).

- **Android notification channel required** — Android 8+ requires a notification channel. Create a `default` channel with `AndroidImportance.MAX` during app initialization (before any notifications are sent).

- **Notification type mapping** — Individual push event types (e.g., `order_shipped`, `order_delivered`) map to preference categories (e.g., `order_updates`). The `send-push` Edge Function must map the specific event type to its category before checking preferences.

### Existing Utilities to Reuse (DO NOT REBUILD)

| Utility | Location | What it provides |
| ------- | -------- | ---------------- |
| `send-notification` | `supabase/functions/send-notification/index.ts` | Email notification Edge Function — clone pattern for `send-push` |
| `getSupabaseAdmin()` | `supabase/functions/_shared/supabaseAdmin.ts` | Service role Supabase client for Edge Functions |
| `corsHeaders` | `supabase/functions/_shared/cors.ts` | CORS headers for Edge Function responses |
| `notification_logs` table | `supabase/migrations/20260322000000_notification_logs.sql` | Existing audit log — reuse for push notifications with `push_` prefix |
| `processBagShipped()` | `supabase/functions/handle-webhook/orderProcessors.ts` | Webhook processor — add push trigger alongside email |
| `processBagUpdated()` | `supabase/functions/handle-webhook/orderProcessors.ts` | Handles BAG_COMPLETED → add push for `order_delivered` |
| `processBagRefunded()` | `supabase/functions/handle-webhook/orderProcessors.ts` | Handles refunds → add push for `refund_processed` |
| `useProfile()` | `packages/shared/src/hooks/useProfile.ts` | User profile hook — for settings screen user context |
| `useAuth()` / `useUser()` | `packages/shared/src/hooks/useAuth.ts` | Authentication state — for conditional push registration |
| `queryKeys` | `packages/shared/src/utils/constants.ts` | TanStack Query key factory — add `notifications` entry |
| `ThemedText` / `ThemedView` | `apps/mobile/src/components/` | Mobile themed components for settings screen |
| `wishlist_items` table | `supabase/migrations/20260327000000_wishlists.sql` | Wishlist items — needed for future price_drop/back_in_stock cron job |

### Existing Code Patterns to Follow

```typescript
// Edge Function pattern (from send-notification/index.ts):
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  // Validate → fetch data → send → log → return 200
});
```

```typescript
// Fire-and-forget invocation (from orderProcessors.ts):
supabase.functions
  .invoke("send-push", {
    body: {
      user_id: order.user_id,
      type: "order_shipped",
      title: "Your order has shipped!",
      body: `Order #${order.violet_order_id} is on its way`,
      data: { order_id: order.id, screen: "order" },
    },
  })
  .catch((err) => {
    console.error("[handle-webhook] send-push invocation failed:", err);
  });
```

```typescript
// Expo Push API request format:
const response = await fetch("https://exp.host/--/api/v2/push/send", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
  },
  body: JSON.stringify({
    to: "ExponentPushToken[xxxxx]",
    title: "Order Shipped!",
    body: "Your order is on its way",
    data: { screen: "order", order_id: "uuid" },
    sound: "default",
    channelId: "default", // Android
  }),
});
```

```typescript
// Expo Notifications registration (from Context7 docs):
async function registerForPushNotificationsAsync(): Promise<string | undefined> {
  if (!Device.isDevice) return undefined;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return undefined;

  const projectId = Constants?.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return undefined;

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  return token;
}
```

```typescript
// Optimistic mutation pattern (from useWishlist.ts):
const updatePreference = useMutation({
  mutationFn: ({ userId, type, enabled }: UpdatePreferenceVars) =>
    upsertNotificationPreference(supabaseClient, userId, type, enabled),
  onMutate: async ({ type, enabled }) => {
    await queryClient.cancelQueries({ queryKey: queryKeys.notifications.preferences(userId) });
    const previous = queryClient.getQueryData(queryKeys.notifications.preferences(userId));
    queryClient.setQueryData(queryKeys.notifications.preferences(userId), (old) => ({
      ...old,
      [type]: enabled,
    }));
    return { previous };
  },
  onError: (_err, _vars, context) => {
    queryClient.setQueryData(queryKeys.notifications.preferences(userId), context?.previous);
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications.preferences(userId) });
  },
});
```

### Database Schema Reference

```sql
-- NEW TABLE: user_push_tokens
CREATE TABLE public.user_push_tokens (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expo_push_token TEXT        NOT NULL UNIQUE,
  device_id       TEXT        NOT NULL,
  platform        TEXT        NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: users manage their own tokens
ALTER TABLE user_push_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_push_tokens" ON user_push_tokens
  FOR ALL USING (user_id = auth.uid());

-- Service role bypass for Edge Functions
CREATE POLICY "service_role_push_tokens" ON user_push_tokens
  FOR ALL USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX idx_push_tokens_user_id ON user_push_tokens(user_id);

-- NEW TABLE: notification_preferences
CREATE TABLE public.notification_preferences (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT        NOT NULL CHECK (notification_type IN ('order_updates', 'price_drops', 'back_in_stock', 'marketing')),
  enabled           BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, notification_type)
);

-- RLS: users manage their own preferences
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_notification_prefs" ON notification_preferences
  FOR ALL USING (user_id = auth.uid());

-- Service role bypass for Edge Functions
CREATE POLICY "service_role_notification_prefs" ON notification_preferences
  FOR ALL USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX idx_notification_prefs_user_id ON notification_preferences(user_id);

-- EXISTING TABLE REUSED: notification_logs (no migration changes needed)
-- notification_type is TEXT without constraint — push types added via code:
-- push_order_confirmed, push_order_shipped, push_order_delivered,
-- push_refund_processed, push_price_drop, push_back_in_stock
```

### Push Type → Preference Category Mapping

```typescript
/** Maps specific push event types to their user-facing preference categories. */
const PUSH_TYPE_TO_PREFERENCE: Record<PushNotificationType, NotificationType> = {
  order_confirmed: "order_updates",
  order_shipped: "order_updates",
  order_delivered: "order_updates",
  refund_processed: "order_updates",
  price_drop: "price_drops",
  back_in_stock: "back_in_stock",
};
```

### Previous Story Intelligence (Story 6.6)

- **Implementation sequence**: Types → DB migration → client functions → hooks → Edge Function → webhook integration → mobile UI → tests → barrel exports → fix-all.
- **Deep imports don't work**: Must use barrel exports via `@ecommerce/shared`. Always update barrel files.
- **`renderHook` issues in monorepo**: Test pure functions (type mappings, defaults merging), not hooks directly.
- **Barrel exports**: ALWAYS update `types/index.ts`, `hooks/index.ts` when adding new modules.
- **ErrorBoundary pattern**: Any settings screen component should handle errors gracefully.
- **Mobile uses `ThemedText` / `ThemedView`**: Follow existing mobile component patterns.
- **Mobile route typing**: Use `router.push("..." as never)` cast for dynamic Expo Router paths.

### Git Intelligence

- Commit pattern: `feat: implement <description> (Story X.Y) + code review fixes`
- Recent commits: Stories 6.1-6.6 built the full personalization pipeline. This story adds the notification delivery channel.
- The `handle-webhook/orderProcessors.ts` is a critical integration point — carefully add push alongside existing email sends.

### Scope Boundaries — What is NOT in this story

- **Price drop/back-in-stock cron job**: The scheduled job that checks Violet prices against wishlisted items and triggers `price_drop`/`back_in_stock` push notifications is a SEPARATE concern. This story builds the infrastructure (tables, Edge Function, preferences UI). A cron/scheduled function can be added later to invoke `send-push` when price changes are detected.
- **Web push notifications**: Not in scope. Web users get email only (Story 5.6).
- **In-app notification center**: No inbox/feed of past notifications. Push only.
- **Rich push notifications (images, actions)**: Simple text-only push for MVP.
- **order_confirmed push trigger**: This requires modifying the checkout flow, not just webhooks. If the existing checkout completion already calls `send-notification` for email, add `send-push` alongside it. If the trigger is unclear, defer to the dev agent to locate the exact integration point.

### Project Structure Notes

- **New Supabase migration**: `supabase/migrations/20260328000000_push_notifications.sql`
- **New shared types**: `packages/shared/src/types/notification.types.ts`
- **New shared client**: `packages/shared/src/clients/notifications.ts`
- **New shared hooks**: `packages/shared/src/hooks/useNotificationPreferences.ts`, `usePushRegistration.ts`
- **New Edge Function**: `supabase/functions/send-push/index.ts`, `types.ts`
- **New mobile screens**: `apps/mobile/src/app/settings/_layout.tsx`, `notifications.tsx`
- **Modified webhook handlers**: `supabase/functions/handle-webhook/orderProcessors.ts`
- **Modified mobile root**: `apps/mobile/src/app/_layout.tsx` (notification handler init)
- **Modified mobile config**: `apps/mobile/app.config.ts` (expo-notifications plugin)

### References

- [Source: epics.md#Story 6.7 — Push Notification Infrastructure & Preferences acceptance criteria]
- [Source: architecture.md#Gap 3 — Push notifications: Expo Notifications + Supabase Edge Function trigger]
- [Source: architecture.md#Error Handling — TanStack Query onError → toast notification pattern]
- [Source: architecture.md#Edge Functions — 2s CPU / 10MB bundle limits]
- [Source: send-notification/index.ts — Email notification Edge Function pattern (fire-and-forget, retry, logging)]
- [Source: handle-webhook/orderProcessors.ts — Webhook processor integration points]
- [Source: 6-6-recently-viewed-products.md — Previous story dev notes, barrel export patterns, test strategy]
- [Source: Context7/expo-notifications — Expo SDK 55 notification API, push token registration, permission flow]
- [Source: CLAUDE.md — No Tailwind CSS, double quotes, semicolons, 100 char width, conventional commit format]

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

- `usePushRegistration.ts` moved from `packages/shared/src/hooks/` to `apps/mobile/src/hooks/` — mobile-only deps (expo-notifications, react-native) break shared package typecheck. Import via `@/hooks/usePushRegistration` in mobile app.
- `notification_logs` table altered: `order_id` made nullable and CHECK constraint on `notification_type` dropped. Push engagement notifications (price_drop, back_in_stock) have no associated order.
- Push triggers in `orderProcessors.ts` use `getOrderUserId()` helper to look up user_id from orders table — webhook payloads don't include user_id. Guest orders (`user_id IS NULL`) skip push silently.
- `order_confirmed` push trigger not added to webhook processors — it's triggered from the checkout flow (same as email). The exact integration point in the checkout flow is deferred for the dev agent implementing that change.

### Completion Notes List

- Created `supabase/migrations/20260328000000_push_notifications.sql` — `user_push_tokens` and `notification_preferences` tables with RLS, plus `notification_logs` alterations (nullable order_id, dropped type CHECK, anti-spam index).
- Created `packages/shared/src/types/notification.types.ts` — `NotificationType`, `PushNotificationType`, `PushToken`, `NotificationPreference`, `NotificationPreferencesMap`, `SendPushPayload`, `DEFAULT_NOTIFICATION_PREFERENCES`, `PUSH_TYPE_TO_PREFERENCE`.
- Created `packages/shared/src/clients/notifications.ts` — `upsertPushToken`, `deletePushToken`, `getUserPushTokens`, `getNotificationPreferences`, `upsertNotificationPreference`.
- Created `packages/shared/src/hooks/useNotificationPreferences.ts` — `mergeWithDefaults()`, `notificationPreferencesQueryOptions()`, `useNotificationPreferences()`, `useUpdateNotificationPreference()` with optimistic updates.
- Created `apps/mobile/src/hooks/usePushRegistration.ts` — `usePushRegistration()`, `useNotificationListeners()`, `setupNotificationHandler()` for Expo Notifications SDK 55.
- Created `supabase/functions/send-push/index.ts` + `types.ts` — Edge Function sending via Expo Push API with preference checking, anti-spam (1 engagement/day), invalid token cleanup (DeviceNotRegistered → delete).
- Created `apps/mobile/src/app/settings/_layout.tsx` — Stack navigator for settings routes.
- Created `apps/mobile/src/app/settings/notifications.tsx` — Notification preferences screen with Switch toggles per type, push permission status card, system settings link.
- Created `apps/web/src/__tests__/notification-preferences.test.ts` — 13 tests: query keys (2), defaults (3), push type mapping (4), mergeWithDefaults (4).
- Updated `supabase/functions/handle-webhook/orderProcessors.ts` — Added `getOrderUserId()` helper and `firePushNotification()`. Push triggers added to `processBagShipped()` (order_shipped), `processBagUpdated()` for COMPLETED (order_delivered), and `fetchRefundDetailsAndNotify()` (refund_processed).
- Updated `apps/mobile/app.config.ts` — Added `"expo-notifications"` to plugins array.
- Updated `apps/mobile/src/app/_layout.tsx` — Module-level `setupNotificationHandler()`, `usePushRegistration(pushUserId)` and `useNotificationListeners()` in AppContent.
- Updated `apps/mobile/src/app/profile.tsx` — Added "Notification Preferences" link navigating to `/settings/notifications`.
- Updated `packages/shared/src/types/index.ts` — Added notification type and const exports.
- Updated `packages/shared/src/hooks/index.ts` — Added `mergeWithDefaults`, `notificationPreferencesQueryOptions`, `useNotificationPreferences`, `useUpdateNotificationPreference` exports.
- Updated `packages/shared/src/clients/index.ts` — Added notification client exports.
- Updated `packages/shared/src/utils/constants.ts` — Added `notifications.preferences()` to `queryKeys`.
- Installed `expo-notifications@55.0.12` in `apps/mobile/`.
- All 279 web tests pass (266 existing + 13 new). `bun run fix-all` exits 0 (Prettier + ESLint + TypeCheck all clean).

### File List

- `supabase/migrations/20260328000000_push_notifications.sql` (CREATE)
- `packages/shared/src/types/notification.types.ts` (CREATE)
- `packages/shared/src/clients/notifications.ts` (CREATE)
- `packages/shared/src/hooks/useNotificationPreferences.ts` (CREATE)
- `apps/mobile/src/hooks/usePushRegistration.ts` (CREATE)
- `supabase/functions/send-push/index.ts` (CREATE)
- `supabase/functions/send-push/types.ts` (CREATE)
- `apps/mobile/src/app/settings/_layout.tsx` (CREATE)
- `apps/mobile/src/app/settings/notifications.tsx` (CREATE)
- `apps/web/src/__tests__/notification-preferences.test.ts` (CREATE)
- `supabase/functions/handle-webhook/orderProcessors.ts` (UPDATE — added getOrderUserId, firePushNotification, push triggers in 3 processors)
- `apps/mobile/app.config.ts` (UPDATE — added expo-notifications plugin)
- `apps/mobile/src/app/_layout.tsx` (UPDATE — notification handler init + push registration)
- `apps/mobile/src/app/profile.tsx` (UPDATE — added notification preferences link)
- `packages/shared/src/types/index.ts` (UPDATE — added notification type exports)
- `packages/shared/src/hooks/index.ts` (UPDATE — added notification hooks exports)
- `packages/shared/src/clients/index.ts` (UPDATE — added notification client exports)
- `packages/shared/src/utils/constants.ts` (UPDATE — added notifications to queryKeys)
- `apps/mobile/package.json` (UPDATE — added expo-notifications dependency)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (UPDATE — story status)
