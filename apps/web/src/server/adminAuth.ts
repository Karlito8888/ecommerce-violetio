import { createServerFn } from "@tanstack/react-start";

import { getSupabaseSessionClient } from "#/server/supabaseServer";

/**
 * Server function that returns the current admin user, or null.
 *
 * Uses getSupabaseSessionClient() to read the JWT from cookies (same pattern
 * as account/route.tsx's getAuthUserFn) then checks app_metadata.user_role.
 */
export const getAdminUserFn = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = getSupabaseSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) return null;
  if (user.app_metadata?.user_role !== "admin") return null;

  return { id: user.id, email: user.email ?? null };
});
