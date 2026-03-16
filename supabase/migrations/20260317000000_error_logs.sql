-- Migration: error_logs table
-- Story 4.7 — Checkout Error Handling & Edge Cases
-- Timestamp: 20260317000000

CREATE TABLE IF NOT EXISTS error_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  source      TEXT NOT NULL,          -- 'web' | 'mobile' | 'edge-function'
  error_type  TEXT NOT NULL,          -- e.g. 'VIOLET.API_ERROR', 'CART.EXPIRED'
  message     TEXT NOT NULL,
  stack_trace TEXT,
  context     JSONB,                  -- Flexible: cart_id, user_id, request details
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id  TEXT                    -- For anonymous users
);

-- Index for querying recent errors by source (admin dashboard, Story 8.5)
CREATE INDEX idx_error_logs_source_created ON error_logs (source, created_at DESC);

-- Index for querying by error type
CREATE INDEX idx_error_logs_type ON error_logs (error_type);

-- RLS
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Service role (Edge Functions, Server Functions) can insert any error
CREATE POLICY "service_role_insert" ON error_logs
  FOR INSERT TO service_role WITH CHECK (true);

-- Users can read their own errors (for debugging on client)
CREATE POLICY "users_read_own" ON error_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Service role can read all (for admin dashboard, Story 8.5)
CREATE POLICY "service_role_read_all" ON error_logs
  FOR SELECT TO service_role USING (true);
