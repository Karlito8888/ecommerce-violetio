# Integration Architecture

This document describes how the six parts of the monorepo communicate with each other and with external services.

## System overview

```
┌─────────────────────────────────────────────────────────────────┐
│ Monorepo                                                        │
│                                                                 │
│  ┌──────────────┐        ┌───────────────┐                      │
│  │  apps/web    │        │  apps/mobile  │                      │
│  │ TanStack     │        │  Expo Router  │                      │
│  │ Start (SSR)  │        │  React Native │                      │
│  └──────┬───────┘        └───────┬───────┘                      │
│         │                        │                              │
│         └──────────┬─────────────┘                              │
│                    │ imports                                     │
│         ┌──────────▼────────────────────┐                       │
│         │  packages/shared              │                       │
│         │  @ecommerce/shared            │                       │
│         │  types, hooks, clients,       │                       │
│         │  adapters, schemas, utils     │                       │
│         └──────────┬────────────────────┘                       │
│                    │ imports tokens                              │
│         ┌──────────▼────────────────────┐                       │
│         │  packages/ui                  │                       │
│         │  @ecommerce/ui                │                       │
│         │  design tokens, components    │                       │
│         └───────────────────────────────┘                       │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  supabase/functions/  (Deno runtime)                     │   │
│  │  12 Edge Functions + _shared/ (Deno-only copies)         │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
         │               │              │           │
    Supabase          Violet.io       OpenAI     Stripe
   (Postgres,        (commerce       (embed-     (payments)
   Auth, Realtime,    API)           dings)
   Storage)
                                                 Resend
                                                 (email)
                                              Expo Push API
                                              (mobile push)
```

---

## Integration points

### 1. web → shared

The web app imports from `@ecommerce/shared` (TypeScript source, no build step — resolved via workspace `tsconfig.json` path aliases).

What is consumed:

- **Types:** `violet.types`, `cart.types`, `order.types`, `product.types`, `search.types`, etc.
- **Hooks:** `queryOptions` factories (e.g. `useProducts`, `useCart`, `useSearch`) that accept a platform-injected `fetchFn` for cross-platform reuse
- **Adapters:** `VioletAdapter`, `violetCartAdapter`, `supplierAdapter` — transform Violet API snake_case to camelCase domain types
- **Schemas:** Zod schemas for form validation and response parsing
- **Clients:** `createSupabaseClient()`, `createSupabaseServer()`, auth helpers, profile/wishlist/tracking clients
- **Utils:** `formatPrice`, `seo`, `orderStatusDerivation`, `guestToken`, `orderPersistence`

The web app calls Violet API directly from **server functions** (TanStack Start server-side code), never from the browser. The Violet token is managed by `VioletTokenManager` (singleton per server process) in `packages/shared/src/clients/violetAuth.ts`.

### 2. mobile → shared

The mobile app imports the same `@ecommerce/shared` package with the same resolution strategy.

Key differences from web:

- Initializes Supabase with `SecureStore` adapter: `createSupabaseClient({ storage: SecureStoreAdapter, detectSessionInUrl: false })`
- Does **not** call Violet API directly. All Violet operations go through Edge Functions (see point 4 below)
- Registers env vars via `configureEnv()` at app startup (Metro does not expose `import.meta.env`)

### 3. web → Supabase

The web app uses `@supabase/supabase-js` with the `@supabase/ssr` adapter for SSR session management.

Usage patterns:

- **Auth:** Email/password, OAuth, magic link — managed via `packages/shared/src/clients/auth.ts`
- **Direct DB reads:** Content pages, FAQ, wishlist, user profiles — tables with appropriate RLS policies
- **Realtime subscriptions:** Cart state (`carts` table), order status updates (`orders` table) — used to reflect webhook-driven changes in real time
- **Server-only client:** `getServiceRoleClient()` from `packages/shared/src/clients/supabase.server.ts` — used in TanStack Start server functions that need to bypass RLS. Guard prevents accidental browser-side import.
- **Edge Function invocations:** Some web server functions call Edge Functions (e.g. `send-notification` fire-and-forget after checkout)

### 4. mobile → Supabase

The mobile app uses `@supabase/supabase-js` with a `SecureStore` adapter (Expo SecureStore for token persistence).

Usage patterns:

- **Auth:** Same as web — email/password, OTP
- **Realtime:** Same subscriptions as web
- **ALL Violet operations via Edge Functions:** Cart creation, SKU management, shipping, checkout, and product search all go through Edge Functions rather than direct Violet API calls. Reasons: the Violet JWT must stay server-side and React Native cannot use the Node-based `VioletTokenManager`

### 5. shared → ui

`packages/shared` imports design tokens from `@ecommerce/ui` for cross-platform styling consistency:

- Color palette tokens
- Typography scale
- Spacing system

Both React Native components (mobile) and CSS custom properties (web) derive from the same source values.

