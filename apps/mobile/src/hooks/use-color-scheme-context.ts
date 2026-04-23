/**
 * Context for the resolved color scheme ("light" | "dark").
 * Provided by ThemeProvider in _layout.tsx.
 */
import { createContext } from "react";

export const ColorSchemeContext = createContext<"light" | "dark" | null>(null);
