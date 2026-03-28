# Architecture — Supabase Infrastructure

## Executive Summary

PostgreSQL 17 database with Supabase Auth, 12 Deno v2 Edge Functions, Realtime
subscriptions, and pgvector for AI-powered semantic search. 35 timestamped migrations
define the complete schema. JWT expiry: 3600s (1 hour). Anonymous sign-ins are enabled.

---

## Database Architecture

### PostgreSQL Configuration

- **Version**: PostgreSQL 17 (configured in `supabase/config.toml`, `major_version = 17`)
- **Extension**: `pgvector` — 1536-dimensional embeddings (OpenAI `text-embedding-3-small`),
  HNSW index with cosine distance ops
- **API max rows**: 1000 per request (accidental query guard)
- **Pooler**: disabled in local config; configure for production via Supabase dashboard

### Schema Domains

| Domain                   | Tables                                                 |
| ------------------------ | ------------------------------------------------------ |
| Auth / Users             | `user_profiles`, `auth.users` (managed by Supabase)    |
| Products / Search        | `product_embeddings`                                   |
| Cart                     | `carts`, `cart_items`                                  |
| Orders                   | `orders`, `order_bags`, `order_items`, `order_refunds` |
| Webhooks                 | `webhook_events`                                       |
| Notifications            | `notification_logs`, `push_notification_subscriptions` |
| Search / Personalization | `user_events`, `wishlists`                             |
| Content / CMS            | `content_pages`                                        |
| Support                  | `support_inquiries` (+ FAQ embedded in content_pages)  |
| Admin                    | Views (`admin_views`), alert rules                     |
| Error Tracking           | `error_logs`                                           |
| Health                   | `alert_rules`                                          |

### Row-Level Security

RLS is enabled on every table — no exceptions. The fundamental pattern is:

