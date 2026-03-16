-- Story 6.2: Browsing History & Preference Tracking
-- Creates user_events table for tracking authenticated user browsing activity.
-- Events power personalization features (Stories 6.3, 6.5, 6.6).

-- ── Table ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Constraints ───────────────────────────────────────────────────────────────
ALTER TABLE public.user_events
  ADD CONSTRAINT chk_event_type CHECK (
    event_type IN ('product_view', 'search', 'category_view')
  );

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;

-- Users can read their own events (for browsing history display, personalization)
CREATE POLICY "users_read_own_events" ON public.user_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can do everything (writes come from Server Functions / Edge Functions)
CREATE POLICY "service_role_all_events" ON public.user_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Type-specific queries: "all product_views for user X"
CREATE INDEX idx_user_events_user_type
  ON public.user_events(user_id, event_type);

-- Chronological queries: "last 50 events for user X"
CREATE INDEX idx_user_events_user_created
  ON public.user_events(user_id, created_at DESC);

-- Retention cleanup: pg_cron purge of old events
CREATE INDEX idx_user_events_created_at
  ON public.user_events(created_at);

-- ── Retention (pg_cron) ───────────────────────────────────────────────────────
-- pg_cron must be enabled via Supabase Dashboard > Database > Extensions.
-- Once enabled, run the following in the SQL Editor:
--
--   SELECT cron.schedule(
--     'purge-old-user-events',
--     '0 3 * * *',
--     $$DELETE FROM public.user_events WHERE created_at < now() - interval '6 months'$$
--   );
--
-- For local dev, events accumulate without cleanup.
-- Alternative: scheduled Edge Function via Dashboard > Edge Functions > Schedules.
