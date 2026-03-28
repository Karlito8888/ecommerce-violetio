# Data Models — Supabase PostgreSQL

This document describes the complete database schema for the Maison Émile e-commerce platform, derived from 35 migration files applied in chronological order. Violet.io is the source of truth for the product catalog and order fulfillment; Supabase stores user data, mirrors order state, and provides the personalization layer.

All monetary values are stored as **INTEGER cents** to match Violet's format. Use `formatPrice(cents)` from `@ecommerce/shared` for display.

---

## Table of Contents

1. [Core Tables](#core-tables)
   - [user_profiles](#user_profiles)
   - [product_embeddings](#product_embeddings)
   - [webhook_events](#webhook_events)
   - [carts](#carts)
   - [cart_items](#cart_items)
   - [orders](#orders)
   - [order_bags](#order_bags)
   - [order_items](#order_items)
   - [order_refunds](#order_refunds)
   - [wishlists](#wishlists)
   - [wishlist_items](#wishlist_items)
   - [user_events](#user_events)
   - [content_pages](#content_pages)
   - [faq_items](#faq_items)
   - [support_inquiries](#support_inquiries)
   - [user_push_tokens](#user_push_tokens)
   - [notification_preferences](#notification_preferences)
   - [notification_logs](#notification_logs)
   - [error_logs](#error_logs)
   - [alert_rules](#alert_rules)
2. [Materialized Views](#materialized-views)
3. [SQL Functions](#sql-functions)
4. [Entity Relationships](#entity-relationships)
5. [Extensions](#extensions)
6. [Schemas](#schemas)
7. [Data Retention Notes](#data-retention-notes)

---

## Core Tables

### user_profiles

One row per authenticated user. Created automatically by a database trigger when a user registers or converts from anonymous. Anonymous users do not get a profile row.

| Column              | Type        | Constraints                                        | Description                                  |
| ------------------- | ----------- | -------------------------------------------------- | -------------------------------------------- |
| `id`                | UUID        | PK, default gen_random_uuid()                      | Internal surrogate key                       |
| `user_id`           | UUID        | UNIQUE NOT NULL, FK → auth.users ON DELETE CASCADE | Maps to the Supabase auth user               |
| `display_name`      | TEXT        | nullable, max 100 chars                            | User-chosen display name                     |
| `avatar_url`        | TEXT        | nullable, max 500 chars                            | URL to profile picture                       |
| `preferences`       | JSONB       | NOT NULL, default `{}`                             | Arbitrary user preferences (theme, etc.)     |
| `biometric_enabled` | BOOLEAN     | NOT NULL, default false                            | Whether biometric login is enabled on mobile |
| `created_at`        | TIMESTAMPTZ | NOT NULL, default now()                            |                                              |
| `updated_at`        | TIMESTAMPTZ | NOT NULL, default now()                            | Auto-updated by trigger                      |

**Indexes:** `user_profiles_user_id_idx` on `(user_id)`, `idx_user_profiles_display_name` on `(display_name) WHERE display_name IS NOT NULL`.

**RLS policies:**

| Policy                   | Type        | Role          | Operation | Condition                                                   |
| ------------------------ | ----------- | ------------- | --------- | ----------------------------------------------------------- |
| `users_own_profile`      | PERMISSIVE  | all           | ALL       | `(select auth.uid()) = user_id`                             |
| `block_anonymous_writes` | RESTRICTIVE | authenticated | ALL       | `WITH CHECK` rejects anonymous JWT (`is_anonymous != true`) |

The combination of these two policies means authenticated non-anonymous users have full CRUD on their own row; anonymous users can only SELECT.

**Triggers:**

- `user_profiles_updated_at` — `BEFORE UPDATE`, calls `public.handle_updated_at()` to set `updated_at = now()`.
- `on_auth_user_created` on `auth.users` — `AFTER INSERT`, calls `public.handle_new_user()` to create the profile row.
- `on_auth_user_updated` on `auth.users` — `AFTER UPDATE` when `OLD.is_anonymous IS TRUE AND NEW.is_anonymous IS NOT TRUE`, calls `public.handle_new_user()` to create the profile on account conversion.

---

### product_embeddings

Stores OpenAI text embeddings (text-embedding-3-small, 1536 dimensions) for AI-powered semantic product search. Populated and maintained by the `handle-webhook` Edge Function in response to Violet catalog events.

| Column         | Type         | Constraints                   | Description                                                   |
| -------------- | ------------ | ----------------------------- | ------------------------------------------------------------- |
| `id`           | UUID         | PK, default gen_random_uuid() |                                                               |
| `product_id`   | VARCHAR      | UNIQUE NOT NULL               | Violet offer/product ID                                       |
| `product_name` | TEXT         | NOT NULL                      | Product display name                                          |
| `text_content` | TEXT         | NOT NULL                      | Concatenated text used to generate the embedding              |
| `embedding`    | vector(1536) | nullable                      | OpenAI embedding vector                                       |
| `available`    | BOOLEAN      | NOT NULL, default true        | Set to false when Violet fires OFFER_REMOVED or OFFER_DELETED |
| `source`       | VARCHAR      | default `'violet'`            | Data source; reserved for future multi-supplier support       |
| `created_at`   | TIMESTAMPTZ  | NOT NULL, default now()       |                                                               |
| `updated_at`   | TIMESTAMPTZ  | NOT NULL, default now()       | Auto-updated by trigger                                       |

**Indexes:** `idx_product_embeddings_hnsw` — HNSW index on `(embedding vector_cosine_ops)` for fast approximate nearest-neighbour search.

**RLS policies:**

| Policy                        | Role                | Operation                | Condition            |
| ----------------------------- | ------------------- | ------------------------ | -------------------- |
| `product_embeddings_read_all` | anon, authenticated | SELECT                   | `true` (public read) |
| _(implicit deny)_             | anon, authenticated | INSERT / UPDATE / DELETE | No policy = denied   |

Writes are performed exclusively by the `service_role` (Edge Functions), which bypasses RLS.

**Triggers:** `product_embeddings_updated_at` — `BEFORE UPDATE`, calls `public.handle_updated_at()`.

---

### webhook_events

Audit log and idempotency store for all inbound Violet.io webhook deliveries. Every webhook is recorded here before any business logic runs.

Violet retries failed webhooks up to 10 times over 24 hours. Two-level idempotency prevents duplicate processing: a SELECT check on `event_id` for the fast path, and a UNIQUE constraint for the concurrent-request race case.

| Column          | Type        | Constraints                                                                  | Description                                              |
| --------------- | ----------- | ---------------------------------------------------------------------------- | -------------------------------------------------------- |
| `id`            | UUID        | PK, default gen_random_uuid()                                                |                                                          |
| `event_id`      | VARCHAR     | NOT NULL                                                                     | Maps to Violet's `X-Violet-Event-Id` header              |
| `event_type`    | VARCHAR     | NOT NULL                                                                     | e.g., `OFFER_ADDED`, `BAG_SHIPPED`, `ORDER_REFUNDED`     |
| `entity_id`     | VARCHAR     | NOT NULL                                                                     | Primary ID from the payload (offer ID, order ID, bag ID) |
| `status`        | VARCHAR     | NOT NULL, default `'received'`, CHECK IN (`received`, `processed`, `failed`) | Processing lifecycle state                               |
| `payload`       | JSONB       | nullable                                                                     | Raw webhook payload, stored for debugging                |
| `error_message` | TEXT        | nullable                                                                     | Populated when `status = 'failed'`                       |
| `created_at`    | TIMESTAMPTZ | NOT NULL, default now()                                                      |                                                          |
| `processed_at`  | TIMESTAMPTZ | nullable                                                                     | Set when processing completes                            |

**Status transitions:** `received` → `processed` or `failed`. Events stuck in `received` indicate an Edge Function timeout mid-processing.

**Event types stored:**

- Offer: `OFFER_ADDED`, `OFFER_UPDATED`, `OFFER_REMOVED`, `OFFER_DELETED`
- Sync: `PRODUCT_SYNC_STARTED`, `PRODUCT_SYNC_COMPLETED`, `PRODUCT_SYNC_FAILED`
- Order: `ORDER_UPDATED`, `ORDER_COMPLETED`, `ORDER_CANCELED`, `ORDER_REFUNDED`, `ORDER_RETURNED`
- Bag: `BAG_SUBMITTED`, `BAG_ACCEPTED`, `BAG_SHIPPED`, `BAG_COMPLETED`, `BAG_CANCELED`, `BAG_REFUNDED`

**Indexes:**

- `idx_webhook_events_event_id` — UNIQUE on `(event_id)`, the critical idempotency index.
- `idx_webhook_events_type_date` — composite on `(event_type, created_at DESC)` for monitoring queries.
- `idx_webhook_events_status` — partial on `(status) WHERE status = 'failed'` for failed-event dashboards.

**RLS:** Enabled with no permissive policies. Only `service_role` can read or write (bypasses RLS entirely). Admin users can SELECT via the `admin_read_webhooks` policy which calls `(select private.is_admin())`.

---

### carts

One row per cart, supporting both authenticated and anonymous (session-based) users. Mirrors the cart created in Violet.io via `violet_cart_id`.

| Column           | Type        | Constraints                                                                           | Description                                          |
| ---------------- | ----------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `id`             | UUID        | PK, default gen_random_uuid()                                                         |                                                      |
| `violet_cart_id` | TEXT        | NOT NULL UNIQUE                                                                       | Violet's cart ID                                     |
| `user_id`        | UUID        | nullable, FK → auth.users ON DELETE SET NULL                                          | Set for authenticated users                          |
| `session_id`     | TEXT        | nullable                                                                              | Set to `auth.uid()::text` for anonymous users        |
| `status`         | TEXT        | NOT NULL, default `'active'`, CHECK IN (`active`, `completed`, `abandoned`, `merged`) | Cart lifecycle state                                 |
| `created_at`     | TIMESTAMPTZ | NOT NULL, default now()                                                               |                                                      |
| `updated_at`     | TIMESTAMPTZ | NOT NULL, default now()                                                               | Auto-updated by trigger; also drives Realtime events |

**Constraint:** `carts_has_owner` — `CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)`. Every cart must have an owner.

**Indexes:**

- `idx_carts_violet_cart_id` on `(violet_cart_id)`
- `idx_carts_user_id` on `(user_id) WHERE user_id IS NOT NULL`
- `idx_carts_session_id` on `(session_id) WHERE session_id IS NOT NULL`

**Realtime:** Published to `supabase_realtime`. `REPLICA IDENTITY DEFAULT` (sends only PK on UPDATE; used as a cache-invalidation signal, not as a data source).

**RLS policies (after Epic 4 hardening):**

| Policy                       | Role          | Operation | Condition                                                               |
| ---------------------------- | ------------- | --------- | ----------------------------------------------------------------------- |
| `carts_select_authenticated` | authenticated | SELECT    | `user_id = (select auth.uid())`                                         |
| `carts_select_anon`          | anon          | SELECT    | `session_id = (select auth.uid())::text`                                |
| `carts_insert_authenticated` | authenticated | INSERT    | `WITH CHECK user_id = (select auth.uid())`                              |
| `carts_insert_anon`          | anon          | INSERT    | `WITH CHECK user_id IS NULL AND session_id = (select auth.uid())::text` |
| `carts_update_authenticated` | authenticated | UPDATE    | USING + WITH CHECK `user_id = (select auth.uid())`                      |
| `carts_update_anon`          | anon          | UPDATE    | USING + WITH CHECK `session_id = (select auth.uid())::text`             |
| `carts_delete_authenticated` | authenticated | DELETE    | `user_id = (select auth.uid())`                                         |
| `carts_delete_anon`          | anon          | DELETE    | `session_id = (select auth.uid())::text`                                |

**Triggers:** `carts_updated_at` — `BEFORE UPDATE`, calls `update_updated_at_column()`.

---

### cart_items

Line items within a cart. Each row represents one SKU with its quantity and price captured at add-to-cart time (Violet's cart API does not return product names or images at retrieval time).

| Column          | Type        | Constraints                            | Description                                       |
| --------------- | ----------- | -------------------------------------- | ------------------------------------------------- |
| `id`            | UUID        | PK, default gen_random_uuid()          |                                                   |
| `cart_id`       | UUID        | NOT NULL, FK → carts ON DELETE CASCADE |                                                   |
| `sku_id`        | TEXT        | NOT NULL                               | Violet SKU ID                                     |
| `quantity`      | INT         | NOT NULL, CHECK >= 1                   |                                                   |
| `unit_price`    | INT         | NOT NULL                               | Unit price in cents                               |
| `product_name`  | TEXT        | nullable                               | Captured at add-to-cart; nullable for legacy rows |
| `thumbnail_url` | TEXT        | nullable                               | Captured at add-to-cart; nullable for legacy rows |
| `created_at`    | TIMESTAMPTZ | NOT NULL, default now()                |                                                   |
| `updated_at`    | TIMESTAMPTZ | default now()                          | Auto-updated by trigger                           |

**Indexes:**

- `idx_cart_items_cart_sku` — UNIQUE on `(cart_id, sku_id)`, required for upsert operations.
- `idx_cart_items_cart_id` on `(cart_id)` for FK lookups and RLS sub-selects.

**RLS policies:** Eight policies mirroring the `carts` table pattern (SELECT / INSERT / UPDATE / DELETE for `authenticated` and `anon`), all resolving ownership through a sub-select on the parent `carts` row.

**Triggers:** `cart_items_updated_at` — `BEFORE UPDATE`, calls `update_updated_at_column()`.

---

### orders

Mirrors Violet order data. `user_id` is nullable to support guest checkout; guests look up their orders via a hashed token rather than through authentication.

| Column                    | Type        | Constraints                      | Description                                                                                            |
| ------------------------- | ----------- | -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `id`                      | UUID        | PK, default gen_random_uuid()    |                                                                                                        |
| `violet_order_id`         | TEXT        | NOT NULL UNIQUE                  | Violet's order ID                                                                                      |
| `user_id`                 | UUID        | nullable, FK → auth.users        | Null for guest orders                                                                                  |
| `session_id`              | TEXT        | nullable                         | Anonymous session at time of order                                                                     |
| `email`                   | TEXT        | NOT NULL                         | Customer email (used for notifications)                                                                |
| `status`                  | TEXT        | NOT NULL, default `'PROCESSING'` | Violet order lifecycle: `PROCESSING` → `COMPLETED` \| `CANCELED` \| `REFUNDED` \| `PARTIALLY_REFUNDED` |
| `subtotal`                | INTEGER     | NOT NULL, CHECK >= 0             | Cents                                                                                                  |
| `shipping_total`          | INTEGER     | NOT NULL, default 0, CHECK >= 0  | Cents                                                                                                  |
| `tax_total`               | INTEGER     | NOT NULL, default 0, CHECK >= 0  | Cents                                                                                                  |
| `total`                   | INTEGER     | NOT NULL, CHECK >= 0             | Cents                                                                                                  |
| `currency`                | TEXT        | NOT NULL, default `'USD'`        |                                                                                                        |
| `order_lookup_token_hash` | TEXT        | nullable                         | SHA-256 hash of the guest lookup token                                                                 |
| `email_sent`              | BOOLEAN     | NOT NULL, default false          | Whether the order confirmation email has been sent                                                     |
| `created_at`              | TIMESTAMPTZ | NOT NULL, default now()          |                                                                                                        |
| `updated_at`              | TIMESTAMPTZ | NOT NULL, default now()          | Auto-updated by trigger                                                                                |

**Indexes:**

- `idx_orders_user_id` on `(user_id)`
- `idx_orders_user_id_created_at` — composite on `(user_id, created_at DESC)` for the "My Orders" list query
- `idx_orders_session_id` — partial on `(session_id) WHERE session_id IS NOT NULL`
- `idx_orders_email` on `(email)` for admin lookup
- `idx_orders_lookup_token` — partial on `(order_lookup_token_hash) WHERE order_lookup_token_hash IS NOT NULL`
- `idx_orders_status` on `(status)`

**Realtime:** Published to `supabase_realtime`. `REPLICA IDENTITY DEFAULT`.

**RLS policies:**

| Policy                    | Role          | Operation | Condition                     |
| ------------------------- | ------------- | --------- | ----------------------------- |
| `users_read_own_orders`   | authenticated | SELECT    | `user_id = auth.uid()`        |
| `service_role_all_orders` | service_role  | ALL       | `true`                        |
| `admin_read_all_orders`   | authenticated | SELECT    | `(select private.is_admin())` |

**Triggers:** `orders_updated_at` — `BEFORE UPDATE`, calls `update_updated_at_column()`.

---

### order_bags

One row per merchant per order. A single Violet order can contain bags from multiple merchants; each bag has its own shipping, financial status, and tracking information.

| Column             | Type        | Constraints                                                 | Description                                                                          |
| ------------------ | ----------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `id`               | UUID        | PK, default gen_random_uuid()                               |                                                                                      |
| `order_id`         | UUID        | NOT NULL, FK → orders ON DELETE CASCADE                     |                                                                                      |
| `violet_bag_id`    | TEXT        | NOT NULL, UNIQUE (constraint `uq_order_bags_violet_bag_id`) | Violet bag ID; globally unique                                                       |
| `merchant_name`    | TEXT        | NOT NULL                                                    | Merchant display name                                                                |
| `status`           | TEXT        | NOT NULL, default `'IN_PROGRESS'`                           | Bag fulfillment: `IN_PROGRESS` → `SHIPPED` → `DELIVERED` \| `CANCELED` \| `REFUNDED` |
| `financial_status` | TEXT        | NOT NULL, default `'UNPAID'`                                | Payment state: `UNPAID` → `PAID` → `REFUNDED` \| `PARTIALLY_REFUNDED`                |
| `subtotal`         | INTEGER     | NOT NULL, CHECK >= 0                                        | Cents                                                                                |
| `shipping_total`   | INTEGER     | NOT NULL, default 0, CHECK >= 0                             | Cents                                                                                |
| `tax_total`        | INTEGER     | NOT NULL, default 0, CHECK >= 0                             | Cents                                                                                |
| `total`            | INTEGER     | NOT NULL, CHECK >= 0                                        | Cents                                                                                |
| `shipping_method`  | TEXT        | nullable                                                    |                                                                                      |
| `tracking_number`  | TEXT        | nullable                                                    | Populated via `BAG_SHIPPED` webhook                                                  |
| `tracking_url`     | TEXT        | nullable                                                    | Populated via `BAG_SHIPPED` webhook                                                  |
| `carrier`          | TEXT        | nullable                                                    | Populated via `BAG_SHIPPED` webhook                                                  |
| `created_at`       | TIMESTAMPTZ | NOT NULL, default now()                                     |                                                                                      |
| `updated_at`       | TIMESTAMPTZ | NOT NULL, default now()                                     | Auto-updated by trigger                                                              |

**Indexes:**

- `idx_order_bags_order_id` on `(order_id)` for joins
- The UNIQUE constraint on `violet_bag_id` creates an implicit index (replaces the earlier non-unique `idx_order_bags_violet_bag_id`)

**Realtime:** Published to `supabase_realtime`. `REPLICA IDENTITY DEFAULT`.

**RLS policies:**

| Policy                        | Role          | Operation | Condition                                                        |
| ----------------------------- | ------------- | --------- | ---------------------------------------------------------------- |
| `users_read_own_order_bags`   | authenticated | SELECT    | `order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())` |
| `service_role_all_order_bags` | service_role  | ALL       | `true`                                                           |
| `admin_read_all_order_bags`   | authenticated | SELECT    | `(select private.is_admin())`                                    |

**Triggers:** `order_bags_updated_at` — `BEFORE UPDATE`, calls `update_updated_at_column()`.

---

### order_items

Individual SKUs within a bag. Immutable once created — no `updated_at` column.

| Column         | Type        | Constraints                                 | Description                                       |
| -------------- | ----------- | ------------------------------------------- | ------------------------------------------------- |
| `id`           | UUID        | PK, default gen_random_uuid()               |                                                   |
| `order_bag_id` | UUID        | NOT NULL, FK → order_bags ON DELETE CASCADE |                                                   |
| `sku_id`       | TEXT        | NOT NULL                                    | Violet SKU ID (no FK — Violet is source of truth) |
| `name`         | TEXT        | NOT NULL                                    | Product name at time of purchase                  |
| `quantity`     | INTEGER     | NOT NULL, CHECK > 0                         |                                                   |
| `price`        | INTEGER     | NOT NULL, CHECK >= 0                        | Unit price in cents                               |
| `line_price`   | INTEGER     | NOT NULL, CHECK >= 0                        | `price * quantity` in cents                       |
| `thumbnail`    | TEXT        | nullable                                    | Product image URL                                 |
| `created_at`   | TIMESTAMPTZ | NOT NULL, default now()                     |                                                   |

**Indexes:** `idx_order_items_order_bag_id` on `(order_bag_id)`.

**RLS policies:**

| Policy                         | Role          | Operation | Condition                                                                                                                            |
| ------------------------------ | ------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `users_read_own_order_items`   | authenticated | SELECT    | Two-level join: `order_bag_id IN (SELECT ob.id FROM order_bags ob JOIN orders o ON ob.order_id = o.id WHERE o.user_id = auth.uid())` |
| `service_role_all_order_items` | service_role  | ALL       | `true`                                                                                                                               |
| `admin_read_all_order_items`   | authenticated | SELECT    | `(select private.is_admin())`                                                                                                        |

---

### order_refunds

Stores refund details fetched from the Violet Refund API after a `BAG_REFUNDED` webhook event. A bag can have multiple partial refunds; each is a separate row. Immutable once created.

Violet webhooks notify that a refund occurred but do not include the amount or reason — those details are fetched separately from `GET /v1/orders/{order_id}/bags/{bag_id}/refunds`.

| Column             | Type        | Constraints                                 | Description                                           |
| ------------------ | ----------- | ------------------------------------------- | ----------------------------------------------------- |
| `id`               | UUID        | PK, default gen_random_uuid()               |                                                       |
| `order_bag_id`     | UUID        | NOT NULL, FK → order_bags ON DELETE CASCADE |                                                       |
| `violet_refund_id` | TEXT        | NOT NULL UNIQUE                             | Violet's refund ID; UNIQUE ensures idempotent upserts |
| `amount`           | INTEGER     | NOT NULL, CHECK > 0                         | Refund amount in cents                                |
| `reason`           | TEXT        | nullable                                    | Refund reason from Violet                             |
| `currency`         | TEXT        | NOT NULL, default `'USD'`                   |                                                       |
| `status`           | TEXT        | NOT NULL, default `'PROCESSED'`             |                                                       |
| `created_at`       | TIMESTAMPTZ | NOT NULL, default now()                     |                                                       |

**Indexes:** `idx_order_refunds_order_bag_id` on `(order_bag_id)`.

**Realtime:** Published to `supabase_realtime`.

**RLS policies:**

| Policy                           | Role          | Operation | Condition                                  |
| -------------------------------- | ------------- | --------- | ------------------------------------------ |
| `service_role_all_order_refunds` | service_role  | ALL       | `true`                                     |
| `users_read_own_order_refunds`   | authenticated | SELECT    | Two-level join through order_bags → orders |

---

### wishlists

One wishlist per authenticated user. Created on demand when a user saves their first item.

| Column       | Type        | Constraints                                        | Description             |
| ------------ | ----------- | -------------------------------------------------- | ----------------------- |
| `id`         | UUID        | PK, default gen_random_uuid()                      |                         |
| `user_id`    | UUID        | UNIQUE NOT NULL, FK → auth.users ON DELETE CASCADE |                         |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now()                            |                         |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default now()                            | Auto-updated by trigger |

**Indexes:** The UNIQUE constraint on `user_id` creates an implicit index. The explicit `idx_wishlists_user_id` was dropped as redundant.

**RLS policies:** Four per-operation policies for `authenticated` (`users_select/insert/update/delete_own_wishlist`) all gating on `user_id = auth.uid()`, plus `service_role_all_wishlists`.

**Triggers:** `set_updated_at_wishlists` — `BEFORE UPDATE`, calls `update_updated_at_column()`.

---

### wishlist_items

Products saved to a wishlist. Only the Violet `product_id` is stored — no price or availability snapshot (Violet is the source of truth for catalog data).

| Column        | Type        | Constraints                                | Description             |
| ------------- | ----------- | ------------------------------------------ | ----------------------- |
| `id`          | UUID        | PK, default gen_random_uuid()              |                         |
| `wishlist_id` | UUID        | NOT NULL, FK → wishlists ON DELETE CASCADE |                         |
| `product_id`  | TEXT        | NOT NULL                                   | Violet product/offer ID |
| `added_at`    | TIMESTAMPTZ | NOT NULL, default now()                    |                         |

**Constraint:** UNIQUE on `(wishlist_id, product_id)` — prevents duplicate saves.

**Indexes:**

- `idx_wishlist_items_wishlist_id` on `(wishlist_id)`
- `idx_wishlist_items_product_id` on `(product_id)`

**RLS policies:** Three per-operation policies for `authenticated` (SELECT / INSERT / DELETE) resolving ownership through the parent `wishlists` row, plus `service_role_all_wishlist_items`.

---

### user_events

Tracks browsing and search activity for authenticated users. Powers personalized recommendations and search results. Anonymous activity is not tracked.

| Column       | Type        | Constraints                                                    | Description                                               |
| ------------ | ----------- | -------------------------------------------------------------- | --------------------------------------------------------- |
| `id`         | UUID        | PK, default gen_random_uuid()                                  |                                                           |
| `user_id`    | UUID        | NOT NULL, FK → auth.users ON DELETE CASCADE                    |                                                           |
| `event_type` | TEXT        | NOT NULL, CHECK IN (`product_view`, `search`, `category_view`) |                                                           |
| `payload`    | JSONB       | NOT NULL, default `{}`                                         | Contextual data: product_id, query, category, price, etc. |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now()                                        |                                                           |

**Indexes:**

- `idx_user_events_user_type` on `(user_id, event_type)`
- `idx_user_events_user_created` on `(user_id, created_at DESC)`
- `idx_user_events_created_at` on `(created_at)` for pg_cron retention cleanup

**Retention:** Events older than 6 months can be purged via pg_cron. See [Data Retention Notes](#data-retention-notes).

**RLS policies:**

| Policy                       | Role          | Operation | Condition                     |
| ---------------------------- | ------------- | --------- | ----------------------------- |
| `users_read_own_events`      | all           | SELECT    | `auth.uid() = user_id`        |
| `service_role_all_events`    | service_role  | ALL       | `true`                        |
| `admin_read_all_user_events` | authenticated | SELECT    | `(select private.is_admin())` |

---

### content_pages

Editorial and legal content served on the platform (guides, comparisons, reviews, legal pages). Managed via Supabase Studio.

| Column               | Type                       | Constraints                                                  | Description                                                     |
| -------------------- | -------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------- |
| `id`                 | UUID                       | PK, default gen_random_uuid()                                |                                                                 |
| `slug`               | TEXT                       | UNIQUE NOT NULL, CHECK format `^[a-z0-9][a-z0-9-]*[a-z0-9]$` | URL-safe identifier                                             |
| `title`              | TEXT                       | NOT NULL, CHECK `char_length(trim(title)) > 0`               | Display title                                                   |
| `type`               | content_page_type (enum)   | NOT NULL, default `'guide'`                                  | `guide` \| `comparison` \| `review` \| `legal`                  |
| `body_markdown`      | TEXT                       | NOT NULL, default `''`                                       | Markdown content. Supports `{{product:VIOLET_OFFER_ID}}` embeds |
| `author`             | TEXT                       | NOT NULL, default `''`                                       | Author display name                                             |
| `status`             | content_page_status (enum) | NOT NULL, default `'draft'`                                  | `draft` \| `published` \| `archived`                            |
| `published_at`       | TIMESTAMPTZ                | nullable, required when status = published                   | Supports future-dated scheduling                                |
| `seo_title`          | TEXT                       | nullable                                                     | Falls back to `title` if empty                                  |
| `seo_description`    | TEXT                       | nullable                                                     | Falls back to first 160 chars of content if empty               |
| `featured_image_url` | TEXT                       | nullable                                                     | Hero image URL (also used for og:image)                         |
| `tags`               | TEXT[]                     | default `{}`                                                 | Categorization tags                                             |
| `related_slugs`      | TEXT[]                     | default `{}`                                                 | Slugs of related articles shown at page bottom                  |
| `sort_order`         | INTEGER                    | default 0                                                    | Higher values appear first in listings; 100+ for featured       |
| `created_at`         | TIMESTAMPTZ                | NOT NULL, default now()                                      |                                                                 |
| `updated_at`         | TIMESTAMPTZ                | NOT NULL, default now()                                      | Auto-updated by trigger                                         |

**Enums:** `content_page_type` (`guide`, `comparison`, `review`, `legal`) and `content_page_status` (`draft`, `published`, `archived`) — both defined as PostgreSQL enum types.

**Constraint:** `chk_published_has_date` — `CHECK (status != 'published' OR published_at IS NOT NULL)`.

**Indexes:**

- `idx_content_pages_slug` on `(slug)`
- `idx_content_pages_type` on `(type)`
- `idx_content_pages_status_published` — partial on `(status, published_at DESC) WHERE status = 'published'`
- `idx_content_pages_sort_order` — partial on `(sort_order DESC, published_at DESC) WHERE status = 'published'`

**RLS policies:**

| Policy                          | Role                | Operation | Condition                                        |
| ------------------------------- | ------------------- | --------- | ------------------------------------------------ |
| `public_read_published_content` | anon, authenticated | SELECT    | `status = 'published' AND published_at <= now()` |
| `service_role_all_content`      | service_role        | ALL       | `true`                                           |

**Triggers:** `set_updated_at_content_pages` — `BEFORE UPDATE`, calls `update_updated_at_column()`.

**Seed data:** One published guide (`best-running-shoes-2026`) and three legal pages (`privacy`, `terms`, `cookies`) inserted via migrations.

---

### faq_items

Frequently asked questions grouped by category, displayed on the help center.

| Column            | Type        | Constraints                   | Description                                                        |
| ----------------- | ----------- | ----------------------------- | ------------------------------------------------------------------ |
| `id`              | UUID        | PK, default gen_random_uuid() |                                                                    |
| `category`        | TEXT        | NOT NULL                      | Grouping header (e.g., `Shipping & Delivery`, `Returns & Refunds`) |
| `question`        | TEXT        | NOT NULL                      | The FAQ question as displayed to visitors                          |
| `answer_markdown` | TEXT        | NOT NULL                      | Markdown-formatted answer                                          |
| `sort_order`      | INTEGER     | NOT NULL, default 0           | Display order within category; lower = first                       |
| `is_published`    | BOOLEAN     | NOT NULL, default true        | Hidden items remain in the DB without being deleted                |
| `created_at`      | TIMESTAMPTZ | NOT NULL, default now()       |                                                                    |
| `updated_at`      | TIMESTAMPTZ | NOT NULL, default now()       | Auto-updated by trigger                                            |

**Indexes:** `idx_faq_items_category_sort` — partial on `(category, sort_order) WHERE is_published = true`.

**RLS policies:**

| Policy                      | Role                | Operation | Condition             |
| --------------------------- | ------------------- | --------- | --------------------- |
| `public_read_published_faq` | anon, authenticated | SELECT    | `is_published = true` |
| `service_role_all_faq`      | service_role        | ALL       | `true`                |

**Triggers:** `set_updated_at_faq_items` — `BEFORE UPDATE`, calls `update_updated_at_column()`.

**Seed data:** 11 FAQ items across 5 categories inserted via migration.

---

### support_inquiries

Contact form submissions from visitors. Anonymous users can submit; admin users manage the queue.

| Column           | Type        | Constraints                                                                        | Description                                          |
| ---------------- | ----------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `id`             | UUID        | PK, default gen_random_uuid()                                                      |                                                      |
| `name`           | TEXT        | NOT NULL                                                                           | Submitter's name                                     |
| `email`          | TEXT        | NOT NULL                                                                           | Submitter's email                                    |
| `subject`        | TEXT        | NOT NULL, CHECK IN (`Order Issue`, `Payment Problem`, `General Question`, `Other`) |                                                      |
| `message`        | TEXT        | NOT NULL, CHECK `char_length >= 20 AND <= 2000`                                    |                                                      |
| `order_id`       | TEXT        | nullable                                                                           | Optional Violet order ID for order-related inquiries |
| `status`         | TEXT        | NOT NULL, default `'new'`, CHECK IN (`new`, `in-progress`, `resolved`)             | Admin workflow state                                 |
| `internal_notes` | TEXT        | nullable                                                                           | Admin-only notes, not visible to the customer        |
| `created_at`     | TIMESTAMPTZ | NOT NULL, default now()                                                            |                                                      |
| `updated_at`     | TIMESTAMPTZ | NOT NULL, default now()                                                            | Auto-updated by trigger                              |

**Indexes:** `idx_support_inquiries_status` on `(status, created_at DESC)`.

**RLS policies:**

| Policy                     | Role                | Operation | Condition                                        |
| -------------------------- | ------------------- | --------- | ------------------------------------------------ |
| `anon_insert_support`      | anon, authenticated | INSERT    | `WITH CHECK true` (open submission)              |
| `service_role_all_support` | service_role        | ALL       | `true`                                           |
| `admin_read_support`       | authenticated       | SELECT    | `(select private.is_admin())`                    |
| `admin_update_support`     | authenticated       | UPDATE    | USING + WITH CHECK `(select private.is_admin())` |

**Triggers:** `set_updated_at_support_inquiries` — `BEFORE UPDATE`, calls `update_updated_at_column()`.

---

### user_push_tokens

Expo push tokens registered by the mobile app for sending push notifications.

| Column            | Type        | Constraints                                 | Description             |
| ----------------- | ----------- | ------------------------------------------- | ----------------------- |
| `id`              | UUID        | PK, default gen_random_uuid()               |                         |
| `user_id`         | UUID        | NOT NULL, FK → auth.users ON DELETE CASCADE |                         |
| `expo_push_token` | TEXT        | NOT NULL UNIQUE                             | Expo push token string  |
| `device_id`       | TEXT        | NOT NULL                                    | Device identifier       |
| `platform`        | TEXT        | NOT NULL, CHECK IN (`ios`, `android`)       |                         |
| `created_at`      | TIMESTAMPTZ | NOT NULL, default now()                     |                         |
| `updated_at`      | TIMESTAMPTZ | NOT NULL, default now()                     | Auto-updated by trigger |

**Indexes:** `idx_push_tokens_user_id` on `(user_id)`.

**RLS policies:**

| Policy                     | Role         | Operation | Condition              |
| -------------------------- | ------------ | --------- | ---------------------- |
| `users_own_push_tokens`    | all          | ALL       | `user_id = auth.uid()` |
| `service_role_push_tokens` | service_role | ALL       | `true`                 |

**Triggers:** `set_updated_at_user_push_tokens` — `BEFORE UPDATE`, calls `update_updated_at_column()`.

---

### notification_preferences

Per-user, per-type notification opt-in/opt-out settings.

| Column              | Type        | Constraints                                                                       | Description             |
| ------------------- | ----------- | --------------------------------------------------------------------------------- | ----------------------- |
| `id`                | UUID        | PK, default gen_random_uuid()                                                     |                         |
| `user_id`           | UUID        | NOT NULL, FK → auth.users ON DELETE CASCADE                                       |                         |
| `notification_type` | TEXT        | NOT NULL, CHECK IN (`order_updates`, `price_drops`, `back_in_stock`, `marketing`) |                         |
| `enabled`           | BOOLEAN     | NOT NULL, default true                                                            |                         |
| `created_at`        | TIMESTAMPTZ | NOT NULL, default now()                                                           |                         |
| `updated_at`        | TIMESTAMPTZ | NOT NULL, default now()                                                           | Auto-updated by trigger |

**Constraint:** UNIQUE on `(user_id, notification_type)`.

**Indexes:** `idx_notification_prefs_user_id` on `(user_id)`.

**RLS policies:**

| Policy                            | Role         | Operation | Condition              |
| --------------------------------- | ------------ | --------- | ---------------------- |
| `users_own_notification_prefs`    | all          | ALL       | `user_id = auth.uid()` |
| `service_role_notification_prefs` | service_role | ALL       | `true`                 |

**Triggers:** `set_updated_at_notification_preferences` — `BEFORE UPDATE`, calls `update_updated_at_column()`.

---

### notification_logs

Audit log for all transactional email and push notification send attempts via Resend API. Multiple rows per notification are expected (one per attempt, up to 3 retries).

| Column              | Type        | Constraints                                                           | Description                                                                                                    |
| ------------------- | ----------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `id`                | UUID        | PK, default gen_random_uuid()                                         |                                                                                                                |
| `order_id`          | UUID        | nullable, FK → orders ON DELETE CASCADE                               | Null for engagement push notifications                                                                         |
| `notification_type` | TEXT        | NOT NULL                                                              | `order_confirmed`, `bag_shipped`, `bag_delivered`, `refund_processed`, `push_price_drop`, `push_back_in_stock` |
| `recipient_email`   | TEXT        | NOT NULL                                                              |                                                                                                                |
| `status`            | TEXT        | NOT NULL, default `'pending'`, CHECK IN (`pending`, `sent`, `failed`) |                                                                                                                |
| `resend_email_id`   | TEXT        | nullable                                                              | Resend's tracking ID on success                                                                                |
| `error_message`     | TEXT        | nullable                                                              | Populated on failure                                                                                           |
| `attempt`           | INTEGER     | NOT NULL, default 1, CHECK > 0                                        | Retry attempt number (1–3)                                                                                     |
| `created_at`        | TIMESTAMPTZ | NOT NULL, default now()                                               |                                                                                                                |

Note: `order_id` was made nullable in migration `20260328000000` to support push notifications that have no associated order. The `notification_type` CHECK constraint was dropped at the same time to accommodate `push_*` prefixed types.

**Indexes:**

- `idx_notification_logs_order_id` on `(order_id)`
- `idx_notification_logs_order_type` on `(order_id, notification_type)` for dedup checks
- `idx_notification_logs_failed` — partial on `(status) WHERE status = 'failed'`
- `idx_notification_logs_push_antispam` on `(recipient_email, notification_type, created_at DESC) WHERE notification_type IN ('push_price_drop', 'push_back_in_stock')`

**RLS:** Service role only (`service_role_all_notification_logs`).

---

### error_logs

Structured error log for errors originating from the web app, mobile app, and Edge Functions.

| Column        | Type        | Constraints                                  | Description                                                   |
| ------------- | ----------- | -------------------------------------------- | ------------------------------------------------------------- |
| `id`          | UUID        | PK, default gen_random_uuid()                |                                                               |
| `source`      | TEXT        | NOT NULL                                     | `web` \| `mobile` \| `edge-function`                          |
| `error_type`  | TEXT        | NOT NULL                                     | Dot-namespaced code, e.g., `VIOLET.API_ERROR`, `CART.EXPIRED` |
| `message`     | TEXT        | NOT NULL                                     | Human-readable error message                                  |
| `stack_trace` | TEXT        | nullable                                     |                                                               |
| `context`     | JSONB       | nullable                                     | Flexible bag: `cart_id`, `user_id`, request details, etc.     |
| `user_id`     | UUID        | nullable, FK → auth.users ON DELETE SET NULL |                                                               |
| `session_id`  | TEXT        | nullable                                     | For anonymous users                                           |
| `created_at`  | TIMESTAMPTZ | NOT NULL, default now()                      |                                                               |

**Indexes:**

- `idx_error_logs_source_created` on `(source, created_at DESC)`
- `idx_error_logs_type` on `(error_type)`
- `idx_error_logs_user_id` — partial on `(user_id) WHERE user_id IS NOT NULL`

**RLS policies:**

| Policy                  | Role          | Operation | Condition                       |
| ----------------------- | ------------- | --------- | ------------------------------- |
| `service_role_insert`   | service_role  | INSERT    | `true`                          |
| `users_read_own`        | authenticated | SELECT    | `user_id = (select auth.uid())` |
| `service_role_read_all` | service_role  | SELECT    | `true`                          |
| `admin_read_errors`     | authenticated | SELECT    | `(select private.is_admin())`   |

---

### alert_rules

Configurable thresholds for platform health monitoring alerts. Seeded with 4 default rules.

| Column                | Type        | Constraints                   | Description                                      |
| --------------------- | ----------- | ----------------------------- | ------------------------------------------------ |
| `id`                  | UUID        | PK, default gen_random_uuid() |                                                  |
| `rule_name`           | TEXT        | NOT NULL UNIQUE               | Machine-readable rule identifier                 |
| `description`         | TEXT        | nullable                      | Human-readable description displayed in admin UI |
| `threshold_value`     | INTEGER     | NOT NULL                      | Numeric threshold for triggering the alert       |
| `time_window_minutes` | INTEGER     | NOT NULL                      | Time window for evaluation (0 = instantaneous)   |
| `enabled`             | BOOLEAN     | NOT NULL, default true        | Toggle without deleting                          |
| `last_triggered_at`   | TIMESTAMPTZ | nullable                      | Set when the rule fires                          |
| `created_at`          | TIMESTAMPTZ | NOT NULL, default now()       |                                                  |
| `updated_at`          | TIMESTAMPTZ | NOT NULL, default now()       | Auto-updated by trigger                          |

**Seed data (4 rules):**

| `rule_name`                    | `threshold_value` | `time_window_minutes` |
| ------------------------------ | ----------------- | --------------------- |
| `webhook_consecutive_failures` | 3                 | 0                     |
| `violet_unreachable`           | 1                 | 5                     |
| `failed_checkouts_spike`       | 10                | 60                    |
| `edge_function_error_rate`     | 5                 | 15                    |

**RLS policies:**

| Policy                         | Role          | Operation | Condition                                        |
| ------------------------------ | ------------- | --------- | ------------------------------------------------ |
| `admin_read_alert_rules`       | authenticated | SELECT    | `(select private.is_admin())`                    |
| `admin_update_alert_rules`     | authenticated | UPDATE    | USING + WITH CHECK `(select private.is_admin())` |
| `service_role_all_alert_rules` | service_role  | ALL       | `true`                                           |

**Triggers:** `set_updated_at_alert_rules` — `BEFORE UPDATE`, calls `update_updated_at_column()`.

---

## Materialized Views

Materialized views pre-compute dashboard metrics to avoid expensive real-time aggregations. They require a manual or scheduled refresh via `public.refresh_dashboard_views()`. Access is restricted to `postgres` / `service_role` — RLS does not apply to materialized views, so access is controlled via GRANT/REVOKE.

### mv_dashboard_metrics

Global order and user aggregates across all non-canceled orders.

| Column                      | Type        | Description                                 |
| --------------------------- | ----------- | ------------------------------------------- |
| `total_orders`              | BIGINT      | All non-canceled/non-rejected orders        |
| `gross_revenue_cents`       | BIGINT      | Sum of all order totals                     |
| `commission_estimate_cents` | BIGINT      | Estimated commission (10% of bag subtotals) |
| `registered_users_ordered`  | BIGINT      | Distinct authenticated users who ordered    |
| `active_users_30d`          | BIGINT      | Distinct users with events in last 30 days  |
| `active_users_7d`           | BIGINT      | Distinct users with events in last 7 days   |
| `active_users_today`        | BIGINT      | Distinct users with events today            |
| `refreshed_at`              | TIMESTAMPTZ | When the view was last refreshed            |

**Unique index:** `idx_mv_dashboard_metrics_unique` on `(refreshed_at)` — required for `REFRESH CONCURRENTLY`.

### mv_commission_summary

Per-merchant commission breakdown for paid bags.

| Column                      | Type        | Description                                                          |
| --------------------------- | ----------- | -------------------------------------------------------------------- |
| `merchant_name`             | TEXT        |                                                                      |
| `bag_count`                 | BIGINT      | Number of bags with `financial_status IN ('PAID', 'PARTIALLY_PAID')` |
| `gross_subtotal_cents`      | BIGINT      | Sum of bag subtotals                                                 |
| `commission_estimate_cents` | BIGINT      | Estimated commission (10% default)                                   |
| `commission_rate_pct`       | NUMERIC     | Always 10.0 for MVP                                                  |
| `refreshed_at`              | TIMESTAMPTZ |                                                                      |

**Unique index:** `idx_mv_commission_summary_merchant` on `(merchant_name)`.

---

## SQL Functions

### public schema (callable via PostgREST `.rpc()`)

#### `match_products(query_embedding, match_threshold, match_count)`

Semantic similarity search over `product_embeddings`.

```sql
match_products(
  query_embedding  vector(1536),
  match_threshold  float    DEFAULT 0.3,
  match_count      int      DEFAULT 12
) RETURNS TABLE (product_id VARCHAR, product_name TEXT, text_content TEXT, similarity float)
```

Returns products sorted by cosine similarity to the query vector. Automatically filters out rows where `available = false`. Uses the HNSW index.

Accessible by: `anon`, `authenticated`, `service_role`.

---

#### `get_user_search_profile(p_user_id)`

Aggregates a user's browsing history and purchase data into a personalization profile for search ranking.

```sql
get_user_search_profile(p_user_id UUID) RETURNS JSONB
```

Returns a JSONB object with:

- `top_categories` — up to 5 categories from browsing history (last 3 months)
- `avg_order_price` — average order item price in cents
- `recent_product_ids` — up to 20 product IDs from views in the last 30 days
- `total_events` — total event count (profile strength indicator)

Security: `SECURITY DEFINER`. Enforces that `p_user_id = auth.uid()` for non-service-role callers to prevent cross-user data access. `service_role` may pass any UUID.

Accessible by: `authenticated`, `service_role`.

---

#### `fn_health_metrics(p_hours)`

Returns platform health metrics for a given time window. Public wrapper delegates to `private.fn_health_metrics`.

```sql
fn_health_metrics(p_hours INTEGER DEFAULT 24)
RETURNS TABLE (
  error_count BIGINT,
  error_rate_per_hour NUMERIC,
  webhook_total BIGINT,
  webhook_success BIGINT,
  webhook_failed BIGINT,
  webhook_success_rate NUMERIC,
  top_error_types JSONB,       -- [{error_type, count}, ...], max 10
  consecutive_webhook_failures INTEGER
)
```

Accessible by: `service_role` only (REVOKEd from `public`, `anon`, `authenticated`).

---

#### `fn_dashboard_metrics_by_range(p_start, p_end)`

Returns dashboard KPIs for a specific date range. Not materialized — performs live queries. Public wrapper delegates to `private.fn_dashboard_metrics_by_range`.

```sql
fn_dashboard_metrics_by_range(
  p_start TIMESTAMPTZ DEFAULT now() - interval '30 days',
  p_end   TIMESTAMPTZ DEFAULT now()
) RETURNS TABLE (
  total_orders BIGINT,
  gross_revenue_cents BIGINT,
  commission_estimate_cents BIGINT,
  active_users BIGINT,
  total_visitors BIGINT,       -- same as active_users until anonymous tracking is added
  conversion_rate NUMERIC,
  ai_search_usage_pct NUMERIC
)
```

Accessible by: `service_role` only.

---

#### `estimate_commission(bag_subtotal_cents, commission_rate_pct)`

Helper for computing affiliate commission estimates. Used internally by materialized views.

```sql
estimate_commission(
  bag_subtotal_cents  INTEGER,
  commission_rate_pct NUMERIC DEFAULT 10.0
) RETURNS INTEGER
```

`IMMUTABLE`. REVOKEd from `public`, `anon`, `authenticated` — internal use only.

---

#### `refresh_dashboard_views()`

Refreshes both `mv_dashboard_metrics` and `mv_commission_summary` concurrently. Public wrapper delegates to `private.refresh_dashboard_views`.

Accessible by: `service_role` only.

---

#### `handle_updated_at()`

Generic trigger function. Sets `NEW.updated_at = now()` and returns `NEW`. Used by `user_profiles_updated_at` trigger.

#### `update_updated_at_column()`

Functionally identical to `handle_updated_at()`. Created in the carts migration and reused by all subsequent `updated_at` triggers.

#### `handle_new_user()`

`SECURITY DEFINER` trigger function. Inserts a row into `user_profiles` for non-anonymous users. Called by `on_auth_user_created` and `on_auth_user_updated` on `auth.users`.

### private schema (not accessible via PostgREST)

The `private` schema is not discoverable by PostgREST. The following functions live there for defense-in-depth:

| Function                                     | Purpose                                                                                                              |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `private.is_admin()`                         | Reads `auth.jwt() -> 'app_metadata' ->> 'user_role'`; returns `true` if `= 'admin'`. Used in all admin RLS policies. |
| `private.set_admin_role(target_user_id)`     | Sets `{"user_role": "admin"}` in `auth.users.raw_app_meta_data`. Run from SQL Editor or service_role only.           |
| `private.remove_admin_role(target_user_id)`  | Removes `user_role` key from `auth.users.raw_app_meta_data`.                                                         |
| `private.fn_dashboard_metrics_by_range(...)` | `SECURITY DEFINER` implementation of the dashboard metrics query.                                                    |
| `private.fn_health_metrics(...)`             | `SECURITY DEFINER` implementation of the health metrics query.                                                       |
| `private.refresh_dashboard_views()`          | `SECURITY DEFINER` implementation of the view refresh.                                                               |

Admin role is stored in `auth.users.raw_app_meta_data` as `{"user_role": "admin"}`. The JWT automatically includes `app_metadata`, so `private.is_admin()` reads it without an additional query. There is no separate `admin_roles` table.

---

## Entity Relationships

```
auth.users (Supabase managed)
  │
  ├─── user_profiles (1:1, CASCADE delete)
  ├─── user_events (1:N, CASCADE delete)
  ├─── user_push_tokens (1:N, CASCADE delete)
  ├─── notification_preferences (1:N, CASCADE delete)
  ├─── wishlists (1:1, CASCADE delete)
  │      └─── wishlist_items (1:N, CASCADE delete)
  ├─── carts (1:N, SET NULL on delete)
  │      └─── cart_items (1:N, CASCADE delete)
  ├─── orders (1:N, no cascade)
  │      ├─── notification_logs (1:N, CASCADE delete)
  │      └─── order_bags (1:N, CASCADE delete)
  │             ├─── order_items (1:N, CASCADE delete)
  │             └─── order_refunds (1:N, CASCADE delete)
  └─── error_logs (1:N, SET NULL on delete)

product_embeddings (standalone — product_id references Violet, not a local FK)
webhook_events (standalone — entity_id references Violet, not a local FK)
content_pages (standalone)
faq_items (standalone)
support_inquiries (standalone)
alert_rules (standalone)
```

**Key cross-table patterns:**

- `order_items.sku_id` and `wishlist_items.product_id` reference Violet IDs, not local FK columns. Violet is the authoritative catalog.
- `carts.violet_cart_id` and `orders.violet_order_id` are the bridge identifiers used when making API calls to Violet.
- `user_events` feeds both `get_user_search_profile()` (search personalization) and `mv_dashboard_metrics` (active user counts).
- `order_bags.financial_status` drives commission calculations in `mv_commission_summary`.

---

## Extensions

| Extension           | Purpose                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `vector` (pgvector) | Enables the `vector(n)` column type and operators (`<=>` cosine distance) used by `product_embeddings` |

---

## Schemas

| Schema    | Purpose                                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------- |
| `public`  | All application tables and PostgREST-exposed functions                                                    |
| `private` | `SECURITY DEFINER` functions not accessible via PostgREST (admin role management, sensitive aggregations) |
| `auth`    | Supabase-managed authentication tables (read via FK references and triggers only)                         |

---

## Data Retention Notes

The following tables have documented retention policies pending `pg_cron` activation:

| Table               | Policy                                                                           | Rationale                                                              |
| ------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `webhook_events`    | Delete `processed` rows after 90 days; keep `failed` and `received` indefinitely | At 1,000 webhooks/day, 90-day retention caps the table at ~90K rows    |
| `notification_logs` | Delete `sent` and `pending` rows after 180 days; keep `failed` indefinitely      | Successful sends are verifiable via Resend dashboard                   |
| `user_events`       | Delete rows older than 6 months                                                  | Browsing history beyond 6 months has diminishing personalization value |

All three can be scheduled with `pg_cron` once the extension is enabled via the Supabase Dashboard. See individual migration files for the exact `cron.schedule()` SQL.
