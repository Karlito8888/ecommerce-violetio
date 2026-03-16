-- Migration: webhook_events
-- Story 3.7: Product Catalog Sync via Webhooks (extended by Story 5.2 for order events)
-- Creates webhook_events table for idempotent webhook processing and monitoring.
--
-- This table is the backbone of the Violet webhook processing pipeline's idempotency
-- mechanism. Every inbound webhook from Violet.io is recorded here before processing.
--
-- ## Violet Webhook Delivery Model
--
-- Violet retries failed webhooks (non-2xx response) up to 10 times over 24 hours
-- using exponential backoff. It auto-disables endpoints after 50+ failures in 30 min.
-- This table prevents duplicate processing when retries arrive for the same event.
-- @see https://docs.violet.io/prism/webhooks/handling-webhooks
--
-- ## Idempotency mechanism (two-level)
--
-- Level 1 (fast path): SELECT WHERE event_id = ? — returns 200 if row exists.
-- Level 2 (race condition): INSERT with UNIQUE constraint on event_id — concurrent
--   requests that pass Level 1 simultaneously will have one succeed and the other
--   fail with code 23505 (unique_violation), which also returns 200.
--
-- ## Processing lifecycle
--
-- Status transitions: received → processed | failed
-- - "received": Event claimed but not yet processed (set on INSERT)
-- - "processed": Business logic completed successfully (set by processor)
-- - "failed": Processing error occurred (set by processor, error_message populated)
--
-- Events stuck in "received" status indicate the Edge Function timed out
-- mid-processing. These can be retried manually or via a cleanup cron job.
--
-- ## Event types stored
--
-- Offer events: OFFER_ADDED, OFFER_UPDATED, OFFER_REMOVED, OFFER_DELETED
-- Sync events: PRODUCT_SYNC_STARTED, PRODUCT_SYNC_COMPLETED, PRODUCT_SYNC_FAILED
-- Order events: ORDER_UPDATED, ORDER_COMPLETED, ORDER_CANCELED, ORDER_REFUNDED, ORDER_RETURNED
-- Bag events: BAG_SUBMITTED, BAG_ACCEPTED, BAG_SHIPPED, BAG_COMPLETED, BAG_CANCELED, BAG_REFUNDED
--
-- ## Design decisions:
--   - event_id (VARCHAR UNIQUE) stores Violet's X-Violet-Event-Id header for deduplication.
--     INSERT with ON CONFLICT(event_id) DO NOTHING makes duplicate deliveries a no-op.
--   - status tracks processing lifecycle: received → processed | failed.
--   - payload stored as JSONB for debugging — not used in hot paths.
--   - entity_id stores the primary ID from the payload (offer ID, order ID, bag ID)
--     for cross-referencing with domain tables.
--   - RLS enabled with NO policies = implicit deny for anon/authenticated.
--     Only service_role (Edge Functions) can read/write — this works because Supabase's
--     service_role bypasses RLS entirely, so no explicit policy is needed.
--
-- ## Data type note
-- Uses VARCHAR (no length limit) which is functionally identical to TEXT in Postgres.
-- Future migrations in this project use TEXT for consistency.
--
-- ## Cleanup strategy
--
-- POST-LAUNCH TODO: Data Retention Policy for webhook_events
--
-- This table grows with every inbound Violet webhook (~1 row per event).
-- At scale, unbounded growth impacts query performance and storage costs.
-- Implement the following retention policy once pg_cron is enabled:
--
-- Policy:
--   - Processed events: DELETE after 90 days (audit value diminishes, payload
--     data is already persisted in domain tables: orders, order_bags, etc.)
--   - Failed events: KEEP indefinitely (needed for debugging, retry analysis,
--     and detecting systematic integration failures with Violet)
--   - Received (stuck) events: KEEP indefinitely (indicates Edge Function
--     timeouts — these need manual investigation, not auto-deletion)
--
-- pg_cron implementation (run when pg_cron extension is available):
--
--   -- Enable pg_cron (requires superuser, done once via Supabase dashboard)
--   -- CREATE EXTENSION IF NOT EXISTS pg_cron;
--
--   -- Schedule daily cleanup at 3:00 AM UTC (low-traffic window)
--   SELECT cron.schedule(
--     'purge-old-webhook-events',
--     '0 3 * * *',
--     $$DELETE FROM public.webhook_events
--       WHERE status = 'processed'
--         AND created_at < now() - interval '90 days'$$
--   );
--
-- Estimated impact: at 1000 webhooks/day, 90-day retention keeps ~90K rows
-- (vs unbounded growth). Failed events are typically <1% of total volume.
--
-- Alternative (without pg_cron): schedule a Supabase Edge Function via
-- external cron (e.g., GitHub Actions scheduled workflow, Upstash QStash)
-- that calls an RPC function performing the same DELETE.

-- Webhook events table for idempotent processing and audit trail
CREATE TABLE public.webhook_events (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      VARCHAR      NOT NULL,
  event_type    VARCHAR      NOT NULL,
  entity_id     VARCHAR      NOT NULL,
  status        VARCHAR      NOT NULL DEFAULT 'received'
                CHECK (status IN ('received', 'processed', 'failed')),
  payload       JSONB,
  error_message TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  processed_at  TIMESTAMPTZ
);

-- Unique index on event_id for idempotency (prevents duplicate processing).
-- This is the critical index — every webhook handler does:
--   INSERT INTO webhook_events (event_id, ...) ON CONFLICT (event_id) DO NOTHING
CREATE UNIQUE INDEX idx_webhook_events_event_id
  ON public.webhook_events(event_id);

-- Composite index for monitoring queries (e.g., "show all OFFER_UPDATED events today")
CREATE INDEX idx_webhook_events_type_date
  ON public.webhook_events(event_type, created_at DESC);

-- Index on status for monitoring failed events (e.g., retry dashboard)
CREATE INDEX idx_webhook_events_status ON public.webhook_events(status)
  WHERE status = 'failed';

-- Enable RLS — no policies = only service_role can access (implicit deny for all others)
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.webhook_events IS
  'Stores inbound Violet webhook events for idempotent processing and monitoring. '
  'event_id maps to X-Violet-Event-Id header. Only accessible via service_role.';
