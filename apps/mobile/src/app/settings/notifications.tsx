/**
 * Notification preferences screen (Story 6.7).
 *
 * Migrated from Supabase (TanStack Query + @ecommerce/shared hooks) to
 * Convex queries/mutations (Phase 4 audit fix).
 *
 * Uses Convex useQuery/useMutation directly — reactive by default.
 * No more Supabase client dependency.
 */

import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Switch, View, Pressable, Linking, Platform } from "react-native";
import Constants from "expo-constants";
import { useQuery, useMutation } from "convex/react";
import { api } from "#convex/_generated/api";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { colors } from "@ecommerce/ui";

// expo-notifications Android push support was removed from Expo Go in SDK 53.
const IS_EXPO_GO = Constants.appOwnership === "expo";

const Notifications: typeof import("expo-notifications") | null = IS_EXPO_GO
  ? null
  : (() => {
      try {
        return require("expo-notifications");
      } catch {
        return null;
      }
    })();

interface PreferenceRowProps {
  label: string;
  description: string;
  value: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
}

function PreferenceRow({ label, description, value, onToggle, disabled }: PreferenceRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <ThemedText type="default">{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {description}
        </ThemedText>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        disabled={disabled}
        trackColor={{ false: colors.stone, true: colors.gold }}
      />
    </View>
  );
}

type NotificationType = "order_updates" | "price_drops" | "back_in_stock" | "marketing";

const PREFERENCE_CONFIG: Array<{
  type: NotificationType;
  label: string;
  description: string;
  defaultEnabled: boolean;
}> = [
  {
    type: "order_updates",
    label: "Order Updates",
    description: "Shipping, delivery, and refund notifications",
    defaultEnabled: true,
  },
  {
    type: "price_drops",
    label: "Price Drops",
    description: "When a wishlisted item goes on sale",
    defaultEnabled: true,
  },
  {
    type: "back_in_stock",
    label: "Back in Stock",
    description: "When a wishlisted item becomes available",
    defaultEnabled: true,
  },
  {
    type: "marketing",
    label: "Marketing",
    description: "Promotions and special offers",
    defaultEnabled: false,
  },
];

/** Default preferences — matches the Supabase defaults model. */
const DEFAULT_PREFERENCES: Record<NotificationType, boolean> = {
  order_updates: true,
  price_drops: true,
  back_in_stock: true,
  marketing: false,
};

export default function NotificationPreferencesScreen() {
  const { userId: authUserId } = useAuth();
  const userId = authUserId ?? undefined;

  // Convex query — reactive preferences (sparse DB rows)
  const preferencesRows = useQuery(
    api.notifications.queries.getNotificationPreferences,
    userId ? { userId } : "skip",
  );

  // Convex mutation — upsert preference
  const upsertPreference = useMutation(api.notifications.mutations.upsertNotificationPreference);

  // Merge sparse DB rows with defaults
  const preferences: Record<NotificationType, boolean> = preferencesRows
    ? (() => {
        const merged = { ...DEFAULT_PREFERENCES };
        for (const row of preferencesRows) {
          merged[row.notificationType as NotificationType] = row.enabled;
        }
        return merged;
      })()
    : DEFAULT_PREFERENCES;

  const isLoading = preferencesRows === undefined;
  const isError = preferencesRows === null;

  const [permissionStatus, setPermissionStatus] = useState<string>("undetermined");

  useEffect(() => {
    if (!Notifications) return;
    Notifications.getPermissionsAsync().then(({ status }) => {
      setPermissionStatus(status);
    });
  }, []);

  function handleToggle(type: NotificationType, enabled: boolean) {
    if (!userId) return;
    upsertPreference({ userId, notificationType: type, enabled });
  }

  function openSystemSettings() {
    if (Platform.OS === "ios") {
      Linking.openURL("app-settings:");
    } else {
      Linking.openSettings();
    }
  }

  if (!userId) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <ThemedText themeColor="textSecondary">
          Sign in to manage notification preferences.
        </ThemedText>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Push permission status */}
      <View style={styles.permissionCard}>
        <ThemedText type="default" style={styles.permissionLabel}>
          Push Notifications
        </ThemedText>
        {permissionStatus === "granted" ? (
          <ThemedText type="small" style={styles.permissionGranted}>
            Enabled
          </ThemedText>
        ) : (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              {permissionStatus === "denied"
                ? "Push notifications are disabled. Enable them in your device settings."
                : "Push notifications have not been enabled yet."}
            </ThemedText>
            <Pressable style={styles.settingsButton} onPress={openSystemSettings}>
              <ThemedText type="small" style={styles.settingsButtonText}>
                Open Settings
              </ThemedText>
            </Pressable>
          </>
        )}
      </View>

      {/* Preference toggles */}
      <ThemedText type="default" style={styles.sectionHeader}>
        Notification Types
      </ThemedText>

      {isLoading ? (
        <ThemedText themeColor="textSecondary">Loading preferences...</ThemedText>
      ) : isError ? (
        <View>
          <ThemedText themeColor="textSecondary">Failed to load preferences.</ThemedText>
        </View>
      ) : (
        PREFERENCE_CONFIG.map((config) => (
          <PreferenceRow
            key={config.type}
            label={config.label}
            description={config.description}
            value={preferences[config.type]}
            onToggle={(enabled) => handleToggle(config.type, enabled)}
            disabled={permissionStatus !== "granted"}
          />
        ))
      )}

      {permissionStatus !== "granted" && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.disabledHint}>
          Enable push notifications in your device settings to toggle these preferences.
        </ThemedText>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.six,
  },
  permissionCard: {
    padding: Spacing.three,
    borderRadius: 8,
    backgroundColor: colors.linen,
    marginBottom: Spacing.four,
  },
  permissionLabel: {
    fontWeight: "600",
    marginBottom: Spacing.one,
  },
  permissionGranted: {
    color: "#16a34a",
    fontWeight: "500",
  },
  settingsButton: {
    marginTop: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 8,
    backgroundColor: colors.gold,
    alignSelf: "flex-start",
  },
  settingsButtonText: {
    color: colors.ivory,
    fontWeight: "600",
  },
  sectionHeader: {
    fontWeight: "600",
    marginBottom: Spacing.two,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.stone,
  },
  rowText: {
    flex: 1,
    marginRight: Spacing.three,
  },
  disabledHint: {
    marginTop: Spacing.three,
    fontStyle: "italic",
  },
});