```sql
CREATE POLICY "users_own_data" ON public.some_table
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

Admin access is granted via additive policies using the `is_admin()` function (see
[Admin Role](#admin-role)). Product embeddings use a split policy: `SELECT` allowed for
all roles (`USING (true)`), write operations restricted to `service_role` only.

### Realtime

Enabled for: `carts`, `cart_items`, `orders`, `order_bags`, `order_refunds`.

Realtime propagation is triggered after webhook processing — the `handle-webhook` Edge
Function updates DB rows, which Supabase Realtime then broadcasts to subscribed clients.

### Key Database Functions (RPCs)

| Function                  | Signature                                                                | Purpose                                                          |
| ------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `match_products`          | `(query_embedding vector(1536), match_threshold float, match_count int)` | Cosine similarity search over product embeddings                 |
| `get_user_search_profile` | `(p_user_id UUID) → JSONB`                                               | Aggregates browsing/order history into a personalization profile |
| `is_admin`                | `() → BOOLEAN`                                                           | Checks `auth.jwt() → app_metadata → user_role = 'admin'`         |
| `fn_health_metrics`       | `(p_hours INTEGER) → TABLE(...)`                                         | Aggregates error and webhook stats for admin health dashboard    |
| `set_admin_role`          | `(target_user_id UUID)`                                                  | Grants admin via `raw_app_meta_data` update (service_role only)  |
| `remove_admin_role`       | `(target_user_id UUID)`                                                  | Revokes admin role                                               |
| `handle_updated_at`       | trigger function                                                         | Auto-updates `updated_at` on row change (shared across tables)   |

**`match_products` detail:**

```sql
-- Default threshold 0.3, returns up to 12 results ordered by cosine distance
SELECT * FROM match_products(
  query_embedding := $1,
  match_threshold := 0.3,
  match_count     := 12
);
```

**`get_user_search_profile` output shape:**

```json
{
  "top_categories": [{ "category": "shoes", "view_count": 12 }],
  "avg_order_price": 8500,
  "recent_product_ids": ["offer_123", "offer_456"],
  "total_events": 47
}
```

---

## Edge Functions Architecture

**Runtime**: Deno v2. **Policy**: `per_worker` (hot reload in local dev).
**Entry point per function**: `supabase/functions/<name>/index.ts`.

### Function Inventory

| Function              | Auth                 | Description                                |
| --------------------- | -------------------- | ------------------------------------------ |
| `cart`                | Supabase JWT         | Violet cart proxy for mobile (15 routes)   |
| `generate-embeddings` | Service role         | OpenAI → pgvector upsert                   |
| `search-products`     | Optional JWT         | Semantic search pipeline                   |
| `get-recommendations` | Optional JWT         | Cosine similarity + personalization        |
| `handle-webhook`      | HMAC-SHA256          | 16 Violet event types, idempotent          |
| `guest-order-lookup`  | Token hash / OTP JWT | Guest order status retrieval               |
| `send-notification`   | Internal             | Transactional email via Resend (3 retries) |
| `send-push`           | Internal             | Expo push notifications with anti-spam     |
| `send-support-email`  | Internal             | Admin alert + visitor confirmation         |
| `send-support-reply`  | Internal             | Admin reply to customer                    |
| `health-check`        | Bearer secret        | DB + Violet + Stripe connectivity check    |
| `track-event`         | Supabase JWT         | User browsing event recording              |

### cart — Violet Cart Proxy

Keeps the Violet session token server-side; never exposes it to mobile clients.
Persists cart state to Supabase after each mutation. Requires a valid Supabase JWT.

**Routes (15 total):**

| Method   | Path                            | Action                                       |
| -------- | ------------------------------- | -------------------------------------------- |
| `POST`   | `/cart`                         | Create cart                                  |
| `POST`   | `/cart/{id}/skus`               | Add SKU                                      |
| `PUT`    | `/cart/{id}/skus/{skuId}`       | Update quantity                              |
| `DELETE` | `/cart/{id}/skus/{skuId}`       | Remove SKU                                   |
| `GET`    | `/cart/{id}`                    | Fetch cart                                   |
| `POST`   | `/cart/{id}/shipping_address`   | Set shipping address                         |
| `GET`    | `/cart/{id}/shipping/available` | Get available shipping methods               |
| `POST`   | `/cart/{id}/shipping`           | Set shipping methods                         |
| `POST`   | `/cart/{id}/customer`           | Set guest customer info                      |
| `POST`   | `/cart/{id}/billing_address`    | Set billing address                          |
| `POST`   | `/cart/{id}/submit`             | Submit order                                 |
| `GET`    | `/orders/{orderId}`             | Fetch order details                          |
| `GET`    | `/cart/user`                    | Get user's active cart                       |
| `POST`   | `/cart/merge`                   | Merge anonymous cart into authenticated cart |
| `POST`   | `/cart/claim`                   | Claim anonymous cart                         |

> **Route ordering note**: `/shipping_address` must be matched before `/shipping` to
> avoid substring collision.

### search-products — Semantic Search Pipeline

```
1. Zod input validation
2. Extract authenticated user from JWT (optional — for personalization)
3. Generate query embedding via OpenAI text-embedding-3-small
4. pgvector cosine similarity search → match_products() RPC
5. Fetch live product data from Violet API (parallel with user profile fetch)
6. Apply post-search filters on enriched data
7. Apply personalization boost (authenticated users only)
8. Generate template-based match explanations (no LLM — 2s budget)
9. Return { data, error } discriminated union
```

### get-recommendations

Uses `match_products()` (cosine similarity on a reference product embedding) then
applies the same `applyPersonalizationBoost()` scoring from `_shared/personalization.ts`.

### handle-webhook

See [Webhook Processing Pipeline](#webhook-processing-pipeline) below.

### health-check

Checks DB (query on `alert_rules`), Violet (API reachability), and Stripe (key
validation) independently. Protected by `HEALTH_CHECK_SECRET` bearer token — allows
external uptime monitors (UptimeRobot, Pingdom) to call without Supabase JWTs.

```json
{
  "overall_status": "healthy",
  "services": {
    "supabase": { "status": "up", "latency_ms": 12 },
    "violet": { "status": "up", "latency_ms": 340 },
    "stripe": { "status": "up", "latency_ms": 88 }
  },
  "checked_at": "2026-03-28T10:00:00.000Z"
}
```

---

## Shared Utilities (`_shared/`)

7 files shared across Edge Functions. Deno cannot import from the Node workspace
(`@ecommerce/shared`), so critical business logic is duplicated here.

| File                 | Purpose                                                                     |
| -------------------- | --------------------------------------------------------------------------- |
| `cors.ts`            | CORS headers; restricts to `ALLOWED_ORIGINS` in production, wildcard in dev |
| `supabaseAdmin.ts`   | `getSupabaseAdmin()` singleton using `SUPABASE_SERVICE_ROLE_KEY`            |
| `violetAuth.ts`      | `VioletTokenManager` — token lifecycle, refresh, singleton per worker       |
| `webhookAuth.ts`     | HMAC-SHA256 signature verification for Violet webhooks                      |
| `openai.ts`          | Embedding generation with retry logic                                       |
| `personalization.ts` | `applyPersonalizationBoost()` — shared scoring formula                      |
| `schemas.ts`         | Zod schemas for all webhook payloads, search inputs, etc.                   |

### Violet Token Manager

Module-scoped singleton (`_manager`) persists across warm invocations. Handles the
full token lifecycle automatically:

- Token lifetime: 24h with a 5-minute refresh buffer
- On first call: logs in with credentials → stores token + refresh token
- Before expiry: calls `/auth/token` with the refresh token
- On refresh failure: falls back to full re-login
- Concurrent requests share a single pending promise (no thundering herd)

**Known workaround**: special characters (e.g., `!`) in passwords are escaped to
`\uXXXX` Unicode sequences to work around a Violet API bug.

### SYNC Constraint — Duplicated Files

`violetAuth.ts` and `schemas.ts` exist in both:

- `supabase/functions/_shared/` (Deno)
- `packages/shared/src/clients/` (Node/web)

**Any change to core logic must be applied to both files.** A CI check comparing
the logic hash between both copies is a known TODO.

### Personalization Scoring Formula

```
final_score = 0.7 × semantic_similarity
            + 0.2 × category_boost
            + 0.1 × price_proximity
