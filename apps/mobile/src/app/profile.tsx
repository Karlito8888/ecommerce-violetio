import React from "react";
import { ScrollView, StyleSheet, Pressable } from "react-native";
import { router } from "expo-router";

import { BiometricToggle } from "@/components/BiometricToggle";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { colors } from "@ecommerce/ui";

export default function ProfileScreen() {
  const { user, isAnonymous } = useAuth();

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

      {isAnonymous ? (
        <ThemedText themeColor="textSecondary" style={styles.signInHint}>
          Sign in to access account settings.
        </ThemedText>
      ) : (
        <>
          <ThemedText type="small" themeColor="textSecondary" style={styles.email}>
            {user?.email}
          </ThemedText>

          <ThemedText type="default" style={styles.sectionHeader}>
            Security
          </ThemedText>
          <BiometricToggle />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.four,
    paddingTop: Spacing.six,
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
});
