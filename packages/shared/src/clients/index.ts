/** Configure environment variables for platforms without process.env (React Native) */
export { configureEnv, createSupabaseClient, _resetSupabaseClient } from "./supabase.js";
export type { SupabaseBrowserConfig, SupportedStorage } from "./supabase.js";
export {
  initAnonymousSession,
  signUpWithEmail,
  verifyEmailOtp,
  setAccountPassword,
  signInWithEmail,
  signOut,
} from "./auth.js";
export { violetLogin, violetRefreshToken, VioletTokenManager } from "./violetAuth.js";
export { getBiometricPreference, setBiometricPreference } from "./biometricAuth.js";
export { getProfile, updateProfile } from "./profile.js";
export type { SocialProvider } from "./auth.js";
export { signInWithSocialProvider, signInWithSocialProviderMobile } from "./auth.js";
