import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import { ExpoConfig, ConfigContext } from "expo/config";
import { withDangerousMod } from "expo/config-plugins";

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

/**
 * Pin Gradle to 8.13 — the version required by AGP 8.12.0 (shipped with RN 0.83.6).
 *
 * RN 0.83.6's prebuild template generates Gradle 9.0, which is incompatible
 * with AGP 8.12.0 (JvmVendorSpec.IBM_SEMERU removed in Gradle 9.0).
 * Per Android official docs, AGP 8.12 requires Gradle >= 8.13.
 *
 * @see https://developer.android.com/build/releases/agp-8-12-0-release-notes
 * Remove this plugin once Expo/RN ships a Gradle 9.x-compatible AGP.
 */
const GRADLE_VERSION = "8.13";

const withPinnedGradle = (config: ExpoConfig) => {
  return withDangerousMod(config, [
    "android",
    async (c) => {
      const propsPath = join(
        c.modRequest.platformProjectRoot,
        "gradle",
        "wrapper",
        "gradle-wrapper.properties",
      );
      if (existsSync(propsPath)) {
        let contents = readFileSync(propsPath, "utf-8");
        contents = contents.replace(
          /distributionUrl=.*/,
          `distributionUrl=https\\://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip`,
        );
        writeFileSync(propsPath, contents);
      }
      return c;
    },
  ]);
};

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
    withPinnedGradle as unknown as string,
    "expo-router",
    "expo-secure-store",
    "expo-notifications",
    "expo-localization",
    "expo-font",
    "expo-image",
    "expo-web-browser",
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
    // Web backend URL consumed by apiClient.ts via Constants.expoConfig.extra.apiUrl.
    // Falls back to process.env.EXPO_PUBLIC_API_URL then "http://10.0.2.2:3000".
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:3000",
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? "",
    },
  },
});
