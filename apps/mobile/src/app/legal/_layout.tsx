import { Stack } from "expo-router";

/** Stack navigator layout for the legal pages section. */
export default function LegalLayout() {
  return (
    <Stack>
      <Stack.Screen name="[slug]" options={{ title: "Legal" }} />
    </Stack>
  );
}
