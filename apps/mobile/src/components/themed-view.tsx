import { View, type ViewProps } from "react-native";

import { ThemeColor } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import AmbientGradient from "./AmbientGradient";

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  type?: ThemeColor;
  /** When true, renders the ambient gradient background (mirrors web body). */
  ambient?: boolean;
};

export function ThemedView({
  style,
  lightColor: _lightColor,
  darkColor: _darkColor,
  type,
  ambient = false,
  ...otherProps
}: ThemedViewProps) {
  const theme = useTheme();

  // When ambient is true, render the warm gradient background like web's body
  if (ambient) {
    return (
      <View style={[{ flex: 1 }, style]} {...otherProps}>
        <AmbientGradient />
        <View style={{ flex: 1 }} pointerEvents="box-none">
          {otherProps.children}
        </View>
      </View>
    );
  }

  return <View style={[{ backgroundColor: theme[type ?? "background"] }, style]} {...otherProps} />;
}
