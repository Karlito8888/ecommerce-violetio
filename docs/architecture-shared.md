# Architecture — Shared Package (`packages/shared`)

## Overview

`@ecommerce/shared` is the business logic layer consumed by both `apps/web` and `apps/mobile`. It contains pure TypeScript with no React Native or DOM dependencies. Entry point: `./src/index.ts`.

The package is consumed as a `workspace:*` dependency with direct TypeScript source imports — no build step.

---

## Layer Architecture

The package is organized into five layers with a strict one-way dependency: types → schemas → clients → adapters → hooks.

### 1. `types/` — Pure Interfaces (22 files)

All application domain types. No runtime logic — TypeScript interfaces only.

| File                        | Key exports                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `api.types.ts`              | `ApiResponse<T>`, `ApiError`, `PaginatedResult<T>`                                  |
| `product.types.ts`          | `Product`, `Offer`, `SKU`, `ProductVariant`, `ProductImage`, `ProductQuery`         |
| `cart.types.ts`             | `Cart`, `Bag`, `BagError`, `CartItem`, `CartItemInput`, `ShippingMethod`            |
| `order.types.ts`            | `Order`, `OrderDetail`, `OrderBag`, `OrderStatus`, `WebhookEvent`, `PaymentIntent`  |
| `search.types.ts`           | `SearchResult`, `SearchQuery`, `SearchFilters`, `ProductMatch`, `MatchExplanations` |
| `user.types.ts`             | `User`, `AuthState`                                                                 |
| `auth.types.ts`             | `Session`, `AuthSession`, `AuthError`                                               |
| `profile.types.ts`          | `UserProfile`, `UserPreferences`, `UpdateProfilePayload`                            |
| `wishlist.types.ts`         | `WishlistItem`, `Wishlist`, fetch/mutate function types                             |
| `recommendation.types.ts`   | `RecommendationItem`, `RecommendationResponse`, `RecommendationFetchFn`             |
| `recentlyViewed.types.ts`   | `RecentlyViewedEntry`, `RecentlyViewedItem`                                         |
| `tracking.types.ts`         | `TrackingEvent`, `TrackingEventType`, `ProductViewPayload`, `SearchPayload`         |
| `personalization.types.ts`  | `CategoryAffinity`, `UserSearchProfile`, `PersonalizationBoost`                     |
| `notification.types.ts`     | `PushToken`, `NotificationPreference`, `NotificationPreferencesMap`                 |
| `content.types.ts`          | `ContentType`, `ContentStatus`, `ContentPage`, `ContentListItem`                    |
| `faq.types.ts`              | `FaqItem`, `FaqCategory`                                                            |
| `support.types.ts`          | `SupportSubject`, `SupportInquiryInput`, `SUPPORT_SUBJECTS`                         |
| `admin.types.ts`            | `DashboardMetrics`, `CommissionSummary`, `TimeRange`                                |
| `admin-support.types.ts`    | `SupportInquiry`, `SupportInquiryStatus`, `SUPPORT_STATUSES`                        |
| `health.types.ts`           | `HealthCheckResult`, `HealthMetrics`, `AlertRule`, `PlatformHealthData`             |
| `error.types.ts`            | `CheckoutError`, `CartHealthStatus`, `ErrorLogEntry`                                |
| `orderPersistence.types.ts` | `OrderRow`, `PersistOrderInput`, `PersistOrderResult`                               |
| `violet.types.ts`           | Raw Violet.io API response shapes (snake_case)                                      |
| `biometric.types.ts`        | `BiometricStatus`, `BiometricType` (enum), `BiometricAuthResult`                    |

**Conventions:** IDs are `string`, prices are `number` (integer cents), field names are camelCase. Violet's snake_case names exist only in `violet.types.ts` — all other types are already mapped.

---

### 2. `schemas/` — Zod Runtime Validation (8 files)

Mirrors the domain types with Zod schemas for runtime validation. Used at API boundaries (incoming Violet responses, webhook payloads, user inputs).

| File                       | Key schemas                                                           |
| -------------------------- | --------------------------------------------------------------------- |
| `product.schema.ts`        | `violetOfferSchema`, `violetSkuSchema`, `violetPaginatedOffersSchema` |
| `search.schema.ts`         | `searchQuerySchema`, `searchResponseSchema`, `productMatchSchema`     |
| `cart.schema.ts`           | `violetCartResponseSchema`, `violetBagSchema`, `cartItemInputSchema`  |
| `webhook.schema.ts`        | `violetWebhookHeadersSchema`, `violetOfferWebhookPayloadSchema`       |
| `profile.schema.ts`        | `displayNameSchema`, `updateProfileSchema`, `userPreferencesSchema`   |
| `wishlist.schema.ts`       | `wishlistItemSchema`, `addToWishlistInputSchema`                      |
| `recommendation.schema.ts` | `recommendationItemSchema`, `recommendationResponseSchema`            |

**Pattern:** Schemas use `.catch()` in non-critical fields for forward-compatible parsing — unexpected new fields from Violet are dropped rather than causing validation failures.

