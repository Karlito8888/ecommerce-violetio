/**
 * use-color-scheme.ts — Native implementation.
 *
 * Returns the effective color scheme from our custom ThemeProvider.
 * Falls back to the system preference if no ThemeProvider is present.
 */
import { useColorScheme as useRNColorScheme } from "react-native";

import { ColorSchemeContext } from "./use-color-scheme-context";

import { useContext } from "react";

export function useColorScheme() {
  // Try custom context first (supports user preference + persistence)
  const contextScheme = useContext(ColorSchemeContext);
  const systemScheme = useRNColorScheme();

  // If the context provides a non-null value, use it; otherwise fall back to system
  if (contextScheme) {
    return contextScheme;
  }

  return systemScheme ?? "light";
}
