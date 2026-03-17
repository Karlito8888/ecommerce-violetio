-- Story 6.3: Personalized Search Results
-- SQL function to aggregate user browsing/purchase history into a search profile.
-- No new tables — uses existing user_events (Story 6.2), orders/order_bags/order_items (Story 5.1).

CREATE OR REPLACE FUNCTION public.get_user_search_profile(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_top_categories JSONB;
  v_avg_order_price INTEGER;
  v_recent_product_ids JSONB;
  v_total_events INTEGER;
BEGIN
  -- Top categories from browsing history (last 3 months, max 5)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('category', cat, 'view_count', cnt)), '[]'::JSONB)
  INTO v_top_categories
  FROM (
    SELECT
      COALESCE(payload->>'category', payload->>'category_name') AS cat,
      COUNT(*) AS cnt
    FROM public.user_events
    WHERE user_id = p_user_id
      AND event_type IN ('product_view', 'category_view')
      AND created_at > now() - INTERVAL '3 months'
      AND (payload->>'category' IS NOT NULL OR payload->>'category_name' IS NOT NULL)
    GROUP BY 1
    ORDER BY cnt DESC
    LIMIT 5
  ) sub;

  -- Average order item price in cents (via order_bags intermediate table)
  SELECT COALESCE(AVG(oi.price)::INTEGER, 0)
  INTO v_avg_order_price
  FROM public.order_items oi
  JOIN public.order_bags ob ON ob.id = oi.order_bag_id
  JOIN public.orders o ON o.id = ob.order_id
  WHERE o.user_id = p_user_id;

  -- Recent product IDs from product views (last 30 days, max 20)
  SELECT COALESCE(jsonb_agg(DISTINCT pid), '[]'::JSONB)
  INTO v_recent_product_ids
  FROM (
    SELECT payload->>'product_id' AS pid
    FROM public.user_events
    WHERE user_id = p_user_id
      AND event_type = 'product_view'
      AND created_at > now() - INTERVAL '30 days'
      AND payload->>'product_id' IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 20
  ) sub;

  -- Total events count (profile strength indicator)
  SELECT COUNT(*)
  INTO v_total_events
  FROM public.user_events
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'top_categories', v_top_categories,
    'avg_order_price', v_avg_order_price,
    'recent_product_ids', v_recent_product_ids,
    'total_events', v_total_events
  );
END;
$$;

-- Grant execute: authenticated users can call (Edge Function validates JWT first)
GRANT EXECUTE ON FUNCTION public.get_user_search_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_search_profile(UUID) TO service_role;
