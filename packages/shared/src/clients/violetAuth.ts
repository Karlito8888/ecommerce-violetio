import type {
  ApiResponse,
  VioletAuthConfig,
  VioletAuthHeaders,
  VioletLoginResponse,
  VioletTokenData,
} from "../types/index.js";

/** 24 hours in milliseconds. */
const TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;

/** Proactive refresh buffer: 5 minutes before expiry. */
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

function appHeaders(config: VioletAuthConfig): Record<string, string> {
  return {
    "X-Violet-App-Id": config.appId,
    "X-Violet-App-Secret": config.appSecret,
    "Content-Type": "application/json",
  };
}

/**
 * Escape non-ASCII and special characters to Unicode escape sequences.
 *
 * Violet's login API has a server-side bug: certain ASCII characters like `!`
 * in the JSON body cause a 500 Internal Server Error. The same characters work
 * when encoded as `\u0021`. Standard `JSON.stringify` produces valid JSON with
 * literal `!`, but Violet's parser chokes on it.
 *
 * This function post-processes the JSON string to replace any non-alphanumeric
 * characters in string values with their `\uXXXX` equivalents, which Violet
 * handles correctly.
 */
function escapePasswordForViolet(password: string): string {
  return password
    .split("")
    .map((ch) => {
      const code = ch.charCodeAt(0);
      // Keep letters, digits, and common safe chars; escape everything else
      if (
        (code >= 0x30 && code <= 0x39) ||
        (code >= 0x41 && code <= 0x5a) ||
        (code >= 0x61 && code <= 0x7a)
      ) {
        return ch;
      }
      return `\\u${code.toString(16).padStart(4, "0")}`;
    })
    .join("");
}

/**
 * Authenticate with the Violet API via POST /login.
 * Returns token data on success or an ApiResponse error.
 */
export async function violetLogin(config: VioletAuthConfig): Promise<ApiResponse<VioletTokenData>> {
  try {
    const escapedPassword = escapePasswordForViolet(config.password);
    const requestBody = `{"username":"${config.username}","password":"${escapedPassword}"}`;
    const res = await fetch(`${config.apiBase}/login`, {
      method: "POST",
      headers: appHeaders(config),
      body: requestBody,
    });

    if (!res.ok) {
      const code = res.status === 429 ? "VIOLET.RATE_LIMITED" : "VIOLET.AUTH_FAILED";
      return { data: null, error: { code, message: `Violet login failed (${res.status})` } };
    }

    const responseBody = (await res.json()) as VioletLoginResponse;
    return {
      data: {
        token: responseBody.token,
        refreshToken: responseBody.refresh_token,
        loginTimestamp: Date.now(),
      },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: {
        code: "VIOLET.NETWORK_ERROR",
        message: err instanceof Error ? err.message : "Unknown network error",
      },
    };
  }
}

/**
 * Refresh the Violet JWT via POST /auth/token.
 * Returns new token data on success or an ApiResponse error.
 */
export async function violetRefreshToken(
  refreshToken: string,
  config: VioletAuthConfig,
): Promise<ApiResponse<VioletTokenData>> {
  try {
    const res = await fetch(`${config.apiBase}/auth/token`, {
      method: "POST",
      headers: appHeaders(config),
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      const code = res.status === 429 ? "VIOLET.RATE_LIMITED" : "VIOLET.AUTH_FAILED";
      return { data: null, error: { code, message: `Violet refresh failed (${res.status})` } };
    }

    const body = (await res.json()) as VioletLoginResponse;
    return {
      data: {
        token: body.token,
        refreshToken: body.refresh_token,
        loginTimestamp: Date.now(),
      },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: {
        code: "VIOLET.NETWORK_ERROR",
        message: err instanceof Error ? err.message : "Unknown network error",
      },
    };
  }
}

/**
 * Manages Violet API token lifecycle: login, caching, proactive refresh, re-login fallback.
 *
 * Web: single long-lived instance per server process.
 * Edge Functions: per-invocation instance (module-scoped for warm reuse).
 */
// SYNC: This class is duplicated in supabase/functions/_shared/violetAuth.ts (Deno runtime).
// Edge Functions cannot import from @ecommerce/shared. Any changes here MUST be mirrored there.
// TODO(CI): Add a CI check that compares the core logic hash between both files.
export class VioletTokenManager {
  private config: VioletAuthConfig;
  private tokenData: VioletTokenData | null = null;
  private pendingToken: Promise<ApiResponse<string>> | null = null;

  constructor(config: VioletAuthConfig) {
    this.config = config;
  }

  /** Returns true if the cached token needs refresh (within 5 min of 24h expiry). */
  private needsRefresh(): boolean {
    if (!this.tokenData) return true;
    const elapsed = Date.now() - this.tokenData.loginTimestamp;
    return elapsed >= TOKEN_LIFETIME_MS - TOKEN_REFRESH_BUFFER_MS;
  }

  /**
   * Returns a valid Violet JWT token string.
   * Handles: cold-start login, cached return, proactive refresh, re-login fallback.
   * Concurrent calls are deduplicated — only one login/refresh runs at a time.
   */
  async getValidToken(): Promise<ApiResponse<string>> {
    // Cached token still valid
    if (this.tokenData && !this.needsRefresh()) {
      return { data: this.tokenData.token, error: null };
    }

    // Deduplicate concurrent calls: reuse the in-flight promise if one exists
    if (this.pendingToken) return this.pendingToken;

    this.pendingToken = this.refreshOrLogin().finally(() => {
      this.pendingToken = null;
    });

    return this.pendingToken;
  }

  /** Internal: attempt refresh then fallback to full login. */
  private async refreshOrLogin(): Promise<ApiResponse<string>> {
    // Proactive refresh (have a refresh token to try)
    if (this.tokenData) {
      const refreshResult = await violetRefreshToken(this.tokenData.refreshToken, this.config);
      if (refreshResult.data) {
        this.tokenData = refreshResult.data;
        return { data: this.tokenData.token, error: null };
      }
      // Refresh failed → fall through to full re-login
    }

    // Fresh login (cold start or refresh failure)
    const loginResult = await violetLogin(this.config);
    if (loginResult.data) {
      this.tokenData = loginResult.data;
      return { data: this.tokenData.token, error: null };
    }

    // Both refresh and login failed
    this.tokenData = null;
    return loginResult as ApiResponse<string>;
  }

  /**
   * Returns the three headers required for every authenticated Violet API call.
   */
  async getAuthHeaders(): Promise<ApiResponse<VioletAuthHeaders>> {
    const tokenResult = await this.getValidToken();
    if (tokenResult.error) {
      return { data: null, error: tokenResult.error };
    }

    return {
      data: {
        "X-Violet-Token": tokenResult.data!,
        "X-Violet-App-Id": this.config.appId,
        "X-Violet-App-Secret": this.config.appSecret,
      },
      error: null,
    };
  }
}
