import { Stack } from "expo-router";
import React from "react";

/**
 * Stack navigator layout for the products directory.
 *
 * ## Why this file is required
 *
 * Expo Router uses file-based routing where each directory can define a `_layout.tsx`
 * to control the navigation structure for its children. Without this layout:
 *
 * 1. Child routes (e.g., `[productId].tsx`) that use `<Stack.Screen>` to configure
 *    their header have no parent Stack navigator to configure — the options are ignored.
 * 2. Expo Router may surface warnings about unmatched screen configurations.
 *
 * ## Navigation flow
 *
 * ```
 * AppTabs (root layout)
 *   └─ products/ (this Stack layout — hidden from tab bar via href: null)
 *       └─ [productId].tsx → Product detail screen (Stack push)
 * ```
 *
 * The `products` route group is registered in `app-tabs.tsx` with `href: null`
 * so it doesn't appear as a tab. Users navigate here via deep links or by
 * pressing a product card in the catalog.
 *
 * Background color is inherited from the root ThemeProvider — no per-layout setup needed.
 *
 * @see https://docs.expo.dev/router/layouts/stack/
 */
export default function ProductsLayout() {
  return <Stack />;
}
