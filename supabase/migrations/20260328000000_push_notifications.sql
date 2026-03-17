-- Story 6.7: Push Notification Infrastructure & Preferences
-- Creates tables for push token storage and per-type notification preferences.

-- ─── user_push_tokens ─────────────────────────────────────────────────────────

CREATE TABLE public.user_push_tokens (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expo_push_token TEXT        NOT NULL UNIQUE,
  device_id       TEXT        NOT NULL,
  platform        TEXT        NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can manage their own push tokens
CREATE POLICY "users_own_push_tokens" ON user_push_tokens
  FOR ALL USING (user_id = auth.uid());

-- Service role bypass for Edge Functions (send-push needs to read tokens)
CREATE POLICY "service_role_push_tokens" ON user_push_tokens
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX idx_push_tokens_user_id ON user_push_tokens(user_id);

-- ─── notification_preferences ─────────────────────────────────────────────────

CREATE TABLE public.notification_preferences (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT        NOT NULL CHECK (notification_type IN (
    'order_updates', 'price_drops', 'back_in_stock', 'marketing'
  )),
  enabled           BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, notification_type)
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can manage their own notification preferences
CREATE POLICY "users_own_notification_prefs" ON notification_preferences
  FOR ALL USING (user_id = auth.uid());

-- Service role bypass for Edge Functions (send-push checks preferences)
CREATE POLICY "service_role_notification_prefs" ON notification_preferences
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX idx_notification_prefs_user_id ON notification_preferences(user_id);

-- ─── notification_logs alterations ────────────────────────────────────────────
-- Extend the existing notification_logs table (Story 5.6) to support push notifications:
-- 1. Make order_id nullable (engagement push notifications have no order)
-- 2. Drop the CHECK constraint on notification_type (push types use push_ prefix)

ALTER TABLE notification_logs ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE notification_logs DROP CONSTRAINT IF EXISTS notification_logs_notification_type_check;

-- Anti-spam index: find recent engagement push notifications per user
CREATE INDEX idx_notification_logs_push_antispam
  ON notification_logs(recipient_email, notification_type, created_at DESC)
  WHERE notification_type IN ('push_price_drop', 'push_back_in_stock');
