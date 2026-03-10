import React from "react";
import { ScrollView, StyleSheet } from "react-native";

import { BiometricToggle } from "@/components/BiometricToggle";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";

export default function ProfileScreen() {
  const { user, isAnonymous } = useAuth();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="subtitle" style={styles.title}>
        Settings
      </ThemedText>

      {isAnonymous ? (
        <ThemedText themeColor="textSecondary">Sign in to access settings.</ThemedText>
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
});
