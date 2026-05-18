// apps/mobile/src/app/profile.tsx
//
// Profile/Settings screen migrated from Supabase to Convex Auth (Phase 6).
//
// Uses Convex queries for profile data and mutations for updates.
// Change password uses Convex Auth reset flow with inline OTP.

import React, { useState, useEffect } from "react";
import { ScrollView, StyleSheet, Pressable, TextInput, Alert, View } from "react-native";
import { router } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";

import { BiometricToggle } from "@/components/BiometricToggle";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { colors } from "@ecommerce/ui";
import { api } from "#convex/_generated/api";

type PasswordStep = "idle" | "otp-sent" | "success";

export default function ProfileScreen() {
  const { email, isAuthenticated } = useAuth();
  const { signIn } = useAuthActions();

  const profile = useQuery(api.users.queries.getProfile, isAuthenticated ? {} : "skip");
  const updateProfile = useMutation(api.users.mutations.updateProfile);

  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [isSaving, setIsSaving] = useState(false);

  // Password change state
  const [passwordStep, setPasswordStep] = useState<PasswordStep>("idle");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName ?? "");
      setAvatarUrl(profile.avatarUrl ?? "");
      const prefs = profile.preferences as Record<string, unknown> | null;
      setTheme((prefs?.theme as "light" | "dark" | "system") ?? "system");
    }
  }, [profile]);

  async function handleSaveProfile() {
    setIsSaving(true);
    try {
      await updateProfile({
        displayName: displayName || undefined,
        avatarUrl: avatarUrl || undefined,
        preferences: { theme },
      });
      Alert.alert("Success", "Profile updated.");
    } catch {
      Alert.alert("Error", "Failed to update profile.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRequestReset() {
    setPasswordError("");
    if (!email) {
      Alert.alert("Error", "No email associated with account.");
      return;
    }
    setIsChangingPassword(true);
    try {
      await signIn("password", { email, flow: "reset" });
      setPasswordStep("otp-sent");
    } catch {
      setPasswordError("Failed to send verification code.");
    } finally {
      setIsChangingPassword(false);
    }
  }

  async function handleCompleteReset() {
    setPasswordError("");
    if (!otp || otp.length !== 6) {
      setPasswordError("Please enter the 6-digit code.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError(
        "Password must be at least 8 characters with uppercase, lowercase, and a digit.",
      );
      return;
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setPasswordError("Password must include uppercase, lowercase, and a digit.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    if (!email) return;

    setIsChangingPassword(true);
    try {
      await signIn("password", { email, flow: "reset-verification", code: otp, newPassword });
      setPasswordStep("success");
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
      Alert.alert("Success", "Password changed successfully.");
    } catch {
      setPasswordError("Invalid code or failed to change password.");
    } finally {
      setIsChangingPassword(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="subtitle" style={styles.title}>
        Settings
      </ThemedText>

      {/* Order Tracking */}
      <ThemedText type="default" style={styles.sectionHeader}>
        Order Tracking
      </ThemedText>
      {isAuthenticated && (
        <Pressable onPress={() => router.push("/orders" as never)} style={styles.trackingLink}>
          <ThemedText type="default">My Orders</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            View your order history and track deliveries
          </ThemedText>
        </Pressable>
      )}
      <Pressable onPress={() => router.push("/order/lookup" as never)} style={styles.trackingLink}>
        <ThemedText type="default">Track an Order</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Look up guest orders by email or token
        </ThemedText>
      </Pressable>

      {/* Legal */}
      <ThemedText type="default" style={styles.sectionHeader}>
        Legal
      </ThemedText>
      <Pressable onPress={() => router.push("/legal/privacy" as never)} style={styles.trackingLink}>
        <ThemedText type="default">Privacy Policy</ThemedText>
      </Pressable>
      <Pressable onPress={() => router.push("/legal/terms" as never)} style={styles.trackingLink}>
        <ThemedText type="default">Terms of Service</ThemedText>
      </Pressable>
      <Pressable onPress={() => router.push("/legal/cookies" as never)} style={styles.trackingLink}>
        <ThemedText type="default">Cookie Policy</ThemedText>
      </Pressable>

      {!isAuthenticated ? (
        <ThemedText themeColor="textSecondary" style={styles.signInHint}>
          Sign in to access account settings.
        </ThemedText>
      ) : (
        <>
          <ThemedText type="small" themeColor="textSecondary" style={styles.email}>
            {email}
          </ThemedText>

          {/* Profile Info */}
          <ThemedText type="default" style={styles.sectionHeader}>
            Profile
          </ThemedText>
          <View style={styles.fieldGroup}>
            <ThemedText type="small" style={styles.label}>
              Display Name
            </ThemedText>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="How you'd like to be called"
              placeholderTextColor={colors.stone}
              maxLength={100}
            />
          </View>
          <View style={styles.fieldGroup}>
            <ThemedText type="small" style={styles.label}>
              Avatar URL
            </ThemedText>
            <TextInput
              style={styles.input}
              value={avatarUrl}
              onChangeText={setAvatarUrl}
              placeholder="https://example.com/avatar.jpg"
              placeholderTextColor={colors.stone}
              autoCapitalize="none"
              keyboardType="url"
            />
          </View>
          <Pressable
            style={[styles.button, isSaving && styles.buttonDisabled]}
            onPress={handleSaveProfile}
            disabled={isSaving}
          >
            <ThemedText type="default" style={styles.buttonText}>
              {isSaving ? "Saving..." : "Save Profile"}
            </ThemedText>
          </Pressable>

          {/* Preferences */}
          <ThemedText type="default" style={styles.sectionHeader}>
            Preferences
          </ThemedText>
          <View style={styles.fieldGroup}>
            <ThemedText type="small" style={styles.label}>
              Theme
            </ThemedText>
            <View style={styles.themeRow}>
              {(["light", "dark", "system"] as const).map((option) => (
                <Pressable
                  key={option}
                  style={[styles.themeOption, theme === option && styles.themeOptionActive]}
                  onPress={() => setTheme(option)}
                >
                  <ThemedText
                    type="small"
                    style={theme === option ? styles.themeOptionTextActive : undefined}
                  >
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Notifications */}
          <ThemedText type="default" style={styles.sectionHeader}>
            Notifications
          </ThemedText>
          <Pressable
            onPress={() => router.push("/settings/notifications" as never)}
            style={styles.trackingLink}
          >
            <ThemedText type="default">Notification Preferences</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Manage push notification settings
            </ThemedText>
          </Pressable>

          {/* Security */}
          <ThemedText type="default" style={styles.sectionHeader}>
            Security
          </ThemedText>
          <BiometricToggle />

          {/* Password Change */}
          {passwordStep === "success" ? (
            <View style={styles.passwordSection}>
              <ThemedText type="default" style={{ color: colors.success }}>
                Password changed successfully.
              </ThemedText>
            </View>
          ) : passwordStep === "otp-sent" ? (
            <View style={styles.passwordSection}>
              <ThemedText
                type="small"
                themeColor="textSecondary"
                style={{ marginBottom: Spacing.two }}
              >
                We sent a 6-digit code to {email}.
              </ThemedText>
              {passwordError ? (
                <ThemedText type="small" style={{ color: colors.error, marginBottom: Spacing.two }}>
                  {passwordError}
                </ThemedText>
              ) : null}
              <View style={styles.fieldGroup}>
                <ThemedText type="small" style={styles.label}>
                  Verification Code
                </ThemedText>
                <TextInput
                  style={styles.input}
                  value={otp}
                  onChangeText={(t) => setOtp(t.replace(/\D/g, ""))}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                />
              </View>
              <View style={styles.fieldGroup}>
                <ThemedText type="small" style={styles.label}>
                  New Password
                </ThemedText>
                <TextInput
                  style={styles.input}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                />
              </View>
              <View style={styles.fieldGroup}>
                <ThemedText type="small" style={styles.label}>
                  Confirm Password
                </ThemedText>
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                />
              </View>
              <Pressable
                style={[styles.button, isChangingPassword && styles.buttonDisabled]}
                onPress={handleCompleteReset}
                disabled={isChangingPassword}
              >
                <ThemedText type="default" style={styles.buttonText}>
                  {isChangingPassword ? "Changing..." : "Change Password"}
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => {
                  setPasswordStep("idle");
                  setPasswordError("");
                }}
                style={styles.cancelBtn}
              >
                <ThemedText type="small" themeColor="textSecondary">
                  Cancel
                </ThemedText>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={[styles.button, isChangingPassword && styles.buttonDisabled]}
              onPress={handleRequestReset}
              disabled={isChangingPassword}
            >
              <ThemedText type="default" style={styles.buttonText}>
                {isChangingPassword ? "Sending..." : "Change Password"}
              </ThemedText>
            </Pressable>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.four, paddingTop: Spacing.six, paddingBottom: Spacing.six },
  title: { marginBottom: Spacing.two },
  email: { marginBottom: Spacing.four },
  sectionHeader: { fontWeight: "600", marginBottom: Spacing.two, marginTop: Spacing.three },
  trackingLink: {
    padding: Spacing.three,
    borderRadius: 8,
    backgroundColor: colors.linen,
    marginBottom: Spacing.two,
  },
  signInHint: { marginTop: Spacing.three },
  fieldGroup: { marginBottom: Spacing.three },
  label: { fontWeight: "500", marginBottom: Spacing.one },
  input: {
    borderWidth: 1,
    borderColor: colors.stone,
    borderRadius: 8,
    padding: Spacing.three,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.ivory,
  },
  button: {
    backgroundColor: colors.gold,
    borderRadius: 8,
    padding: Spacing.three,
    alignItems: "center",
    marginTop: Spacing.two,
    marginBottom: Spacing.two,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.ivory, fontWeight: "600" },
  cancelBtn: { padding: Spacing.two, alignItems: "center", marginTop: Spacing.one },
  passwordSection: { marginTop: Spacing.two },
  themeRow: { flexDirection: "row", gap: Spacing.two },
  themeOption: {
    flex: 1,
    paddingVertical: Spacing.two,
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.stone,
    backgroundColor: colors.ivory,
  },
  themeOptionActive: { borderColor: colors.gold, backgroundColor: colors.linen },
  themeOptionTextActive: { color: colors.gold, fontWeight: "600" },
});