```

- `category_boost`: 1.0 (top category), 0.7 (#2), 0.5 (#3), 0.3 (#4–5), 0 otherwise
- `price_proximity`: 1.0 at exact avg price match, 0 at 2× distance, 0.5 if no order
  history

---

## Auth Configuration

From `supabase/config.toml`:

| Setting                         | Value                                 |
| ------------------------------- | ------------------------------------- |
| JWT expiry                      | 3600s (1 hour)                        |
| Refresh token rotation          | enabled                               |
| Refresh token reuse interval    | 10s                                   |
| Anonymous sign-ins              | enabled                               |
| Email confirmations             | disabled (local dev)                  |
| Min password length             | 8 characters                          |
| MFA                             | disabled (requires Supabase Pro plan) |
| SMS sign-in                     | disabled                              |
| Rate limit — anonymous sign-ins | 30 per hour per IP                    |
| Rate limit — sign-in/sign-up    | 30 per 5 minutes per IP               |

### Admin Role

Admin role is stored in `auth.users.raw_app_meta_data` as `{"user_role": "admin"}`.
The JWT automatically includes `app_metadata`, so RLS policies can check it without
extra queries.

**To grant admin access** (run from SQL Editor or `service_role` client):

```sql
SELECT set_admin_role('USER_UUID');
```

**To check in RLS policies:**

```sql
USING (public.is_admin())
```

`set_admin_role()` and `remove_admin_role()` have `EXECUTE` revoked from `PUBLIC`,
`authenticated`, and `anon` — only `service_role` can call them.

---

## Webhook Processing Pipeline

```
Violet → POST /handle-webhook

1. OPTIONS preflight handled (CORS consistency)
2. Reject non-POST with 405
3. Read raw body as text (HMAC must validate the raw string, not parsed JSON)

4. Phase 1 header validation (Zod)
   → validate: hmac, eventId, eventType as non-empty strings
   → 400 on missing/malformed headers

5. Phase 2 eventType validation (Zod enum)
   → unknown event type → log warning + return 200 (no retry trigger)

6. HMAC-SHA256 validation using VIOLET_APP_SECRET
   → 401 on failure (only non-2xx response)

7. Idempotency check
   → SELECT webhook_events WHERE event_id = ? → 200 if already exists

8. INSERT webhook_events (status: "received")
   → UNIQUE constraint on event_id claims the event
   → Concurrent INSERT hitting UNIQUE violation → 200 (already claimed)

9. Parse JSON body → validate with event-specific Zod schema

10. Route to processor, update status to "processed" or "failed"

