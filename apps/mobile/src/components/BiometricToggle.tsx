import React, { useState } from "react";
import { Alert, StyleSheet, Switch, View } from "react-native";

import { Spacing } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { getBiometricLabel } from "@/utils/biometricLabel";
import { ThemedText } from "./themed-text";

export function BiometricToggle() {
  const { biometricStatus, biometricEnabled, enableBiometric, disableBiometric } = useAuth();
  const [isToggling, setIsToggling] = useState(false);

  if (!biometricStatus) return null;

  const label = getBiometricLabel(biometricStatus.supportedTypes);
  const isAvailable = biometricStatus.isAvailable && biometricStatus.isEnrolled;

  const handleToggle = async (value: boolean) => {
    if (isToggling) return;
    setIsToggling(true);

    if (value) {
      try {
        const result = await enableBiometric();
        if (!result.success) {
          Alert.alert(
            "Could not enable biometric",
            result.error === "BIOMETRIC.NOT_ENROLLED"
              ? "No biometric data found on this device. Please set up Face ID or fingerprint in your device settings."
              : result.error === "BIOMETRIC.NOT_AVAILABLE"
                ? "Biometric authentication is not available on this device."
                : "An error occurred. Please try again.",
          );
        }
      } finally {
        setIsToggling(false);
      }
    } else {
      Alert.alert("Disable biometric login?", "You will need your password to log in.", [
        { text: "Cancel", style: "cancel", onPress: () => setIsToggling(false) },
        {
          text: "Disable",
          style: "destructive",
          onPress: async () => {
            try {
              await disableBiometric();
            } finally {
              setIsToggling(false);
            }
          },
        },
      ]);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.labelContainer}>
          <ThemedText type="default">{label}</ThemedText>
          {!isAvailable && (
            <ThemedText type="small" themeColor="textSecondary">
              {!biometricStatus.isAvailable
                ? "Not available on this device"
                : "No biometric data enrolled"}
            </ThemedText>
          )}
        </View>
        <Switch
          value={biometricEnabled}
          onValueChange={handleToggle}
          disabled={!isAvailable || isToggling}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  labelContainer: {
    flex: 1,
    marginRight: Spacing.three,
  },
});
