/** Configure environment variables for platforms without process.env (React Native) */
export { configureEnv, createSupabaseClient, _resetSupabaseClient } from "./supabase.js";
export type { SupabaseBrowserConfig, SupportedStorage } from "./supabase.js";
export { initAnonymousSession } from "./auth.js";
