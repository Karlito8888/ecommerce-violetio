import { Stack } from "expo-router";
import React from "react";

/**
 * Stack navigator layout for the `/order` directory.
 *
 * ## Purpose
 * Required by Expo Router to enable Stack navigation for all order sub-routes.
 * Without this layout file, child routes that call `<Stack.Screen>` to configure
 * header options (title, back button visibility) would have no parent navigator.
 *
 * ## Navigation tree
 * ```
 * /order
 *   ├── /order/[orderId]/confirmation  — Post-checkout confirmation screen
 *   └── /order/lookup                  — Guest order lookup (email OTP or token)
 * ```
 *
 * ## How users reach these screens
 * - **confirmation**: Redirected here after successful checkout payment (from `/checkout`).
 *   The `orderId` param and optional `token` (guest tracking) are passed by the checkout flow.
 * - **lookup**: Navigated from the Profile/Settings screen ("Track an Order" link).
 *   Can also be deep-linked with a `?token=...` query param from the confirmation screen's
 *   "copy tracking link" feature.
 *
 * ## Deep linking
 * Expo Router's file-based routing automatically supports deep links matching the path
 * structure. Ensure the app's linking configuration (in `app.json` or `expo-router` config)
 * includes the `order` prefix so that URLs like `myapp://order/123/confirmation` resolve.
 *
 * ## Missing screens (known gaps)
 * - No `/order/[orderId]/index.tsx` (order detail/tracking screen for authenticated users)
 * - No `/order/index.tsx` (order list for authenticated users — web has `/account/orders`)
 * These are planned for future sprints. Currently, authenticated order history is only
 * available on web via `/account/orders`.
 *
 * @see https://docs.expo.dev/router/layouts/stack/
 * @see {@link file://apps/mobile/src/app/order/[orderId]/confirmation.tsx} — child route
 * @see {@link file://apps/mobile/src/app/order/lookup.tsx} — child route
 * @see {@link file://apps/mobile/src/app/profile.tsx} — entry point for lookup navigation
 */
export default function OrderLayout() {
  return <Stack />;
}
