-- Migration: notification_logs table
-- Story 5.6: Email Notifications Pipeline
--
-- Audit log for transactional email delivery attempts via Resend API.
-- Tracks each send attempt (up to 3 per notification) for operational visibility.
--
-- ## Notification types
-- Four lifecycle events trigger emails, all fired from handle-webhook processors:
--   - order_confirmed: Full order summary after checkout completion
--   - bag_shipped:     Shipping confirmation with tracking link (BAG_SHIPPED webhook)
--   - bag_delivered:   Delivery confirmation (BAG_COMPLETED webhook → status COMPLETED)
--   - refund_processed: Refund acknowledgment with amount/reason (BAG_REFUNDED webhook)
--
-- ## Retry tracking
-- Each Resend API call is logged as a separate row (attempt 1, 2, or 3).
-- Retryable errors (HTTP 429, 500) trigger exponential backoff (0ms, 1s, 3s).
-- Non-retryable errors (400, 401, 403, 422) stop immediately with status='failed'.
-- On success, status='sent' and resend_email_id stores Resend's tracking ID.
--
-- ## Idempotency note
-- The send-notification Edge Function uses Resend's Idempotency-Key header
-- (key = "{order_id}-{type}-{bag_id}") to prevent duplicate emails on retry.
-- However, notification_logs does NOT enforce uniqueness — multiple rows per
-- notification are expected (one per attempt). This is intentional for audit trail.
--
-- ## Access control
-- Service-role only — this is an operational log, not user-facing data.
-- No Realtime publication needed (admin queries only).
--
-- @see https://docs.resend.com/api-reference/emails/send-email — Resend API
-- @see supabase/functions/send-notification/index.ts — Edge Function that writes to this table

CREATE TABLE notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('order_confirmed', 'bag_shipped', 'bag_delivered', 'refund_processed')),
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  resend_email_id TEXT,
  error_message TEXT,
  attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary lookup: all notifications for a given order (order detail admin view)
CREATE INDEX idx_notification_logs_order_id ON notification_logs(order_id);

-- Dedup check: "has this notification type already been sent for this order?"
-- Used alongside Resend's Idempotency-Key for belt-and-suspenders protection.
CREATE INDEX idx_notification_logs_order_type
  ON notification_logs(order_id, notification_type);

-- Failed notification monitoring (partial index — only indexes failed rows)
CREATE INDEX idx_notification_logs_failed ON notification_logs(status)
  WHERE status = 'failed';

-- RLS: service_role only (operational log, not user-facing).
-- service_role bypasses RLS in Supabase, but an explicit policy is added
-- for clarity and defense-in-depth.
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_notification_logs" ON notification_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ## Cleanup strategy
--
-- POST-LAUNCH TODO: Data Retention Policy for notification_logs
--
-- This table grows with every email send attempt (~1-3 rows per notification,
-- depending on retries). Retention is longer than webhook_events because
-- email delivery history has direct customer support value.
--
-- Policy:
--   - Sent notifications: DELETE after 180 days (successful deliveries are
--     confirmable via Resend dashboard; local logs are for operational triage)
--   - Pending notifications: DELETE after 180 days (stale pending = Edge Function
--     crash; after 180 days these are no longer actionable)
--   - Failed notifications: KEEP indefinitely (needed for support escalations,
--     deliverability analysis, and detecting systematic Resend/template issues)
--
-- pg_cron implementation (run when pg_cron extension is available):
--
--   -- Enable pg_cron (requires superuser, done once via Supabase dashboard)
--   -- CREATE EXTENSION IF NOT EXISTS pg_cron;
--
--   -- Schedule weekly cleanup on Sundays at 4:00 AM UTC
--   -- (less frequent than webhook_events — lower volume, less urgency)
--   SELECT cron.schedule(
--     'purge-old-notification-logs',
--     '0 4 * * 0',
--     $$DELETE FROM public.notification_logs
--       WHERE status != 'failed'
--         AND created_at < now() - interval '180 days'$$
--   );
--
-- Estimated impact: at ~100 notifications/day (4 types × ~25 orders),
-- 180-day retention keeps ~18K rows. Failed rows are typically <5% and
-- kept indefinitely for root cause analysis.
--
-- Alternative (without pg_cron): schedule a Supabase Edge Function via
-- external cron (e.g., GitHub Actions scheduled workflow, Upstash QStash)
-- that calls an RPC function performing the same DELETE.
