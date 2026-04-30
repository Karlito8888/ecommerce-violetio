-- Migration: Drop merchant_feature_flags table — never read by apps
-- Flags are toggled via Violet API (PUT /merchants/{id}/configuration/global_feature_flags/{flag})
-- and the current state is available directly from Violet. No need for a local copy.

DROP TABLE IF EXISTS public.merchant_feature_flags;
