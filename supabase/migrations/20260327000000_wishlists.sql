-- Story 6.4: Wishlist / Saved Items
-- Creates wishlists + wishlist_items tables with RLS, indexes, unique constraints.
-- No full product data cached — Violet is source of truth for price/availability.

-- ─── wishlists: one per authenticated user ───
CREATE TABLE IF NOT EXISTS public.wishlists (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── wishlist_items: products saved in a wishlist ───
-- product_id is TEXT (Violet product ID, not a local FK)
CREATE TABLE IF NOT EXISTS public.wishlist_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wishlist_id  UUID NOT NULL REFERENCES public.wishlists(id) ON DELETE CASCADE,
  product_id   TEXT NOT NULL,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(wishlist_id, product_id)
);

-- ─── Indexes ───
CREATE INDEX IF NOT EXISTS idx_wishlists_user_id ON public.wishlists(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_wishlist_id ON public.wishlist_items(wishlist_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_product_id ON public.wishlist_items(product_id);

-- ─── RLS: wishlists ───
ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_wishlist" ON public.wishlists
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users_insert_own_wishlist" ON public.wishlists
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_update_own_wishlist" ON public.wishlists
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_delete_own_wishlist" ON public.wishlists
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "service_role_all_wishlists" ON public.wishlists
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── RLS: wishlist_items ───
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_wishlist_items" ON public.wishlist_items
  FOR SELECT TO authenticated
  USING (wishlist_id IN (SELECT id FROM public.wishlists WHERE user_id = auth.uid()));

CREATE POLICY "users_insert_own_wishlist_items" ON public.wishlist_items
  FOR INSERT TO authenticated
  WITH CHECK (wishlist_id IN (SELECT id FROM public.wishlists WHERE user_id = auth.uid()));

CREATE POLICY "users_delete_own_wishlist_items" ON public.wishlist_items
  FOR DELETE TO authenticated
  USING (wishlist_id IN (SELECT id FROM public.wishlists WHERE user_id = auth.uid()));

CREATE POLICY "service_role_all_wishlist_items" ON public.wishlist_items
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
