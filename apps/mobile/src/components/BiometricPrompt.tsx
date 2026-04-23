import React, { useState } from "react";
import { StyleSheet, View, Pressable, Alert } from "react-native";

import { BiometricType } from "@ecommerce/shared";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/context/AuthContext";
import { getBiometricLabel } from "@/utils/biometricLabel";
import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";

interface BiometricPromptProps {
  onFallbackToPassword: () => void;
}

function getBiometricIcon(supportedTypes: number[]): string {
  if (supportedTypes.includes(BiometricType.FACIAL_RECOGNITION)) return "🔐";
  if (supportedTypes.includes(BiometricType.FINGERPRINT)) return "👆";
  return "🔒";
}

export function BiometricPrompt({ onFallbackToPassword }: BiometricPromptProps) {
  const { biometricStatus, attemptBiometricLogin } = useAuth();
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const theme = useTheme();

  const label = getBiometricLabel(biometricStatus?.supportedTypes ?? []);
  const icon = getBiometricIcon(biometricStatus?.supportedTypes ?? []);

  const handleBiometricLogin = async () => {
    if (isAuthenticating) return;
    setIsAuthenticating(true);

    try {
      const result = await attemptBiometricLogin();

      if (result.success) return; // Auth state change will navigate automatically

      if (result.fallbackToPassword) {
        Alert.alert("Biometric failed", "Please use your password to log in.", [
          { text: "OK", onPress: onFallbackToPassword },
        ]);
        return;
      }

      if (result.attemptsRemaining !== undefined) {
        setAttemptsRemaining(result.attemptsRemaining);
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.iconContainer}>
        <ThemedText style={styles.icon}>{icon}</ThemedText>
      </View>

      <ThemedText type="subtitle" style={styles.title}>
        Welcome back
      </ThemedText>

      <Pressable
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: theme.accent },
          pressed && styles.buttonPressed,
        ]}
        onPress={handleBiometricLogin}
        disabled={isAuthenticating}
      >
        <ThemedText style={[styles.buttonText, { color: theme.textInverse }]}>
          {isAuthenticating ? "Authenticating..." : `Use ${label}`}
        </ThemedText>
      </Pressable>

      {attemptsRemaining < 3 && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.attemptsText}>
          {attemptsRemaining} attempt{attemptsRemaining !== 1 ? "s" : ""} remaining
        </ThemedText>
      )}

      <Pressable onPress={onFallbackToPassword} style={styles.fallbackLink}>
        <ThemedText type="linkPrimary">Use Password Instead</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.four,
  },
  iconContainer: {
    marginBottom: Spacing.four,
  },
  icon: {
    fontSize: 64,
  },
  title: {
    marginBottom: Spacing.five,
    textAlign: "center",
  },
  button: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: 12,
    minWidth: 200,
    alignItems: "center",
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  attemptsText: {
    marginTop: Spacing.three,
  },
  fallbackLink: {
    marginTop: Spacing.four,
    padding: Spacing.two,
  },
});
