-- Migration: add_biometric_enabled
-- Story 2.4: Biometric Authentication (Mobile)
-- Adds biometric_enabled flag to user_profiles for opt-in biometric login

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS biometric_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_profiles.biometric_enabled IS
  'Whether the user has enabled biometric login (Face ID / fingerprint) on their mobile device.';
