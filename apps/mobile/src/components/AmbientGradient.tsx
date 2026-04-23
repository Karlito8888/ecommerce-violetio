/**
 * AmbientGradient — Reproduces the web body gradient on mobile.
 *
 * Web has a linear-gradient (sand→linen→ivory) on <body> (base.css).
 * This reproduces that vertical gradient using expo-linear-gradient.
 *
 * Light: subtle warm sand → linen → ivory (visible, warm feel).
 * Dark: warmer dark tones with a hint of gold at the top to reproduce
 * the combined effect of the web's linear gradient + radial gold accents,
 * since we can't render CSS radial-gradient on React Native.
 *
 * Automatically adapts to dark/light via useTheme().
 */
import { StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { useTheme } from "@/hooks/use-theme";

export default function AmbientGradient() {
  const theme = useTheme();
  const isDark = theme.background.startsWith("#2C");

  // Light: mirrors web body linear-gradient exactly
  // linear-gradient(180deg, color-mix(sand 68%, white), linen 44%, ivory 100%)
  const lightColors = ["rgba(232,228,223,0.68)", "#F0EEEB", "#FAFAF8"] as const;

  // Dark: web resolves to #3d3d3d→#333333→#2c2c2c which is invisible.
  // We add a subtle warm gold tint at the top to reproduce the combined
  // effect of the web linear gradient + the 3 radial gold accents that
  // would otherwise be invisible on mobile.
  const darkColors = ["#343434", "#303030", "#2C2C2C"] as const;

  return (
    <LinearGradient
      colors={isDark ? darkColors : lightColors}
      style={StyleSheet.absoluteFill}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      pointerEvents="none"
    />
  );
}