11. Always return 200 (Violet disables webhooks after 50+ non-2xx in 30 minutes)
```

### Handled Event Types

| Event                                                | Processor             | Action                                                         |
| ---------------------------------------------------- | --------------------- | -------------------------------------------------------------- |
| `OFFER_ADDED`                                        | `processOfferAdded`   | Generate product embedding                                     |
| `OFFER_UPDATED`                                      | `processOfferUpdated` | Re-generate embedding                                          |
| `OFFER_REMOVED`                                      | `processOfferRemoved` | Soft-delete (`available = false`)                              |
| `OFFER_DELETED`                                      | `processOfferDeleted` | Soft-delete (`available = false`)                              |
| `PRODUCT_SYNC_STARTED/COMPLETED/FAILED`              | `processSyncEvent`    | Audit trail only                                               |
| `ORDER_UPDATED/COMPLETED/CANCELED/REFUNDED/RETURNED` | `processOrderUpdated` | Update `orders.status`                                         |
| `BAG_SUBMITTED/ACCEPTED/COMPLETED/CANCELED`          | `processBagUpdated`   | Update bag status + derive order status                        |
| `BAG_SHIPPED`                                        | `processBagShipped`   | Persist tracking info + notification                           |
| `BAG_REFUNDED`                                       | `processBagRefunded`  | Fetch refund details + store in `order_refunds` + notification |

### Known Limitation — Synchronous Processing

Supabase Edge Functions (Deno) do not support `waitUntil()` or background tasks. The
entire pipeline — including the `generate-embeddings` call to OpenAI — runs
synchronously before the 200 response is sent. If OpenAI is slow (>5s), processing may
exceed Violet's 10s expectation, triggering retries.

Mitigation: the event is claimed in DB (step 8) before processing starts. Retries hit
the idempotency check and return 200 instantly. For true async, migrate to Supabase
Queues or `pg_cron` + DB-driven processing.

---

## Environment Variables

### Auto-injected by Supabase (no manual setup)

| Variable                    | Description                     |
| --------------------------- | ------------------------------- |
| `SUPABASE_URL`              | Project API URL                 |
| `SUPABASE_ANON_KEY`         | Public anon key                 |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS) |

### Required secrets (set via `supabase secrets set` or dashboard)

| Variable              | Used by                                                    | Description                                               |
| --------------------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| `VIOLET_APP_ID`       | cart, handle-webhook, search-products, get-recommendations | Violet application ID                                     |
| `VIOLET_APP_SECRET`   | all Violet-calling functions, handle-webhook               | Violet secret (also used for HMAC)                        |
| `VIOLET_USERNAME`     | violetAuth.ts                                              | Violet account email                                      |
| `VIOLET_PASSWORD`     | violetAuth.ts                                              | Violet account password                                   |
| `VIOLET_API_BASE`     | violetAuth.ts                                              | Defaults to `https://sandbox-api.violet.io/v1`            |
| `OPENAI_API_KEY`      | generate-embeddings, search-products                       | OpenAI embeddings API                                     |
| `RESEND_API_KEY`      | send-notification, send-support-email, send-support-reply  | Transactional email                                       |
| `EMAIL_FROM_ADDRESS`  | send-notification, send-support-email                      | Sender address (e.g., `noreply@domain.com`)               |
| `APP_URL`             | send-notification                                          | Base URL for email links                                  |
| `SUPPORT_EMAIL`       | send-support-email                                         | Recipient for admin alerts                                |
| `HEALTH_CHECK_SECRET` | health-check                                               | Bearer token for uptime monitors                          |
| `STRIPE_SECRET_KEY`   | health-check                                               | Stripe key (connectivity check only)                      |
| `ALLOWED_ORIGINS`     | cors.ts                                                    | Comma-separated allowed origins; falls back to `*` in dev |

**Example `.env` file**: `supabase/.env.example`

---

## Migration Strategy

### Naming Convention

```
YYYYMMDDHHMMSS_description.sql
```

Sequential suffixes are used when multiple migrations share a date:
`20260405000000_legal_content_type.sql`, `20260405000001_legal_content_seed.sql`.

### Migration Structure Pattern

```sql
-- Migration: <slug>
-- Story X.Y: <story name>
-- Brief description of what this migration does

CREATE TABLE IF NOT EXISTS public.some_table (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ...;

CREATE TRIGGER ...;

ALTER TABLE public.some_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY "..." ON public.some_table ...;
```

### Seed Data in Migrations

Some migrations embed seed data directly (no separate seed files for that data):

- FAQ items — `20260401000000_faq_and_support.sql`
- Alert rules — `20260404000000_health_monitoring.sql`
- Legal content — `20260405000001_legal_content_seed.sql`

The `supabase/seed.sql` file is reserved for local development bootstrap only.

### Review Fix Migrations

Cross-epic code review fixes are captured in dedicated migrations:
`20260318000000_epic4_review_fixes.sql`, `20260323000000_epic5_review_fixes.sql`,
`20260329000000_epic6_review_fixes.sql`, `20260406000000_epic8_review_fixes.sql`.

---

## Deployment

### GitHub Actions — `edge-functions-deploy.yml`

Triggered on `push` and `pull_request` to `main`.

**`quality` job** (all events):

1. Checkout
2. Setup Bun 1.2.4
3. `bun install --frozen-lockfile`

**`deploy` job** (push to `main` only, requires `quality` to pass):

1. Same setup steps
2. Install Supabase CLI v2.76.8
3. `supabase functions deploy --project-ref "$SUPABASE_PROJECT_REF"`

Deployment is conditional on `SUPABASE_ACCESS_TOKEN` being set — the step is skipped
if the secret is absent, so forks without secrets don't fail.

**Required GitHub secrets:**

| Secret                  | Description                                       |
| ----------------------- | ------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | Personal access token from supabase.com/dashboard |
| `SUPABASE_PROJECT_REF`  | Project reference ID (found in project settings)  |

### Local Development

```bash
# Start local Supabase stack (DB, Auth, Edge Functions, Studio)
supabase start

# Apply migrations
supabase db reset

# Serve a specific Edge Function with hot reload
supabase functions serve handle-webhook --env-file supabase/.env

# Deploy all functions to remote project
supabase functions deploy --project-ref <ref>

# Set production secrets
supabase secrets set OPENAI_API_KEY=sk-... --project-ref <ref>
```

Local Studio runs at `http://127.0.0.1:54323`. Inbucket (email testing) at
`http://127.0.0.1:54324`.
