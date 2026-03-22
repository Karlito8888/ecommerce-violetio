import { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, useWindowDimensions } from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { WebView } from "react-native-webview";
import Constants from "expo-constants";

/** Human-readable titles for header. */
const LEGAL_TITLES: Record<string, string> = {
  privacy: "Privacy Policy",
  terms: "Terms of Service",
  cookies: "Cookie Policy",
};

const SITE_URL =
  Constants.expoConfig?.extra?.siteUrl ??
  process.env.EXPO_PUBLIC_SITE_URL ??
  "http://localhost:3000";

/** Injected after page load to hide the web shell (header, footer, cookie banner). */
const HIDE_SHELL_JS = `
  (function() {
    var selectors = ['.site-header', '.site-footer', '.cookie-consent', '.app-banner'];
    selectors.forEach(function(sel) {
      var el = document.querySelector(sel);
      if (el) el.style.display = 'none';
    });
    var main = document.getElementById('main-content');
    if (main) main.style.paddingTop = '0';
    true;
  })();
`;

/**
 * Legal page screen — renders the web legal page in a WebView.
 *
 * Using WebView ensures content parity with web and avoids adding
 * a markdown rendering library to the mobile bundle. Injected JS
 * hides the web header/footer so only the legal content area is shown.
 */
export default function LegalPageScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const title = LEGAL_TITLES[slug ?? ""] ?? "Legal";
  const { height } = useWindowDimensions();
  const [loading, setLoading] = useState(true);

  const uri = `${SITE_URL}/legal/${slug}`;

  return (
    <>
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={styles.container} style={styles.scroll}>
        {loading && <ActivityIndicator size="large" style={styles.loader} />}
        <WebView
          source={{ uri }}
          style={[styles.webview, { minHeight: height * 0.8 }]}
          onLoadEnd={() => setLoading(false)}
          injectedJavaScript={HIDE_SHELL_JS}
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
          originWhitelist={[SITE_URL, "http://localhost:3000"]}
        />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: "#fff",
  },
  container: {
    flexGrow: 1,
  },
  loader: {
    marginTop: 40,
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
});
