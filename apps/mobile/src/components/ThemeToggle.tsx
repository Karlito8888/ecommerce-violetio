/**
 * ThemeToggle — Mobile light/dark toggle using Ionicons.
 *
 * Toggles between light and dark only (no auto mode).
 * Uses ThemePreferenceProvider for persistence via SecureStore.
 *
 * Design mirrors the web .theme-toggle pill button:
 * - Round-full border-radius
 * - --border-accent style border
 * - --surface-chip style background
 */
import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/hooks/use-theme";
import { useThemePreference } from "@/hooks/use-theme-preference";

export default function ThemeToggle() {
  const theme = useTheme();
  const { mode, cycleMode } = useThemePreference();

  const isDark = mode === "dark";

  return (
    <Pressable
      onPress={cycleMode}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: theme.surfaceCard,
          borderColor: theme.accent,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
      accessibilityLabel={`Theme: ${isDark ? "dark" : "light"}. Tap to switch.`}
      accessibilityRole="button"
    >
      <Ionicons name={isDark ? "moon" : "sunny"} size={20} color={theme.accent} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
