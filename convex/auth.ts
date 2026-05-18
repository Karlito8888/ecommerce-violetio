// convex/auth.ts
//
// Convex Auth — Configuration Phase 2.
//
// Active provider:
//   Password — email/password with verification (OTP via Resend) + password reset
//
// OAuth providers (activés quand les credentials seront disponibles):
//   Apple:  npx convex env set AUTH_APPLE_ID <service-id>
//           npx convex env set AUTH_APPLE_SECRET <jwt>
//   Google: npx convex env set AUTH_GOOGLE_ID <client-id>
//           npx convex env set AUTH_GOOGLE_SECRET <client-secret>
//   Then uncomment imports + providers below.
//
// Callbacks:
//   - afterUserCreatedOrUpdated : auto-création du userProfiles
//
// Env vars Convex:
//   AUTH_RESEND_KEY     — Resend API key (OTP delivery)
//   EMAIL_FROM_ADDRESS  — Sender address (noreply@maisonemile.com)
//
// Doc: https://labs.convex.dev/auth/setup/manual
// Doc: https://labs.convex.dev/auth/config/passwords

import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { ResendOTP } from "./lib/resendOTP";
import { ResendOTPPasswordReset } from "./lib/resendOTP";
import type { MutationCtx } from "./_generated/server";

// ─── OAuth imports (décommenter quand les credentials sont disponibles) ──────
// import Apple from "@auth/core/providers/apple";
// import Google from "@auth/core/providers/google";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    // ─── Password (email/password with verification & reset) ─────
    Password({
      // Email verification on sign-up — sends 6-digit OTP via Resend.
      verify: ResendOTP,

      // Password reset flow — sends 6-digit OTP via Resend.
      // Flow: "forgot" → enter email → receive code → enter code + new password.
      reset: ResendOTPPasswordReset,

      // Extract display name from sign-up form data.
      profile(params) {
        return {
          email: params.email as string,
          name: params.name as string,
        };
      },
    }),

    // ─── OAuth providers (décommenter + configurer env vars) ─────
    // Apple({
    //   profile: (appleInfo) => {
    //     const name = appleInfo.user
    //       ? `${appleInfo.user.name.firstName} ${appleInfo.user.name.lastName}`
    //       : undefined;
    //     return { id: appleInfo.sub, name, email: appleInfo.email };
    //   },
    // }),
    // Google,
  ],
  callbacks: {
    // Appelé automatiquement après création ou mise à jour d'un utilisateur.
    // Crée le profil associé dans la table `userProfiles` s'il n'existe pas.
    async afterUserCreatedOrUpdated(ctx, { userId }) {
      const typedCtx = ctx as unknown as MutationCtx;
      const existing = await typedCtx.db
        .query("userProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first();

      if (!existing) {
        await typedCtx.db.insert("userProfiles", {
          userId,
          preferences: {},
          biometricEnabled: false,
        });
      }
      // Future: update displayName / avatarUrl from OAuth profile data on login.
      // The Password provider doesn't send updated profile fields after creation,
      // so there's nothing to sync yet. When Google/Apple OAuth is enabled,
      // extract name/email from the identity and patch the profile here.
    },
  },
});
