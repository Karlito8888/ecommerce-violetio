// apps/mobile/src/app/auth/verify.tsx
//
// Email OTP verification screen migrated from Supabase to Convex Auth (Phase 6).
//
// Flow:
//   1. Signup page calls signIn("password", { flow: "signUp" }) → sends OTP via Resend
//   2. This page collects the 6-digit code
//   3. signIn("password", { flow: "signUp", code }) verifies the code
//   4. migrateAnonymousData(localId) transfers wishlist/events
//   5. Navigate to home

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useAuthActions } from "@convex-dev/auth/react";
import { colors, typography, spacing } from "@ecommerce/ui";
import { getPendingSignup, clearPendingSignup } from "@/utils/pendingSignup";
import { mapAuthError } from "@ecommerce/shared";

export default function VerifyScreen() {
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { signIn } = useAuthActions();

  // Load pending signup data from SecureStore (encrypted, not plain memory)
  const [pendingData, setPendingData] = useState<{ email: string; password: string } | null>(
    null,
  );
  const [isLoadingPending, setIsLoadingPending] = useState(true);

  useEffect(() => {
    getPendingSignup().then((data) => {
      setPendingData(data);
      setIsLoadingPending(false);
    });
  }, []);

  const email = pendingData?.email ?? "";
  const password = pendingData?.password ?? "";

  // Loading state while reading from SecureStore
  if (isLoadingPending) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.gold} style={{ marginTop: 48 }} />
      </View>
    );
  }

  if (!email || !password) {
    return (
      <View style={styles.container}>
        <View style={styles.scroll}>
          <Text style={styles.heading}>Verification</Text>
          <Text style={styles.subheading}>
            No pending signup. Please go back and sign up again.
          </Text>
          <Pressable style={styles.button} onPress={() => router.back()}>
            <Text style={styles.buttonText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  async function handleSubmit() {
    setError("");

    if (!otp || otp.length !== 6) {
      setError("Please enter the 6-digit code from your email");
      return;
    }

    setIsLoading(true);
    try {
      // Step 1: Verify OTP and complete sign-up
      await signIn("password", {
        email,
        password,
        flow: "signUp",
        code: otp,
      });

      // Step 2: Anonymous data migration is handled centrally by AuthContext.tsx
      // when it detects the isAuthenticated transition. No need to do it here.
      // This avoids a double-migration (verify.tsx + AuthContext both firing).

      // Step 3: Clean up encrypted signup data and navigate
      await clearPendingSignup();
      router.replace("/");
    } catch (err) {
      setError(mapAuthError(err, "verify"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Check Your Email</Text>
        <Text style={styles.subheading}>We sent a 6-digit code to {email}</Text>

        {error !== "" && (
          <View style={styles.globalError}>
            <Text style={styles.globalErrorText}>{error}</Text>
          </View>
        )}

        <View style={styles.field}>
          <Text style={styles.label}>Verification Code</Text>
          <TextInput
            style={styles.otpInput}
            value={otp}
            onChangeText={(text) => setOtp(text.replace(/\D/g, ""))}
            keyboardType="number-pad"
            maxLength={6}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            autoFocus
          />
        </View>

        <Pressable
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? "Verifying..." : "Verify & Create Account"}
          </Text>
        </Pressable>

        <Pressable style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>Didn&apos;t receive a code? Try again</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ivory },
  scroll: { flexGrow: 1, justifyContent: "center", padding: spacing.px[8] },
  heading: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: typography.typeScale.h1.size,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fontWeight: typography.typeScale.h1.weight as any,
    color: colors.ink,
    textAlign: "center",
    marginBottom: spacing.px[2],
  },
  subheading: {
    fontSize: typography.typeScale.body.size,
    color: colors.steel,
    textAlign: "center",
    marginBottom: spacing.px[8],
  },
  globalError: {
    backgroundColor: "rgba(181, 74, 74, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(181, 74, 74, 0.2)",
    borderRadius: 8,
    padding: spacing.px[3],
    marginBottom: spacing.px[5],
  },
  globalErrorText: { color: colors.error, fontSize: typography.typeScale.bodySmall.size },
  field: { marginBottom: spacing.px[5] },
  label: {
    fontSize: typography.typeScale.bodySmall.size,
    fontWeight: "500",
    color: colors.charcoal,
    marginBottom: spacing.px[2],
    textAlign: "center",
  },
  otpInput: {
    borderWidth: 1,
    borderColor: colors.stone,
    borderRadius: 8,
    padding: spacing.px[4],
    fontSize: 24,
    fontWeight: "600",
    color: colors.ink,
    backgroundColor: colors.ivory,
    textAlign: "center",
    letterSpacing: 12,
  },
  button: {
    backgroundColor: colors.gold,
    borderRadius: 8,
    padding: spacing.px[4],
    alignItems: "center",
    marginTop: spacing.px[2],
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.ivory, fontSize: typography.typeScale.body.size, fontWeight: "600" },
  backLink: { marginTop: spacing.px[6], alignItems: "center" },
  backLinkText: {
    color: colors.gold,
    fontSize: typography.typeScale.bodySmall.size,
    fontWeight: "500",
  },
});
