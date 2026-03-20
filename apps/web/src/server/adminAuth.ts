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

/**
 * Verify the current user is an admin, or throw HTTP 403.
 *
 * For use in server-side handlers where unauthorized access should be rejected
 * immediately. Route-level guards should use getAdminUserFn() instead.
 */
export async function requireAdminOrThrow(): Promise<{ id: string; email: string | null }> {
  const supabase = getSupabaseSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous || user.app_metadata?.user_role !== "admin") {
    throw new Response("Forbidden: admin access required", { status: 403 });
  }

  return { id: user.id, email: user.email ?? null };
}
