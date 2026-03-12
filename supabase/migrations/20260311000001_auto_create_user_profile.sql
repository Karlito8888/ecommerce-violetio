-- Migration: auto-create user_profiles on account creation
-- Replaces client-side upsert in verify.tsx (web + mobile) with a database trigger.
-- This ensures a profile always exists for authenticated users, regardless of client.

-- Function: creates a user_profiles row when a user signs up or converts from anonymous
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only create profile for non-anonymous users
  -- (anonymous users don't need a profile until they convert)
  -- Use is_anonymous flag directly — raw_app_meta_data->>'provider' can be NULL
  -- for anonymous users, and NULL IS DISTINCT FROM 'anonymous' = TRUE (bug).
  IF NEW.is_anonymous IS NOT TRUE THEN
    INSERT INTO public.user_profiles (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger on auth.users insert (new account creation)
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Trigger on auth.users update (anonymous -> full account conversion)
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (
    OLD.is_anonymous IS TRUE AND
    NEW.is_anonymous IS NOT TRUE
  )
  EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user() IS
  'Auto-creates user_profiles row for non-anonymous users. Fires on INSERT and anonymous->full conversion.';
