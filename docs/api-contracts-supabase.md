# Supabase Edge Functions — API Contracts

All functions are deployed under `https://<project>.supabase.co/functions/v1/<name>`.

All responses use the discriminated union shape `{ data: T | null, error: { code, message } | null }`, except where noted.

CORS preflight (`OPTIONS`) is handled by every function and returns `200` with shared `corsHeaders` (origin-restricted in production via `ALLOWED_ORIGINS` env var).

---

## cart

Proxies the Violet.io checkout cart API for mobile clients. The Violet JWT is kept server-side and never exposed to clients. Cart state is mirrored to Supabase for persistence and real-time subscriptions.

**Auth:** `Authorization: Bearer <supabase-jwt>` (required on every request). The JWT is validated against Supabase Auth before any Violet call is made.

### Routes

| Method   | Path suffix                    | Action                                       |
| -------- | ------------------------------ | -------------------------------------------- |
| `POST`   | `/`                            | Create cart                                  |
| `POST`   | `/{cartId}/skus`               | Add SKU to cart                              |
| `PUT`    | `/{cartId}/skus/{skuId}`       | Update SKU quantity                          |
| `DELETE` | `/{cartId}/skus/{skuId}`       | Remove SKU                                   |
| `GET`    | `/{cartId}`                    | Fetch cart                                   |
| `POST`   | `/{cartId}/shipping_address`   | Set shipping address                         |
| `GET`    | `/{cartId}/shipping/available` | Get available shipping methods               |
| `POST`   | `/{cartId}/shipping`           | Set shipping methods                         |
| `POST`   | `/{cartId}/customer`           | Set guest customer info                      |
| `POST`   | `/{cartId}/billing_address`    | Set billing address                          |
| `POST`   | `/{cartId}/submit`             | Submit order                                 |
| `GET`    | `/orders/{orderId}`            | Fetch order details                          |
| `GET`    | `/user`                        | Get authenticated user's active cart         |
| `POST`   | `/merge`                       | Merge anonymous cart into authenticated cart |
| `POST`   | `/claim`                       | Claim anonymous cart                         |

**Route matching order matters:** `shipping_address` is matched before `shipping` to avoid substring collision.

### Create cart — `POST /`

Request body: none required (channel ID and currency injected from env).

Violet call: `POST /checkout/cart` with `{ channel_id, currency: "USD", wallet_based_checkout: true }`.

`wallet_based_checkout: true` instructs Violet to create a Stripe `PaymentIntent` immediately. Without it, `payment_intent_client_secret` is absent and the Stripe payment flow breaks.

### Add SKU — `POST /{cartId}/skus`

```json
{
  "sku_id": "12345",
  "quantity": 2,
  "product_name": "...",
  "thumbnail_url": "..."
}
```

