-- Story 6.1: User Account & Profile Management
-- Extend user_profiles with display name, avatar, and preferences columns.

-- ─── New columns ────────────────────────────────────────────────────────────

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}';

-- ─── Constraints ────────────────────────────────────────────────────────────

ALTER TABLE user_profiles
  ADD CONSTRAINT chk_display_name_length
    CHECK (display_name IS NULL OR char_length(display_name) <= 100);

ALTER TABLE user_profiles
  ADD CONSTRAINT chk_avatar_url_length
    CHECK (avatar_url IS NULL OR char_length(avatar_url) <= 500);

-- ─── Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_user_profiles_display_name
  ON user_profiles(display_name) WHERE display_name IS NOT NULL;

-- ─── RLS note ───────────────────────────────────────────────────────────────
-- No new RLS policies needed. Existing policies handle the requirements:
--   1. "users_own_profile" (PERMISSIVE, ALL): user_id = auth.uid() → users can read/update own row
--   2. "block_anonymous_writes" (RESTRICTIVE, INSERT/UPDATE/DELETE): blocks anonymous users
-- Result: authenticated users can UPDATE their own profile (including new columns).
--         Anonymous users can only SELECT (read-only). ✅
