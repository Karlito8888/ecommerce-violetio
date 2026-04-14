import { readFileSync } from "fs";
import { resolve } from "path";
import { ExpoConfig, ConfigContext } from "expo/config";

/**
 * Load environment variables from the monorepo root .env.local file.
 * Expo CLI does not automatically load .env files from parent directories,
 * so we parse the root .env.local manually for local development.
 */
function loadRootEnv(): void {
  try {
    const envPath = resolve(__dirname, "../../.env.local");
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local may not exist (CI, production) — that's fine
  }
}

loadRootEnv();

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "mobile",
  slug: "mobile",
  version: "1.0.0",
  sdkVersion: "55.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "mobile",
  userInterfaceStyle: "automatic",
  ios: {
    icon: "./assets/expo.icon",
    bundleIdentifier: "com.maisonemile.app",
    associatedDomains: ["applinks:www.maisonemile.com"],
  },
  android: {
    package: "com.maisonemile.app",
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: "https",
            host: "www.maisonemile.com",
            pathPrefix: "/products",
          },
          {
            scheme: "https",
            host: "www.maisonemile.com",
            pathPrefix: "/order",
          },
          {
            scheme: "https",
            host: "www.maisonemile.com",
            pathPrefix: "/account",
          },
          {
            scheme: "https",
            host: "www.maisonemile.com",
            pathPrefix: "/search",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    output: "static" as const,
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-notifications",
    "expo-localization",
    // Required for native Stripe SDK linking during expo prebuild / EAS Build.
    // merchantIdentifier = your Apple Merchant ID (from Apple Developer portal).
    // Required for Apple Pay on iOS. Leave empty for Android / card-only flows.
    // Set EXPO_PUBLIC_APPLE_MERCHANT_ID env var for production.
    // @see https://docs.violet.io/prism/checkout-guides/guides/violet-checkout-with-apple-pay
    [
      "@stripe/stripe-react-native",
      { merchantIdentifier: process.env.EXPO_PUBLIC_APPLE_MERCHANT_ID ?? "" },
    ],
    [
      "expo-local-authentication",
      {
        faceIDPermission: "Allow $(PRODUCT_NAME) to use Face ID for quick login.",
      },
    ],
    [
      "expo-splash-screen",
      {
        backgroundColor: "#208AEF",
        android: {
          image: "./assets/images/splash-icon.png",
          imageWidth: 76,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    supabaseUrl: process.env.SUPABASE_URL ?? "http://localhost:54321",
    // Set via .env.local — empty in dev is OK, required for production
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? "",
    },
  },
});