---

### 3. `clients/` — Imperative Async Functions (15 files)

Direct API callers. Each function accepts an optional `supabase` client parameter for platform injection (web uses the browser singleton; mobile injects a SecureStore-backed client).

All functions return `ApiResponse<T>` — a discriminated union that never throws:

```typescript
type ApiResponse<T> = { data: T; error: null } | { data: null; error: ApiError };
```

| File                 | Exported functions                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `supabase.ts`        | `createSupabaseClient`, `configureEnv`, `getEnvVar` — browser/mobile singleton                                        |
| `supabase.server.ts` | `getServiceRoleClient` — bypasses RLS, server-only                                                                    |
| `auth.ts`            | `initAnonymousSession`, `signUpWithEmail`, `verifyEmailOtp`, `signInWithEmail`, `signOut`, `signInWithSocialProvider` |
| `violetAuth.ts`      | `violetLogin`, `violetRefreshToken`, `VioletTokenManager` (class)                                                     |
| `profile.ts`         | `getProfile`, `updateProfile`                                                                                         |
| `tracking.ts`        | `recordEvent`, `getUserEvents`                                                                                        |
| `wishlist.ts`        | `getWishlist`, `getWishlistProductIds`, `addToWishlist`, `removeFromWishlist`                                         |
| `notifications.ts`   | `upsertPushToken`, `getNotificationPreferences`, `upsertNotificationPreference`                                       |
| `content.ts`         | `getContentPageBySlug`, `getContentPages`, `getRelatedContent`                                                        |
| `faq.ts`             | `getFaqItems`                                                                                                         |
| `support.ts`         | `insertSupportInquiry`, `countRecentInquiries`                                                                        |
| `admin.ts`           | `getDashboardMetrics`, `getCommissionSummary`, `refreshDashboardViews`                                                |
| `admin-support.ts`   | `getSupportInquiries`, `getSupportInquiry`, `updateInquiryStatus`, `getLinkedOrder`                                   |
| `health.ts`          | `getHealthMetrics`, `getRecentErrors`, `getAlertRules`                                                                |
| `biometricAuth.ts`   | `getBiometricPreference`, `setBiometricPreference`                                                                    |

**`VioletTokenManager`** handles token caching and automatic refresh. It is instantiated once per `VioletAdapter` instance and shared across all requests.

---

### 4. `adapters/` — Supplier Abstraction (4 files)

The adapter layer isolates all Violet.io-specific logic. All snake_case → camelCase field mapping happens exclusively here — no consuming code ever sees Violet field names.

```
supplierAdapter.ts    ← SupplierAdapter interface (contract)
violetAdapter.ts      ← VioletAdapter implements SupplierAdapter
adapterFactory.ts     ← createSupplierAdapter(config) factory function
index.ts              ← public re-exports
```

**`SupplierAdapter` interface** covers:

- Catalog: `getProducts`, `getProduct`
- Search: `searchProducts`
- Cart lifecycle: `createCart`, `addToCart`, `updateCartItem`, `removeFromCart`, `getCart`
- Checkout — shipping: `setShippingAddress`, `getAvailableShippingMethods`, `setShippingMethods`
- Checkout — customer/billing: `setCustomer`, `setBillingAddress`
- Checkout — payment: `getPaymentIntent`, `submitOrder`
- Orders: `getOrder`, `getOrders`
- Webhooks: `validateWebhook`, `processWebhook`

**Factory usage:**

```typescript
import { createSupplierAdapter } from "@ecommerce/shared";

const adapter = createSupplierAdapter({
  supplier: "violet",
  violet: { appId, appSecret, username, password, apiBase },
});

const { data, error } = await adapter.getProducts({ page: 1 });
```

`createSupplierAdapter` throws at construction time if a required config block is missing. Adding a future supplier (e.g., `"firmly"`) requires only a new `case` in the factory switch and a new adapter class — no changes to consuming code.

---

### 5. `hooks/` — TanStack Query Factories (17 files)

Query option factories and mutation hooks built on TanStack Query v5. They accept platform-specific fetch functions (`ProductsFetchFn`, `CartFetchFn`, etc.) so SSR loaders and client-side hooks share the same query key and cache entry.

