/**
 * **Web-only** share hook — Story 7.5 (Social Sharing & Rich Previews).
 *
 * Provides a unified `share()` function for **web** environments:
 * - **Web (HTTPS)**: Web Share API → clipboard fallback
 * - **Web (HTTP / unsupported)**: Clipboard API fallback
 * - **SSR**: No-op (returns "unsupported")
 *
 * ## Why this hook is NOT cross-platform (Story 7.5 code review decision)
 *
 * The original story tasks (1.3, 1.4) planned a truly cross-platform hook
 * that would import `Share` from `react-native` with runtime platform
 * detection. This was **intentionally NOT implemented** because:
 *
 * 1. **Build incompatibility**: `packages/shared` is consumed via direct TS
 *    source imports (`workspace:*`) by both `apps/web` and `apps/mobile`.
 *    Importing `react-native` here would cause the web bundler (Vite) to
 *    fail resolving the `react-native` module at build time.
 * 2. **No conditional imports in TS**: Unlike dynamic `import()`, static
 *    imports can't be conditionally skipped. Build-time tree-shaking can't
 *    help either since Vite doesn't know about RN's module system.
 * 3. **Pragmatic solution**: Mobile apps (`apps/mobile`) use React Native's
 *    `Share.share()` directly — which is the idiomatic RN approach. The
 *    shared types (`ShareData`, `ShareResult`) are still reusable.
 *
 * @see apps/mobile/src/components/product/ProductDetail.tsx — Direct RN Share usage
 * @see apps/mobile/src/app/content/[slug].tsx — Direct RN Share usage
 * @module
 */

/* ─── Types ──────────────────────────────────────────────────────────── */

export interface ShareData {
  title: string;
  text?: string;
  url: string;
}

export interface ShareResult {
  method: "native" | "clipboard" | "unsupported";
  success: boolean;
}

/* ─── Hook ───────────────────────────────────────────────────────────── */

/**
 * Returns `{ share, canNativeShare }`.
 *
 * - `canNativeShare` — `true` when the Web Share API (or RN Share) is available.
 * - `share(data)` — Attempts native share, falls back to clipboard, returns result.
 *
 * Safe to call during SSR — all browser API access is guarded.
 */
export function useShare() {
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const share = async (data: ShareData): Promise<ShareResult> => {
    // 1. Web Share API (requires HTTPS + user gesture)
    if (canNativeShare) {
      try {
        await navigator.share({
          title: data.title,
          text: data.text,
          url: data.url,
        });
        return { method: "native", success: true };
      } catch (err) {
        // User cancelled the share sheet — not an error
        if (err instanceof Error && err.name === "AbortError") {
          return { method: "native", success: false };
        }
        // Other errors (e.g. NotAllowedError) — fall through to clipboard
      }
    }

    // 2. Clipboard fallback
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(data.url);
        return { method: "clipboard", success: true };
      } catch {
        return { method: "unsupported", success: false };
      }
    }

    // 3. SSR or no API available
    return { method: "unsupported", success: false };
  };

  return { share, canNativeShare };
}
