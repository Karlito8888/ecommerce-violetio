-- Migration: webhook_events
-- Story 3.7: Product Catalog Sync via Webhooks
-- Creates webhook_events table for idempotent webhook processing and monitoring.
--
-- Design decisions:
--   • event_id (VARCHAR UNIQUE) stores Violet's X-Violet-Event-Id header for deduplication.
--     INSERT with ON CONFLICT(event_id) DO NOTHING makes duplicate deliveries a no-op.
--   • status enum tracks processing lifecycle: received → processed | failed.
--   • payload stored as JSONB for debugging — not used in hot paths.
--   • RLS enabled with NO policies = implicit deny for anon/authenticated.
--     Only service_role (Edge Functions) can read/write.

-- Webhook events table for idempotent processing and audit trail
CREATE TABLE public.webhook_events (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      VARCHAR      NOT NULL,
  event_type    VARCHAR      NOT NULL,
  entity_id     VARCHAR      NOT NULL,
  status        VARCHAR      NOT NULL DEFAULT 'received',
  payload       JSONB,
  error_message TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  processed_at  TIMESTAMPTZ
);

-- Unique index on event_id for idempotency (prevents duplicate processing)
CREATE UNIQUE INDEX idx_webhook_events_event_id
  ON public.webhook_events(event_id);

-- Composite index for monitoring queries (e.g., "show all OFFER_UPDATED events today")
CREATE INDEX idx_webhook_events_type_date
  ON public.webhook_events(event_type, created_at DESC);

-- Enable RLS — no policies = only service_role can access (implicit deny for all others)
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.webhook_events IS
  'Stores inbound Violet webhook events for idempotent processing and monitoring. '
  'event_id maps to X-Violet-Event-Id header. Only accessible via service_role.';
