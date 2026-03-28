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
import { router, Link } from "expo-router";
import {
  signUpWithEmail,
  signInWithSocialProviderMobile,
  createSupabaseClient,
  mapAuthError,
} from "@ecommerce/shared";
import type { SocialProvider } from "@ecommerce/shared";
import * as WebBrowser from "expo-web-browser";
import { colors, typography, spacing } from "@ecommerce/ui";
import { setPendingSignup } from "./_pending";

export default function SignupScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<SocialProvider | null>(null);

  async function handleSocialLogin(provider: SocialProvider) {
    setError("");
    setSocialLoading(provider);
    try {
      const supabase = createSupabaseClient();
      const { data, error: oauthError } = await signInWithSocialProviderMobile(provider, supabase);
      if (oauthError) {
        setError(mapAuthError(oauthError.message));
        setSocialLoading(null);
        return;
      }
      if (data?.url) {
        await WebBrowser.openAuthSessionAsync(data.url);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setSocialLoading(null);
    }
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!email) errors.email = "Email is required";
    if (!password) errors.password = "Password is required";
    else if (password.length < 6) errors.password = "Password must be at least 6 characters";
    if (password !== confirmPassword) errors.confirmPassword = "Passwords do not match";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit() {
    setError("");
    if (!validate()) return;

    setIsLoading(true);
    try {
      const supabase = createSupabaseClient();
      const { data, error: authError } = await signUpWithEmail(email, password, supabase);

      if (authError) {
        setError(mapAuthError(authError.message));
        return;
      }

      // When email confirmations are disabled, account is ready immediately
      if (data?.user?.email_confirmed_at) {
        router.replace("/");
        return;
      }

      // Email confirmations enabled — OTP was sent, go to verify page
      setPendingSignup(email, password);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Expo typed routes not yet regenerated
      router.push("/auth/verify" as any);
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
        <Text style={styles.heading}>Create Account</Text>
        <Text style={styles.subheading}>Join us for a curated shopping experience</Text>

        {error !== "" && (
          <View style={styles.globalError}>
            <Text style={styles.globalErrorText}>{error}</Text>
          </View>
        )}

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, fieldErrors.email ? styles.inputError : undefined]}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
          />
          {fieldErrors.email ? <Text style={styles.errorText}>{fieldErrors.email}</Text> : null}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={[styles.input, fieldErrors.password ? styles.inputError : undefined]}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password-new"
            textContentType="newPassword"
          />
          {fieldErrors.password ? (
            <Text style={styles.errorText}>{fieldErrors.password}</Text>
          ) : null}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Confirm Password</Text>
          <TextInput
            style={[styles.input, fieldErrors.confirmPassword ? styles.inputError : undefined]}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoComplete="password-new"
            textContentType="newPassword"
          />
          {fieldErrors.confirmPassword ? (
            <Text style={styles.errorText}>{fieldErrors.confirmPassword}</Text>
          ) : null}
        </View>

        <Pressable
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? "Sending verification..." : "Create Account"}
          </Text>
        </Pressable>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or continue with</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable
          style={[
            styles.socialBtn,
            styles.socialBtnGoogle,
            socialLoading !== null && styles.buttonDisabled,
          ]}
          onPress={() => handleSocialLogin("google")}
          disabled={socialLoading !== null}
        >
          <Text style={styles.socialBtnGoogleText}>
            {socialLoading === "google" ? "Redirecting..." : "Continue with Google"}
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.socialBtn,
            styles.socialBtnApple,
            socialLoading !== null && styles.buttonDisabled,
          ]}
          onPress={() => handleSocialLogin("apple")}
          disabled={socialLoading !== null}
        >
          <Text style={styles.socialBtnAppleText}>
            {socialLoading === "apple" ? "Redirecting..." : "Continue with Apple"}
          </Text>
        </Pressable>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- Expo typed routes not yet regenerated */}
          <Link href={"/auth/login" as any} style={styles.footerLink}>
            Sign in
          </Link>
        </View>
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
  },
  input: {
    borderWidth: 1,
    borderColor: colors.stone,
    borderRadius: 8,
    padding: spacing.px[3],
    fontSize: typography.typeScale.body.size,
    color: colors.ink,
    backgroundColor: colors.ivory,
  },
  inputError: {
    borderColor: colors.error,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.typeScale.caption.size,
    marginTop: spacing.px[1],
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
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.px[6],
  },
  footerText: {
    color: colors.steel,
    fontSize: typography.typeScale.bodySmall.size,
  },
  footerLink: {
    color: colors.gold,
    fontSize: typography.typeScale.bodySmall.size,
    fontWeight: "500",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing.px[5],
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.stone,
  },
  dividerText: {
    color: colors.steel,
    fontSize: typography.typeScale.caption.size,
    marginHorizontal: spacing.px[3],
  },
  socialBtn: {
    borderRadius: 8,
    padding: spacing.px[4],
    alignItems: "center",
    marginBottom: spacing.px[3],
    borderWidth: 1,
  },
  socialBtnGoogle: {
    backgroundColor: "#fff",
    borderColor: colors.stone,
  },
  socialBtnGoogleText: {
    color: colors.ink,
    fontSize: typography.typeScale.body.size,
    fontWeight: "500",
  },
  socialBtnApple: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  socialBtnAppleText: {
    color: "#fff",
    fontSize: typography.typeScale.body.size,
    fontWeight: "500",
  },
});
