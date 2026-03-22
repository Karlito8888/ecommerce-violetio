import React, { useState, useEffect, useCallback } from "react";
import { ScrollView, StyleSheet, Pressable, TextInput, Alert, View } from "react-native";
import { router } from "expo-router";

import { BiometricToggle } from "@/components/BiometricToggle";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { colors } from "@ecommerce/ui";
import {
  getProfile,
  updateProfile,
  updateProfileSchema,
  createSupabaseClient,
} from "@ecommerce/shared";
import type { UserProfile } from "@ecommerce/shared";

export default function ProfileScreen() {
  const { user, isAnonymous } = useAuth();

  const [_profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [isSaving, setIsSaving] = useState(false);
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user?.id || isAnonymous) return;
    try {
      const data = await getProfile(user.id);
      if (data) {
        setProfile(data);
        setDisplayName(data.display_name ?? "");
        setAvatarUrl(data.avatar_url ?? "");
        setTheme(data.preferences?.theme ?? "system");
      }
    } catch {
      // Profile may not exist yet — trigger auto-creates it
    }
  }, [user?.id, isAnonymous]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  async function handleSaveProfile() {
    if (!user?.id) return;

    const parsed = updateProfileSchema.safeParse({
      display_name: displayName || null,
      avatar_url: avatarUrl || null,
      preferences: { theme },
    });
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("\n");
      Alert.alert("Validation Error", msg);
      return;
    }

    setIsSaving(true);
    try {
      const updated = await updateProfile(user.id, parsed.data);
      setProfile(updated);
      Alert.alert("Success", "Profile updated.");
    } catch {
      Alert.alert("Error", "Failed to update profile.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleChangePassword() {
    if (newPassword.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match.");
      return;
    }
    setIsChangingPassword(true);
    try {
      const supabase = createSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        Alert.alert("Error", error.message);
        return;
      }
      Alert.alert("Success", "Password changed successfully.");
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordSection(false);
    } catch {
      Alert.alert("Error", "An unexpected error occurred.");
    } finally {
      setIsChangingPassword(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="subtitle" style={styles.title}>
        Settings
      </ThemedText>

      {/* Order Tracking — visible to ALL users (anonymous + authenticated) */}
      <ThemedText type="default" style={styles.sectionHeader}>
        Order Tracking
      </ThemedText>
      <Pressable onPress={() => router.push("/order/lookup" as never)} style={styles.trackingLink}>
        <ThemedText type="default">Track an Order</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Look up guest orders by email or token
        </ThemedText>
      </Pressable>

      {/* ── Legal (visible to all users) ── */}
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

      {isAnonymous ? (
        <ThemedText themeColor="textSecondary" style={styles.signInHint}>
          Sign in to access account settings.
        </ThemedText>
      ) : (
        <>
          <ThemedText type="small" themeColor="textSecondary" style={styles.email}>
            {user?.email}
          </ThemedText>

          {/* ── Profile Info ── */}
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

          {/* ── Preferences ── */}
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

          {/* ── Notifications ── */}
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

          {/* ── Security ── */}
          <ThemedText type="default" style={styles.sectionHeader}>
            Security
          </ThemedText>
          <BiometricToggle />

          <Pressable
            style={styles.passwordToggle}
            onPress={() => setShowPasswordSection(!showPasswordSection)}
          >
            <ThemedText type="default">
              {showPasswordSection ? "Cancel Password Change" : "Change Password"}
            </ThemedText>
          </Pressable>

          {showPasswordSection && (
            <View style={styles.passwordSection}>
              <View style={styles.fieldGroup}>
                <ThemedText type="small" style={styles.label}>
                  New Password
                </ThemedText>
                <TextInput
                  style={styles.input}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="At least 6 characters"
                  placeholderTextColor={colors.stone}
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
                  placeholder="Confirm new password"
                  placeholderTextColor={colors.stone}
                  secureTextEntry
                />
              </View>

              <Pressable
                style={[styles.button, isChangingPassword && styles.buttonDisabled]}
                onPress={handleChangePassword}
                disabled={isChangingPassword}
              >
                <ThemedText type="default" style={styles.buttonText}>
                  {isChangingPassword ? "Changing..." : "Change Password"}
                </ThemedText>
              </Pressable>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.four,
    paddingTop: Spacing.six,
    paddingBottom: Spacing.six,
  },
  title: {
    marginBottom: Spacing.two,
  },
  email: {
    marginBottom: Spacing.four,
  },
  sectionHeader: {
    fontWeight: "600",
    marginBottom: Spacing.two,
    marginTop: Spacing.three,
  },
  trackingLink: {
    padding: Spacing.three,
    borderRadius: 8,
    backgroundColor: colors.linen,
    marginBottom: Spacing.two,
  },
  signInHint: {
    marginTop: Spacing.three,
  },
  fieldGroup: {
    marginBottom: Spacing.three,
  },
  label: {
    fontWeight: "500",
    marginBottom: Spacing.one,
  },
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
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.ivory,
    fontWeight: "600",
  },
  passwordToggle: {
    padding: Spacing.three,
    borderRadius: 8,
    backgroundColor: colors.linen,
    marginTop: Spacing.two,
  },
  passwordSection: {
    marginTop: Spacing.two,
  },
  themeRow: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  themeOption: {
    flex: 1,
    paddingVertical: Spacing.two,
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.stone,
    backgroundColor: colors.ivory,
  },
  themeOptionActive: {
    borderColor: colors.gold,
    backgroundColor: colors.linen,
  },
  themeOptionTextActive: {
    color: colors.gold,
    fontWeight: "600",
  },
});
