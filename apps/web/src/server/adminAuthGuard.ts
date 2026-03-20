import { getSupabaseSessionClient } from "#/server/supabaseServer";

/**
 * Verify the current user is an admin, or throw HTTP 403.
 *
 * For use inside server function handlers where unauthorized access should be
 * rejected immediately. Route-level guards should use getAdminUserFn() instead.
 *
 * This function lives in a separate module from adminAuth.ts so that route
 * files (which import adminAuth for createServerFn-based guards) do not pull
 * supabaseServer.ts into the client bundle.
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
