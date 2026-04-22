import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import {
  verifyEmailOtp,
  setAccountPassword,
  createSupabaseClient,
  mapAuthError,
} from "@ecommerce/shared";
import { colors, typography, spacing } from "@ecommerce/ui";
import { getPendingSignup, clearPendingSignup } from "@/utils/pendingSignup";

export default function VerifyScreen() {
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const { email, password } = getPendingSignup();

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
      const supabase = createSupabaseClient();

      // Step 2: Verify OTP
      const { error: verifyError } = await verifyEmailOtp(email, otp, supabase);
      if (verifyError) {
        setError(mapAuthError(verifyError.message));
        return;
      }

      // Step 3: Set password
      const { error: pwError } = await setAccountPassword(password, supabase);
      if (pwError) {
        setError(mapAuthError(pwError.message));
        return;
      }

      // Step 4: Create user_profiles row
      // Note: user_profiles row is auto-created by DB trigger (on_auth_user_created/on_auth_user_updated).
      // This upsert is a safety net in case the trigger hasn't fired yet due to race conditions.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { error: profileError } = await supabase
          .from("user_profiles")
          .upsert({ user_id: user.id });
        if (profileError) {
          // eslint-disable-next-line no-console
          console.error("[auth] Failed to create user profile:", profileError.message);
        }
      }

      clearPendingSignup();
      router.replace("/");
    } catch {
      setError("An unexpected error occurred. Please try again.");
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
          <Text style={styles.backLinkText}>Didn't receive a code? Try again</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ivory,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.px[8],
  },
  heading: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: typography.typeScale.h1.size,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RN fontWeight type mismatch with numeric literal
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
  globalErrorText: {
    color: colors.error,
    fontSize: typography.typeScale.bodySmall.size,
  },
  field: {
    marginBottom: spacing.px[5],
  },
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
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.ivory,
    fontSize: typography.typeScale.body.size,
    fontWeight: "600",
  },
  backLink: {
    marginTop: spacing.px[6],
    alignItems: "center",
  },
  backLinkText: {
    color: colors.gold,
    fontSize: typography.typeScale.bodySmall.size,
    fontWeight: "500",
  },
});