### 6. Supabase Edge Functions → Violet.io

Edge Functions call Violet's REST API directly using `getVioletHeaders()` from `_shared/violetAuth.ts`.

Authentication flow:

1. `VioletTokenManager` singleton (module-scoped, persists across warm Edge Function invocations) holds the cached JWT
2. Token is valid for 24 hours; proactive refresh starts 5 minutes before expiry
3. On refresh failure, falls back to full re-login (POST `/login`)
4. Concurrent calls are deduplicated: a single in-flight `Promise` is reused until resolved

Every Violet API call sends three headers:

```
X-Violet-Token: <jwt>
X-Violet-App-Id: <appId>
X-Violet-App-Secret: <appSecret>
```

Known workaround: special characters in the Violet password (e.g. `!`) must be Unicode-escaped (`\u0021`) in the login body. Standard `JSON.stringify` produces literals that cause a `500` from Violet's parser.

### 7. Supabase Edge Functions → OpenAI

`_shared/openai.ts` wraps the OpenAI Embeddings API.

- Model: `text-embedding-3-small`
- Output: 1536-dimensional vector stored as `pgvector` in `product_embeddings`
- Called by: `generate-embeddings` (product upsert pipeline), `search-products` (per-query)

### 8. Supabase Edge Functions → Resend

Three functions send email via Resend's REST API (no npm SDK — Deno cannot use Node packages):

| Function             | Emails sent                                                           |
| -------------------- | --------------------------------------------------------------------- |
| `send-notification`  | `order_confirmed`, `bag_shipped`, `bag_delivered`, `refund_processed` |
| `send-support-email` | Admin alert + visitor confirmation on support inquiry submission      |
| `send-support-reply` | Admin reply to customer                                               |

All three use `Idempotency-Key` headers to prevent duplicate sends across retries. `send-notification` implements a 3-attempt retry loop with exponential backoff (0ms, 1s, 3s); the support functions make a single attempt.

### 9. Supabase Edge Functions → Expo Push API

`send-push` sends batch push notifications to `https://exp.host/--/api/v2/push/send`.

Each registered device has a row in `user_push_tokens`. The function:

1. Fetches all tokens for the target `user_id`
2. Sends one message per token in a single batch request
3. Processes the per-token `tickets` array from Expo's response
4. Deletes tokens that return `DeviceNotRegistered`

### 10. web → Stripe

The web app uses Stripe Elements (client-side) for payment:

1. Violet creates a `PaymentIntent` when the cart is created (`wallet_based_checkout: true`)
2. `payment_intent_client_secret` is returned in cart responses
3. The web client mounts `<PaymentElement>` with this secret
4. On payment confirmation, Stripe calls back to Violet (server-side webhook), which triggers the order status progression

### 11. mobile → Stripe

The mobile app uses `@stripe/stripe-react-native` with the `PaymentSheet` API:

1. Same `payment_intent_client_secret` obtained from the cart Edge Function
2. `initPaymentSheet({ paymentIntentClientSecret })` → `presentPaymentSheet()`
3. On success, the app submits the Violet order via `POST /cart/{id}/submit`

---

## Data flow diagrams

### Product search

```
User types query
      │
      ▼
web (browser) or mobile app
      │  POST { query, filters?, limit? }
      ▼
search-products Edge Function
      │
      ├─ 1. Validate Zod schema
      ├─ 2. Extract user from JWT (optional)
      ├─ 3. Check personalization opt-out preference
      │
      ├─ 4. POST /embeddings → OpenAI text-embedding-3-small
      │         └─ returns float[1536]
      │
      ├─ 5. match_products(embedding, threshold=0.3) → Supabase RPC
      │         └─ pgvector cosine similarity → product_id[], similarity[]
      │
      ├─ 6. Parallel:
      │    ├─ GET /catalog/offers/{id} × N → Violet API (live price, stock)
      │    └─ get_user_search_profile(user_id) → Supabase RPC
      │
      ├─ 7. Apply post-search filters on enriched data
      ├─ 8. Apply personalization boost (if authenticated + opted in)
      ├─ 9. Generate match explanations (template-based, no LLM)
      │
      └─ Response: { data: { results[], personalized, total }, error }
```

### Checkout

```
User fills cart and submits payment
      │
      ▼
web (server function) or mobile (Edge Function)
      │
      ├─ POST /cart → Violet API (creates cart + Stripe PaymentIntent)
      │    └─ cart receives payment_intent_client_secret
      │
      ├─ POST /cart/{id}/skus → Violet API (add items)
      ├─ POST /cart/{id}/shipping_address → Violet API
      ├─ GET  /cart/{id}/shipping/available → Violet API (2-5s, carrier APIs)
      ├─ POST /cart/{id}/shipping → Violet API (select method per bag)
      ├─ POST /cart/{id}/customer → Violet API (guest info if needed)
      │
      ├─ Stripe PaymentSheet / PaymentElement (client-side)
      │    └─ confirmPayment(payment_intent_client_secret)
      │         └─ Stripe charges card, notifies Violet
      │
      ├─ POST /cart/{id}/submit → Violet API (finalize order)
      │    └─ returns order with violet_order_id
      │
      ├─ Supabase: insert order row (violet_order_id, status, email, etc.)
      │
      └─ supabase.functions.invoke("send-notification", { order_confirmed })
           └─ Resend API → confirmation email to customer
```

