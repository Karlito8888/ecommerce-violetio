import React from "react";
import { Platform, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export default function ExploreScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };
  const theme = useTheme();

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    web: {
      paddingTop: Spacing.six,
      paddingBottom: Spacing.four,
    },
  });

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}
    >
      <ThemedView ambient style={styles.container}>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.kicker}>
            Our Story
          </ThemedText>
          <ThemedText type="subtitle">Curated shopping, powered by people and AI.</ThemedText>
        </ThemedView>

        <ThemedView style={styles.bodyContainer}>
          <ThemedText style={styles.bodyText} themeColor="textSecondary">
            Maison Émile brings together handpicked merchants who share our commitment to quality
            and authenticity. Every product in our catalog has been curated — not by algorithms
            alone, but by people who care about what they recommend.
          </ThemedText>
          <ThemedText style={styles.bodyText} themeColor="textSecondary">
            Powered by AI-driven search and a seamless multi-merchant checkout, we make it
            effortless to discover and purchase from the best independent sellers — all in one
            place, with full buyer protection on every order.
          </ThemedText>
        </ThemedView>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexDirection: "row",
    justifyContent: "center",
  },
  container: {
    maxWidth: MaxContentWidth,
    flexGrow: 1,
  },
  titleContainer: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.six,
  },
  kicker: {
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontWeight: "600",
  },
  bodyContainer: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  bodyText: {
    fontSize: 16,
    lineHeight: 28,
  },
});
