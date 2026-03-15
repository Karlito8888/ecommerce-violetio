import { Stack } from "expo-router";
import React from "react";

/**
 * Stack navigator layout for the order directory.
 *
 * Required by Expo Router to enable Stack navigation for order sub-routes
 * (e.g., `[orderId]/confirmation.tsx`). Without this layout, child routes
 * that use `<Stack.Screen>` to configure headers would have no parent.
 *
 * @see https://docs.expo.dev/router/layouts/stack/
 */
export default function OrderLayout() {
  return <Stack />;
}