### Webhook processing

```
Violet.io sends event (up to 10 retries over 24h)
      │
      ▼
handle-webhook Edge Function
      │
      ├─ 1. Read raw body as text (HMAC needs raw string)
      │
      ├─ 2. Phase 1 header validation (hmac + eventId + eventType present)
      │    └─ 400 if malformed
      │
      ├─ 3. Phase 2 eventType enum check
      │    └─ 200 + log if unknown type (prevents Violet suspension)
      │
      ├─ 4. HMAC-SHA256 validation (rawBody × VIOLET_APP_SECRET)
      │    └─ 401 if invalid (ONLY non-2xx response)
      │
      ├─ 5. Idempotency: SELECT webhook_events WHERE event_id = ?
      │    └─ 200 if already processed
      │
      ├─ 6. INSERT webhook_events (status: received, UNIQUE constraint)
      │    └─ 200 on unique violation (race condition guard)
      │
      ├─ 7. Route to processor by eventType:
      │
      │    OFFER_* ──► processOfferAdded/Updated/Removed/Deleted
      │                  └─ supabase.functions.invoke("generate-embeddings")
      │                       └─ OpenAI embedding → product_embeddings upsert
      │
      │    ORDER_* ──► processOrderUpdated
      │                  └─ UPDATE orders SET status = ?
      │
      │    BAG_SHIPPED ──► processBagShipped
      │                  ├─ UPDATE order_bags SET tracking_number, carrier
      │                  └─ invoke("send-notification", { bag_shipped })
      │                       └─ invoke("send-push", { order_shipped })
      │
      │    BAG_COMPLETED ──► processBagUpdated
      │                  └─ invoke("send-notification", { bag_delivered })
      │
      │    BAG_REFUNDED ──► processBagRefunded
      │                  ├─ GET /orders/{id}/bags/{id}/refunds → Violet API
      │                  ├─ UPSERT order_refunds
      │                  └─ invoke("send-notification", { refund_processed })
      │
      └─ 8. UPDATE webhook_events SET status = processed|failed
           │
           └─ 200 to Violet (always)
                │
                ▼
        Supabase Realtime broadcast
                │
                ▼
        web / mobile clients
        (subscribed to orders / order_bags channels)
```

---

## Shared code strategy

### The Deno/Node split

Edge Functions run in the Deno runtime and cannot import from the monorepo's Node/Bun workspace packages (`@ecommerce/shared`, `@ecommerce/ui`). Two files therefore exist in both environments:

| Canonical (Node)                                  | Edge Function copy (Deno)                                 | What is duplicated                                                    |
| ------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------- |
| `packages/shared/src/clients/violetAuth.ts`       | `supabase/functions/_shared/violetAuth.ts`                | `VioletTokenManager`, `violetLogin`, `violetRefreshToken`             |
| `packages/shared/src/schemas/search.schema.ts`    | `supabase/functions/_shared/schemas.ts` (search section)  | `searchQuerySchema`                                                   |
| `packages/shared/src/schemas/webhook.schema.ts`   | `supabase/functions/_shared/schemas.ts` (webhook section) | All webhook event schemas                                             |
| `packages/shared/src/types/notification.types.ts` | `supabase/functions/send-push/types.ts`                   | `PushNotificationType`, `NotificationType`, `PUSH_TYPE_TO_PREFERENCE` |

Each copy carries a `// SYNC:` comment pointing to its counterpart. Any change to one must be applied to the other. A CI check comparing the two copies is a known TODO.

### Cross-platform `queryOptions` factories

Hooks in `packages/shared/src/hooks/` (e.g. `useProducts`, `useCart`, `useSearch`) are built around TanStack Query `queryOptions` factories that accept a platform-injected `fetchFn`. This allows:

- **Web:** passes the TanStack Start `fetch` (with server-side auth context)
- **Mobile:** passes the standard `fetch` (calls Edge Functions)

Business logic (cache keys, stale time, retry config, data transformation) lives in the shared hook once, not duplicated per platform.

### Service role protection on web

`packages/shared/src/clients/supabase.server.ts` exports `getServiceRoleClient()`, which throws at runtime if called in a browser context (`typeof document !== "undefined"`). This prevents the service role key (which bypasses RLS) from being included in client bundles even if accidentally imported.
