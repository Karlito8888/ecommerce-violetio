-- Migration: create_user_profiles
-- Story 2.1: Anonymous Session & Supabase Auth Setup
-- Creates user_profiles table with RLS policy enforcing auth.uid() = user_id

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast user_id lookups (also enforces uniqueness via UNIQUE constraint above)
CREATE INDEX IF NOT EXISTS user_profiles_user_id_idx ON public.user_profiles(user_id);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Enable Row-Level Security (MANDATORY — see architecture.md)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can only access their own profile row
-- Applies to SELECT, INSERT, UPDATE, DELETE
CREATE POLICY "users_own_profile" ON public.user_profiles
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.user_profiles IS
  'One row per auth.users entry. Accessible only to the owning user via RLS.';
COMMENT ON COLUMN public.user_profiles.user_id IS
  'References auth.users.id — works for both anonymous and authenticated users.';