| File                            | Key exports                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------- |
| `useProducts.ts`                | `productsQueryOptions`, `productsInfiniteQueryOptions`, `productDetailQueryOptions`                |
| `useSearch.ts`                  | `searchQueryOptions`, `useSearch`                                                                  |
| `useCart.ts`                    | `cartDetailQueryOptions`, `useCartQuery`, `useAddToCart`, `useUpdateCartItem`, `useRemoveFromCart` |
| `useCartSync.ts`                | `useCartSync` — Supabase Realtime subscription for cross-device cart sync                          |
| `useOrders.ts`                  | `ordersQueryOptions`, `orderDetailQueryOptions`, `useOrderRealtime`                                |
| `useAuth.ts`                    | `useUser`, `useLogin`, `useRegister`, `useLogout`                                                  |
| `useProfile.ts`                 | `profileQueryOptions`, `useProfile`, `useUpdateProfile`                                            |
| `useTracking.ts`                | `useTracking`, `getDedupKey`                                                                       |
| `useBrowsingHistory.ts`         | `useBrowsingHistory`, `browsingHistoryQueryOptions`                                                |
| `useWishlist.ts`                | `useWishlist`, `useIsInWishlist`, `useAddToWishlist`, `useRemoveFromWishlist`                      |
| `useRecommendations.ts`         | `recommendationQueryOptions`, `useRecommendations`                                                 |
| `useRecentlyViewed.ts`          | `recentlyViewedQueryOptions`, `useRecentlyViewed`, storage helpers                                 |
| `useNotificationPreferences.ts` | `useNotificationPreferences`, `useUpdateNotificationPreference`                                    |
| `useContent.ts`                 | `contentDetailQueryOptions`, `contentListQueryOptions`                                             |
| `useShare.ts`                   | `useShare` — Web Share API with clipboard fallback                                                 |

Cart mutations (`useAddToCart`, `useUpdateCartItem`, `useRemoveFromCart`) implement **optimistic updates with snapshot rollback**: the cache is updated immediately on mutation start and rolled back if the server call fails.

---

## Exports Strategy

The package exposes three export paths:

| Path                                   | Contents                                                       | Use case                        |
| -------------------------------------- | -------------------------------------------------------------- | ------------------------------- |
| `"@ecommerce/shared"`                  | Full public API — all types, schemas, clients, adapters, hooks | Browser and mobile code         |
| `"@ecommerce/shared/server"`           | `getServiceRoleClient` only                                    | Server-only: bypasses RLS       |
| `"@ecommerce/shared/src/utils/server"` | `guestToken.ts` + `orderPersistence.ts`                        | Server-only: uses `node:crypto` |

`guestToken` and `orderPersistence` are intentionally excluded from the main export: they import `node:crypto`, which breaks the client bundle. Do not re-export them from `utils/index.ts`.

---

## Key Patterns

### Adapter/Factory for supplier abstraction

The `SupplierAdapter` interface is the single boundary between the application and any commerce supplier. Violet.io is the only current implementation, but the pattern is designed for future suppliers (firmly.ai, Google UCP).

### Query-option factory pattern (SSR + client hooks)

```typescript
// SSR loader (web):
export const loader = createServerFn().handler(async () => {
  return queryClient.fetchQuery(productsQueryOptions({ page: 1 }, serverFetchFn));
});

// Client hook (same cache entry, no re-fetch):
const { data } = useQuery(productsQueryOptions({ page: 1 }, clientFetchFn));
```

### Platform-injected fetch functions

Each query option factory accepts a `fetchFn` parameter typed to the relevant function signature (e.g., `ProductsFetchFn`, `CartFetchFn`). This allows web Server Functions and mobile Edge Function fetchers to be injected without duplicating query keys.

### `ApiResponse<T>` discriminated union

All client functions return `{ data: T; error: null } | { data: null; error: ApiError }`. Consuming code pattern:

```typescript
const { data, error } = await adapter.getProducts({ page: 1 });
if (error) {
  /* handle */
}
// data is narrowed to T here
```

### Centralized query key factory

`utils/constants.ts` exports `queryKeys`, a nested factory object used across all hook files and SSR loaders:

```typescript
queryKeys.products.detail("abc-123"); // ["products", "detail", "abc-123"]
queryKeys.cart.current(); // ["cart", "current"]
queryKeys.recommendations.forProduct("x"); // ["recommendations", "x"]
```

### Dual-copy sync for Deno Edge Functions

`violetAuth.ts` and `schemas.ts` are duplicated into `supabase/functions/_shared/`. These files must be kept in sync manually — Deno Edge Functions cannot import from `node_modules`.

---

## Dependencies

| Category | Package                 | Version |
| -------- | ----------------------- | ------- |
| Runtime  | `@supabase/supabase-js` | `^2.98` |
| Runtime  | `zod`                   | `^4.3`  |
| Peer     | `@tanstack/react-query` | `^5.90` |
| Dev      | `vitest`                | `^4.0`  |

---

## Tests

14 test files under:

```
clients/__tests__/
  biometricAuth.test.ts
  tracking.test.ts

adapters/__tests__/
  violetAdapter.test.ts
  violetCartAdapter.test.ts
  webhookValidation.test.ts
  webhookProcessors.test.ts

schemas/__tests__/
  search.schema.test.ts
  orderWebhookSchemas.test.ts
  webhookSchemas.test.ts

hooks/__tests__/
  useProducts.test.ts
  useProduct.test.ts
  useSearch.test.ts
  useCart.test.ts
  useOrders.test.ts

utils/__tests__/
  guestToken.test.ts
  orderPersistence.test.ts
  orderStatusDerivation.test.ts
  seo.test.ts
```

Run with: `bun --cwd=apps/web run test`
