// convex/lib/violetApi.ts
//
// Violet API token management for Convex actions.
// Replaces supabase/functions/_shared/violetAuth.ts + fetchWithRetry.ts (Deno).
//
// In Convex actions, process.env is available and fetch() works natively.
// This module provides a VioletTokenManager that handles:
//   - Login (POST /login)
//   - Token refresh (GET /auth/token)
//   - Auto-refresh 5 minutes before expiry
//   - Retry on 429 + network errors with exponential backoff
//   - 401 retry with token invalidation
//
// Doc: https://docs.convex.dev/functions/actions — process.env + fetch in actions
// Doc: https://docs.violet.io/concepts/overview/token-refresh-management
//
// ⚠️ This runs inside Convex actions only (not queries/mutations).
// Each action invocation gets a fresh module scope — the token does NOT persist
// across invocations. This is fine because:
//   1. Actions are short-lived (single request)
//   2. We do a login per action invocation (cached within the action's multiple API calls)
//   3. The Violet token lasts 24 hours — sufficient for any single action

const TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 30_000;

function getApiBase(): string {
  return process.env.VIOLET_API_BASE ?? "https://sandbox-api.violet.io/v1";
}

function getAppHeaders(): Record<string, string> {
  return {
    "X-Violet-App-Id": process.env.VIOLET_APP_ID ?? "",
    "X-Violet-App-Secret": process.env.VIOLET_APP_SECRET ?? "",
    "Content-Type": "application/json",
  };
}

/**
 * Escape non-ASCII and special characters to Unicode escape sequences.
 * Workaround for Violet API bug: `!` and other special chars in passwords
 * cause a 500 when sent as literal characters, but work as `\uXXXX`.
 */
function escapePasswordForViolet(password: string): string {
  return password
    .split("")
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (
        (code >= 0x30 && code <= 0x39) || // 0-9
        (code >= 0x41 && code <= 0x5a) || // A-Z
        (code >= 0x61 && code <= 0x7a) // a-z
      ) {
        return ch;
      }
      return `\\u${code.toString(16).padStart(4, "0")}`;
    })
    .join("");
}

interface VioletTokenData {
  token: string;
  refreshToken: string;
  loginTimestamp: number;
}

/**
 * Login to Violet API and return token data.
 */
async function violetLogin(): Promise<VioletTokenData> {
  const username = process.env.VIOLET_USERNAME;
  const password = process.env.VIOLET_PASSWORD;
  if (!username || !password) {
    throw new Error("Missing VIOLET_USERNAME or VIOLET_PASSWORD env vars");
  }

  const escapedPassword = escapePasswordForViolet(password);
  const body = `{"username":"${username}","password":"${escapedPassword}"}`;

  const res = await fetch(`${getApiBase()}/login`, {
    method: "POST",
    headers: getAppHeaders(),
    body,
  });

  if (!res.ok) {
    throw new Error(`Violet login failed (${res.status})`);
  }

  const data = (await res.json()) as {
    token: string;
    refresh_token: string;
  };
  return {
    token: data.token,
    refreshToken: data.refresh_token,
    loginTimestamp: Date.now(),
  };
}

/**
 * Refresh a Violet token.
 */
async function violetRefreshToken(refreshToken: string): Promise<VioletTokenData> {
  const res = await fetch(`${getApiBase()}/auth/token`, {
    method: "GET",
    headers: {
      ...getAppHeaders(),
      "X-Violet-Token": refreshToken,
    },
  });

  if (!res.ok) {
    throw new Error(`Violet refresh failed (${res.status})`);
  }

  const data = (await res.json()) as {
    token: string;
    refresh_token: string;
  };
  return {
    token: data.token,
    refreshToken: data.refresh_token,
    loginTimestamp: Date.now(),
  };
}

/**
 * Manages Violet API token lifecycle within a single Convex action invocation.
 * Not persisted across invocations — each action starts fresh.
 */
class VioletTokenManager {
  private tokenData: VioletTokenData | null = null;
  private pendingToken: Promise<Record<string, string>> | null = null;

  private needsRefresh(): boolean {
    if (!this.tokenData) return true;
    const elapsed = Date.now() - this.tokenData.loginTimestamp;
    return elapsed >= TOKEN_LIFETIME_MS - TOKEN_REFRESH_BUFFER_MS;
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    if (this.tokenData && !this.needsRefresh()) {
      return {
        "X-Violet-Token": this.tokenData.token,
        "X-Violet-App-Id": process.env.VIOLET_APP_ID ?? "",
        "X-Violet-App-Secret": process.env.VIOLET_APP_SECRET ?? "",
      };
    }

    if (this.pendingToken) return this.pendingToken;

    this.pendingToken = this.refreshOrLogin().finally(() => {
      this.pendingToken = null;
    });

    return this.pendingToken;
  }

  private async refreshOrLogin(): Promise<Record<string, string>> {
    if (this.tokenData) {
      try {
        this.tokenData = await violetRefreshToken(this.tokenData.refreshToken);
      } catch {
        this.tokenData = null;
      }
    }

    if (!this.tokenData) {
      this.tokenData = await violetLogin();
    }

    return {
      "X-Violet-Token": this.tokenData.token,
      "X-Violet-App-Id": process.env.VIOLET_APP_ID ?? "",
      "X-Violet-App-Secret": process.env.VIOLET_APP_SECRET ?? "",
    };
  }

  invalidateToken(): void {
    this.tokenData = null;
  }
}

/**
 * Performs an authenticated HTTP request to the Violet API with:
 * - Auth headers injected automatically
 * - Retry on 429 and network errors with exponential backoff
 * - 401 retry with token invalidation
 * - Request timeout via AbortController
 *
 * Returns a standard Response object.
 *
 * @param url  - Full Violet API URL
 * @param init - Standard fetch RequestInit (headers injected automatically)
 */
export async function violetFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const manager = new VioletTokenManager();

  const buildHeaders = (authHeaders: Record<string, string>): Record<string, string> => ({
    ...authHeaders,
    ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
  });

  let headers = buildHeaders(await manager.getAuthHeaders());
  let refreshedOn401 = false;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      let res: Response;
      try {
        res = await fetch(url, { ...init, headers, signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }

      // 401: token expired — refresh and retry once
      if (res.status === 401 && !refreshedOn401) {
        await res.text().catch(() => {});
        manager.invalidateToken();
        headers = buildHeaders(await manager.getAuthHeaders());
        refreshedOn401 = true;
        continue;
      }

      // 429: rate limited — retry with backoff
      if (res.status === 429 && attempt < MAX_RETRIES) {
        await res.text().catch(() => {});
        await delay(BASE_DELAY_MS * Math.pow(2, attempt));
        continue;
      }

      return res;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await delay(BASE_DELAY_MS * Math.pow(2, attempt));
        continue;
      }
      throw err;
    }
  }

  throw new Error("violetFetch: exhausted all retries");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
