import { Stack } from "expo-router";

/** Settings stack navigator (Story 6.7). */
export default function SettingsLayout() {
  return (
    <Stack>
      <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
    </Stack>
  );
}
