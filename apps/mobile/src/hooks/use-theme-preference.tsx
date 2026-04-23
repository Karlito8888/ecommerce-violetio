/**
 * useThemePreference — manages user's theme mode (light/dark)
 * with persistence via expo-secure-store.
 *
 * Toggles between light and dark only (no auto mode).
 * Persists the choice so it survives app restarts.
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useColorScheme as useRNColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "theme";

interface ThemePreferenceValue {
  mode: ThemeMode;
  resolvedScheme: "light" | "dark";
  cycleMode: () => void;
}

export const ThemePreferenceContext = createContext<ThemePreferenceValue>({
  mode: "light",
  resolvedScheme: "light",
  cycleMode: () => {},
});

export function useThemePreference() {
  return useContext(ThemePreferenceContext);
}

export function ThemePreferenceProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("light");
  const systemScheme = useRNColorScheme();

  // Load persisted preference on mount, fall back to system preference
  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY).then((stored) => {
      if (stored === "light" || stored === "dark") {
        setModeState(stored);
      } else if (systemScheme === "dark") {
        setModeState("dark");
      }
    });
  }, [systemScheme]);

  const resolvedScheme: "light" | "dark" = mode;

  const cycleMode = useCallback(() => {
    setModeState((prev) => {
      const next: ThemeMode = prev === "light" ? "dark" : "light";
      SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  return (
    <ThemePreferenceContext.Provider value={{ mode, resolvedScheme, cycleMode }}>
      {children}
    </ThemePreferenceContext.Provider>
  );
}
