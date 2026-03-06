// Re-export from shared package — single source of truth for anonymous session init.
// Web consumers should prefer calling initAnonymousSession(getSupabaseBrowserClient())
// directly to use the cookie-based @supabase/ssr client.
export { initAnonymousSession } from "@ecommerce/shared";
