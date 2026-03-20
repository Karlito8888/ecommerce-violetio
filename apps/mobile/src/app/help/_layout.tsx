import { Stack } from "expo-router";
import React from "react";

/**
 * Stack navigator layout for the help directory.
 * Help screens are navigated to from profile/settings or deep links.
 */
export default function HelpLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Help Center" }} />
      <Stack.Screen name="contact" options={{ title: "Contact Us" }} />
    </Stack>
  );
}