`product_name` and `thumbnail_url` are optional display metadata stored in the `cart_items` table (Violet's cart API returns only sku_id and price, no product metadata).

### Get available shipping — `GET /{cartId}/shipping/available`

Calls Violet's carrier APIs. Expect 2–5 seconds latency. Clients must show a loading state. Requires shipping address to have been set first.

Response: transformed `ShippingMethodsAvailable[]` (snake_case Violet response converted to camelCase).

### Set shipping methods — `POST /{cartId}/shipping`

```json
[{ "bag_id": 42, "shipping_method_id": "ups_ground" }]
```

One entry per bag. Returns a "priced cart" with updated `shipping_total` per bag.

### Authentication errors

| Code                      | Status | Meaning                                     |
| ------------------------- | ------ | ------------------------------------------- |
| `AUTH.NO_AUTH_HEADER`     | 401    | Missing or malformed `Authorization` header |
| `AUTH.INVALID_TOKEN`      | 401    | JWT expired or rejected by Supabase Auth    |
| `AUTH.AUTH_SERVICE_ERROR` | 503    | Supabase Auth service unavailable           |

Errors are logged to the `error_logs` table (fire-and-forget, non-fatal if logging itself fails).

---

## generate-embeddings

Generates an OpenAI vector embedding for a product and upserts it into `product_embeddings` for pgvector search.

**Auth:** `Authorization: Bearer <supabase-service-role-key>`. The Bearer token is compared against `SUPABASE_SERVICE_ROLE_KEY`. Calls with the anon key are rejected with `403`.

**Method:** `POST`

### Request body

```json
{
  "productId": "string (required)",
  "productName": "string (required)",
  "description": "string",
  "vendor": "string",
  "tags": ["string"],
  "category": "string"
}
```

Validated with Zod. Returns `400` with field-level error messages on validation failure.

The function concatenates all fields into a single text string before calling OpenAI:
`"{productName}. {description}. Brand: {vendor}. Category: {category}. Tags: {tags}"`

### Response

```json
{ "data": { "productId": "...", "embeddingSize": 1536 }, "error": null }
```

Embedding model: `text-embedding-3-small` (1536 dimensions). Stored in `product_embeddings` with `upsert` on `product_id` conflict.

### Error codes

| Code                           | Status | Meaning                          |
| ------------------------------ | ------ | -------------------------------- |
| `EMBEDDINGS.UNAUTHORIZED`      | 403    | Not called with service_role key |
| `EMBEDDINGS.INVALID_INPUT`     | 400    | Zod validation failed            |
| `EMBEDDINGS.STORAGE_FAILED`    | 500    | Supabase upsert error            |
| `EMBEDDINGS.GENERATION_FAILED` | 500    | OpenAI API error                 |

---

## get-recommendations

Returns semantically similar products for a given product using pgvector cosine similarity. Does not generate a new embedding — reuses the source product's existing embedding as the query vector.

**Auth:** `Authorization: Bearer <supabase-jwt>` (optional). If provided and valid (non-anonymous), personalization boosting is applied based on user browsing history. `user_id` is always extracted from the JWT, never from the request body.

**Method:** `POST`

### Request body

```json
{
  "product_id": "string (required)",
  "limit": 8
}
```

`limit`: integer 1–20, default `8`. The field `user_id` is accepted by the schema for backward compatibility but is silently ignored — user identity comes from the JWT only.

### Response

```json
{
  "data": {
    "products": [
      {
        "id": "string",
        "name": "string",
        "description": "string",
        "minPrice": 0,
        "maxPrice": 0,
        "currency": "USD",
        "available": true,
        "vendor": "string",
        "source": "string",
        "externalUrl": "string",
        "thumbnailUrl": "string | null",
        "similarity": 0.85
      }
    ],
    "personalized": false
  },
  "error": null
}
```

`personalized: true` when the user profile has `total_events > 0` and the boost was applied.

Products whose Violet fetch fails are excluded from the response (partial results are acceptable). If the source product has no embedding, returns `{ products: [], personalized: false }` without error.

pgvector similarity threshold: `0.3`. Requests `limit + 1` matches to account for self-exclusion.

### Processing order

1. Validate Zod schema
2. Extract `user_id` from JWT (non-fatal if absent)
3. Fetch source product embedding from `product_embeddings`
4. `match_products` RPC (cosine similarity, threshold 0.3)
5. Filter out source product
6. Fetch Violet product data + user search profile (parallel)
7. Apply personalization boost if user profile has events
8. Return enriched product list

### Error codes

| Code                              | Status | Meaning                              |
| --------------------------------- | ------ | ------------------------------------ |
| `RECOMMENDATIONS.INVALID_REQUEST` | 400    | Zod validation failed                |
| `RECOMMENDATIONS.QUERY_FAILED`    | 500    | pgvector RPC error                   |
| `RECOMMENDATIONS.INTERNAL_ERROR`  | 500    | Unexpected error (message sanitized) |

---

## guest-order-lookup

Looks up guest orders without a Supabase session. Used by both web (server functions) and mobile. Two distinct lookup modes.

**Method:** `POST`

### Mode 1: Token lookup

**Auth:** None — the token's 256-bit entropy serves as the authentication factor.

```json
{ "type": "token", "token": "<base64url-plaintext-token>" }
```

Flow: SHA-256 hash of plaintext token → query `orders` by `order_lookup_token_hash`.

Returns a single order with nested `order_bags`, `order_items`, and `order_refunds`, or `{ data: null, error: null }` if not found (no information leakage about which tokens exist).

### Mode 2: Email (OTP) lookup

**Auth:** `Authorization: Bearer <supabase-otp-jwt>` (required). The JWT must be from a valid Supabase OTP session. The verified email from `supabase.auth.getUser(jwt)` is used to query orders.

```json
{ "type": "email" }
```

Returns an array of orders (descending by `created_at`), each with nested bags, items, and refunds.

### Error codes

| Code                 | Status  | Meaning                                                                      |
| -------------------- | ------- | ---------------------------------------------------------------------------- |
| `METHOD_NOT_ALLOWED` | 405     | Non-POST request                                                             |
| `INVALID_BODY`       | 400     | Malformed JSON                                                               |
| `INVALID_TYPE`       | 400     | `type` is not `"token"` or `"email"`                                         |
| `MISSING_TOKEN`      | 400/401 | Token missing for token mode, or Authorization header missing for email mode |
| `NOT_AUTHENTICATED`  | 401     | Invalid OTP JWT                                                              |
| `DB_ERROR`           | 500     | Generic DB error (details not exposed)                                       |

---

## handle-webhook

Single entry point for all inbound Violet.io webhook events. Handles product catalog, order lifecycle, and bag fulfillment events.

**Auth:** HMAC-SHA256 signature. The `X-Violet-Hmac-SHA256` header is validated against the raw request body using `VIOLET_APP_SECRET`. This is the **only** endpoint that uses HMAC auth rather than Supabase JWT.

**Method:** `POST`

**Critical behavior:** Returns `200` for all outcomes except HMAC failure (`401`). Returning non-2xx causes Violet to retry, which can trigger webhook suspension after 50+ failures in 30 minutes.

### Request headers

| Header                 | Description                                    |
| ---------------------- | ---------------------------------------------- |
| `X-Violet-Hmac-SHA256` | HMAC-SHA256 signature of raw body              |
| `X-Violet-Event-Id`    | Unique event identifier (used for idempotency) |
| `X-Violet-Topic`       | Event type string                              |

### Two-phase header validation

**Phase 1:** Validate that `hmac`, `eventId`, and `eventType` are present as non-empty strings. Returns `400` if malformed (Violet won't fix this by retrying).

**Phase 2:** Validate `eventType` against the known enum. Unknown event types return `200` with a log entry rather than `400` — prevents Violet from disabling the endpoint when new event types arrive before handler code is deployed.

### Handled event types

| Category | Event                    | Action                                                                                               |
| -------- | ------------------------ | ---------------------------------------------------------------------------------------------------- |
| Offer    | `OFFER_ADDED`            | Generate product embedding via `generate-embeddings`                                                 |
| Offer    | `OFFER_UPDATED`          | Regenerate embedding with updated data                                                               |
| Offer    | `OFFER_REMOVED`          | Soft-delete: set `available = false` in embeddings                                                   |
| Offer    | `OFFER_DELETED`          | Soft-delete: set `available = false` in embeddings                                                   |
| Sync     | `PRODUCT_SYNC_STARTED`   | Audit trail only                                                                                     |
| Sync     | `PRODUCT_SYNC_COMPLETED` | Audit trail only                                                                                     |
| Sync     | `PRODUCT_SYNC_FAILED`    | Audit trail only                                                                                     |
| Order    | `ORDER_UPDATED`          | Update `orders.status`                                                                               |
| Order    | `ORDER_COMPLETED`        | Update `orders.status`                                                                               |
| Order    | `ORDER_CANCELED`         | Update `orders.status`                                                                               |
| Order    | `ORDER_REFUNDED`         | Update `orders.status`                                                                               |
| Order    | `ORDER_RETURNED`         | Update `orders.status`                                                                               |
| Bag      | `BAG_SUBMITTED`          | Update bag status + derive order status                                                              |
| Bag      | `BAG_ACCEPTED`           | Update bag status + derive order status                                                              |
| Bag      | `BAG_SHIPPED`            | Persist tracking info + trigger `send-notification`                                                  |
| Bag      | `BAG_COMPLETED`          | Update bag status + trigger `send-notification` (delivery)                                           |
| Bag      | `BAG_CANCELED`           | Update bag status + derive order status                                                              |
| Bag      | `BAG_REFUNDED`           | Fetch refund details from Violet Refund API → store in `order_refunds` + trigger `send-notification` |

### Idempotency

Two-level deduplication against Violet's at-least-once delivery (up to 10 retries over 24h):

1. **SELECT check:** If `event_id` exists in `webhook_events`, return `200` immediately.
2. **INSERT with UNIQUE constraint:** Race condition guard. If two concurrent requests both pass the SELECT check, the second INSERT fails with code `23505` (unique violation) and returns `200`.

The event row is inserted with `status: "received"` before processing begins. If the function times out mid-processing, the row remains in "received" state and can be retried.

### Known limitation

Supabase Edge Functions (Deno) do not support background tasks. The entire flow — including the `generate-embeddings` invocation that calls OpenAI — runs synchronously before the `200` response is sent. If OpenAI takes >5s, the total may approach Violet's 10s timeout expectation. Idempotency protects against duplicate processing on Violet retries.

---

## health-check

Checks connectivity to Supabase DB, Violet API, and Stripe in parallel. Intended for external uptime monitors (UptimeRobot, Pingdom) and internal dashboards.

**Auth:** `Authorization: Bearer <token>` where token is either `HEALTH_CHECK_SECRET` or `SUPABASE_SERVICE_ROLE_KEY`. Returns `401` if neither matches.

**Method:** `GET`

### Response

```json
{
  "data": {
    "overall_status": "healthy | degraded | down",
    "services": {
      "supabase": { "status": "up | down | unknown", "latency_ms": 42 },
      "violet": { "status": "up | down | unknown", "latency_ms": 310 },
      "stripe": { "status": "up | down | unknown", "latency_ms": 95 }
    },
    "checked_at": "2026-03-28T12:00:00.000Z"
  },
  "error": null
}
```

**`overall_status` logic:**

- `healthy` — no services are `down`
- `degraded` — at least one (but not all) services are `down`
- `down` — all services are `down`

`unknown` status means the service credentials are not configured (not counted as `down`).

**Violet connectivity check:** Uses `GET /v1/catalog/categories` with app credentials. Any non-network response (including `401`/`403`) counts as reachable. Timeout: 10 seconds.

**Stripe connectivity check:** Uses `GET /v1/charges?limit=0`. Timeout: 10 seconds.

Each service check is independent — a failure in one does not affect the others.

---

## search-products

Natural language semantic product search. Generates an embedding from the query, runs pgvector cosine similarity against `product_embeddings`, enriches results with live Violet data, and optionally applies personalization boosting.

**Auth:** `Authorization: Bearer <supabase-jwt>` (optional). Authenticated non-anonymous users receive personalized result ordering. Users who have opted out via `user_profiles.preferences.personalized_search = false` receive base similarity ordering.

**Method:** `POST`

### Request body

```json
{
  "query": "string (2–500 chars, required)",
  "filters": {
    "category": "string",
    "minPrice": 1000,
    "maxPrice": 5000,
    "inStock": true,
    "merchantId": "string"
  },
  "limit": 12
}
```

Prices are integer cents (e.g., `2999` = $29.99). `limit`: integer 1–50, default `12`.

### Response

```json
{
  "data": {
    "query": "running shoes",
    "results": [
      {
        "id": "string",
        "name": "string",
        "description": "string",
        "minPrice": 0,
        "maxPrice": 0,
        "currency": "USD",
        "available": true,
        "vendor": "string",
        "thumbnailUrl": "string | null",
        "similarity": 0.82,
        "matchExplanation": "Matches your search for \"shoes\" — 82% relevant"
      }
    ],
    "personalized": false,
    "total": 8
  },
  "error": null
}
```

`matchExplanation` is generated from query term matching against `text_content` — no LLM call, staying within the 2s response budget.

### Processing order

1. Zod validation
2. Extract user from JWT (non-fatal)
3. Check `personalized_search` preference flag
4. Generate query embedding via OpenAI `text-embedding-3-small`
5. `match_products` RPC (threshold 0.3)
6. Fetch Violet product data + user search profile (parallel)
7. Apply post-search filters on enriched data
8. Apply personalization boost if applicable
9. Generate match explanations
10. Return results

Individual Violet fetch failures are logged and the product is excluded — partial results are acceptable.

### Error codes

| Code                   | Status | Meaning               |
| ---------------------- | ------ | --------------------- |
| `SEARCH.INVALID_QUERY` | 400    | Zod validation failed |
| `SEARCH.QUERY_FAILED`  | 500    | pgvector RPC error    |

---

## send-notification

Sends transactional emails for order lifecycle events via the Resend API. Invoked fire-and-forget from `handle-webhook` processors using `supabase.functions.invoke()`.

**Auth:** None enforced (invoked internally). Always returns `HTTP 200` — callers use fire-and-forget and do not inspect the response.

**Method:** `POST`

### Request body

```json
{
  "type": "order_confirmed | bag_shipped | bag_delivered | refund_processed",
  "order_id": "string (Violet numeric order ID as string)",
  "bag_id": "number (required for all types except order_confirmed)"
}
```

`order_id` is Violet's numeric order ID (not the Supabase UUID). The function queries `orders` by `violet_order_id`.

### Supported notification types

| Type               | Trigger                                       |
| ------------------ | --------------------------------------------- |
| `order_confirmed`  | Checkout submission (direct invocation)       |
| `bag_shipped`      | `BAG_SHIPPED` webhook → `processBagShipped`   |
| `bag_delivered`    | `BAG_COMPLETED` webhook → `processBagUpdated` |
| `refund_processed` | `BAG_REFUNDED` webhook → `processBagRefunded` |

Note: `BAG_CANCELED` (merchant rejection without refund) does not trigger an email.

### Delivery pipeline

- Resend API via raw `fetch` (no npm SDK — Deno runtime constraint)
- Up to 3 attempts with exponential backoff: 0ms, 1s, 3s
- Non-retryable HTTP statuses (400, 401, 403, 404, 422) fail immediately
- Retryable statuses (429, 500) and network errors trigger the next attempt
- `Idempotency-Key`: `{order_uuid}-{type}[-{bag_uuid}]` — deduplicated by Resend within 24 hours
- All attempts logged to `notification_logs` table
- Sets `orders.email_sent = true` on first successful send

---

## send-push

Sends mobile push notifications via the Expo Push API to registered devices.

**Auth:** `Authorization: Bearer <supabase-service-role-key>`. Verified against `SUPABASE_SERVICE_ROLE_KEY`. Invoked by other Edge Functions via `supabase.functions.invoke()`, which automatically sends the service role key.

**Method:** `POST`

### Request body

```json
{
  "user_id": "uuid",
  "type": "order_confirmed | order_shipped | order_delivered | refund_processed | price_drop | back_in_stock",
  "title": "string",
  "body": "string",
  "data": {}
}
```

### Delivery pipeline

1. Validate payload
2. Check `notification_preferences` table — skip if user opted out (transactional default: on; marketing default: off)
3. Anti-spam check for engagement types (`price_drop`, `back_in_stock`): max 1 per user per 24 hours
4. Fetch all `expo_push_token` rows for `user_id` from `user_push_tokens`
5. Batch send to `https://exp.host/--/api/v2/push/send`
6. Process per-token tickets: `DeviceNotRegistered` errors trigger token deletion
7. Log to `notification_logs` (push types prefixed with `push_`)

Graceful skips (all return `200`):

- No push tokens registered
- User opted out of the notification category
- Marketing default off (no preference row)
- Anti-spam limit reached
- `SUPABASE_SERVICE_ROLE_KEY` not configured

Note: `recipient_email` column in `notification_logs` stores `user_id` for push entries (no dedicated column exists yet).

---

## send-support-email

Sends two emails when a visitor submits a support inquiry: an admin alert and a visitor confirmation.

**Auth:** None enforced (invoked fire-and-forget from `submitSupportHandler` or mobile). Always returns `HTTP 200`.

**Method:** `POST`

### Request body

```json
{
  "inquiry_id": "string (required)",
  "name": "string (required)",
  "email": "string (required)",
  "subject": "string",
  "message": "string",
  "order_id": "string | null"
}
```

### Behavior

- Sends admin alert to `SUPPORT_EMAIL` env var
- Sends confirmation to `payload.email`
- Idempotency keys: `support-admin-{inquiry_id}` and `support-confirm-{inquiry_id}`
- Both sends are independent — failure of one does not block the other
- Missing `RESEND_API_KEY` → returns `{ data: { sent: false } }` without error

### Response

```json
{ "data": { "sent": true, "admin": true, "confirmation": true }, "error": null }
```

---

## send-support-reply

Sends an admin reply to a customer's support inquiry.

**Auth:** None enforced (invoked fire-and-forget from `replySupportInquiryHandler` on web server). Always returns `HTTP 200`.

**Method:** `POST`

### Request body

```json
{
  "inquiry_id": "string (required)",
  "customer_email": "string (required)",
  "customer_name": "string",
  "subject": "string",
  "reply_message": "string (required)",
  "admin_email": "string"
}
```

Idempotency key: `support-reply-{inquiry_id}-{hash}` where hash is a deterministic integer derived from `reply_message` content. Same inquiry + same message body = same key = Resend deduplicates.

---

## track-event

Records user browsing events for personalization. Skips anonymous users silently.

**Auth:** `Authorization: Bearer <supabase-jwt>` (required). Returns `401` if missing. Anonymous users return `200` with `{ ok: true, skipped: true }` — no error.

**Method:** `POST`

### Request body

```json
{
  "event_type": "product_view | search | category_view",
  "payload": {}
}
```

Payload shape is validated per event type:

| `event_type`    | Required payload fields                 |
| --------------- | --------------------------------------- |
| `product_view`  | `product_id: string`                    |
| `search`        | `query: string`, `result_count: number` |
| `category_view` | `category_id: string`                   |

Additional payload fields are allowed (forward compatibility). Events are written to `user_events` via service role client (bypasses RLS).

### Response

```json
{ "ok": true }
```

---

## Environment variables summary

| Variable                    | Used by                                                                    |
| --------------------------- | -------------------------------------------------------------------------- |
| `SUPABASE_URL`              | All functions                                                              |
| `SUPABASE_ANON_KEY`         | cart, search-products, get-recommendations, track-event                    |
| `SUPABASE_SERVICE_ROLE_KEY` | All functions (admin client)                                               |
| `VIOLET_APP_ID`             | cart, health-check, search-products, get-recommendations, handle-webhook   |
| `VIOLET_APP_SECRET`         | cart, health-check, search-products, get-recommendations, handle-webhook   |
| `VIOLET_USERNAME`           | cart, search-products, get-recommendations, handle-webhook                 |
| `VIOLET_PASSWORD`           | cart, search-products, get-recommendations, handle-webhook                 |
| `VIOLET_API_BASE`           | All Violet-calling functions (default: `https://sandbox-api.violet.io/v1`) |
| `OPENAI_API_KEY`            | generate-embeddings, search-products                                       |
| `STRIPE_SECRET_KEY`         | health-check                                                               |
| `RESEND_API_KEY`            | send-notification, send-support-email, send-support-reply                  |
| `HEALTH_CHECK_SECRET`       | health-check                                                               |
| `SUPPORT_EMAIL`             | send-support-email                                                         |
| `EMAIL_FROM_ADDRESS`        | send-notification, send-support-email, send-support-reply                  |
| `APP_URL`                   | send-notification, send-support-email                                      |
| `ALLOWED_ORIGINS`           | All functions (CORS — production only)                                     |
