/**
 * use-theme.ts — Hook returning the full theme object for the current scheme.
 *
 * Resolves the active color scheme (user preference > system),
 * then returns Colors.light or Colors.dark — matching web's
 * [data-theme="light"] / [data-theme="dark"] exactly.
 */
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export function useTheme() {
  const scheme = useColorScheme();
  return scheme === "dark" ? Colors.dark : Colors.light;
}

/** Convenience alias — same return type as useTheme() for type annotations */
export type AppTheme = ReturnType<typeof useTheme>;
