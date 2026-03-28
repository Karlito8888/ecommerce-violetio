/**
 * Violet API token management for Supabase Edge Functions (Deno runtime).
 *
 * SYNC: Core logic (VioletTokenManager, violetLogin, violetRefreshToken) is duplicated
 * from packages/shared/src/clients/violetAuth.ts. Edge Functions cannot import from
 * @ecommerce/shared due to the Deno runtime constraint.
 *
 * Any changes to the core logic MUST be applied to both files.
 * TODO(CI): Add a CI check that compares the core logic hash between both files.
 */

interface VioletAuthConfig {
  appId: string;
  appSecret: string;
  username: string;
  password: string;
  apiBase: string;
}

interface VioletTokenData {
  token: string;
  refreshToken: string;
  loginTimestamp: number;
}

interface VioletAuthHeaders {
  "X-Violet-Token": string;
  "X-Violet-App-Id": string;
  "X-Violet-App-Secret": string;
}

interface ApiError {
  code: string;
  message: string;
}

type ApiResponse<T> = { data: T; error: null } | { data: null; error: ApiError };

const TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;
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
 * Workaround for Violet API bug: `!` and other special chars in passwords
 * cause a 500 when sent as literal characters, but work as `\uXXXX`.
 */
function escapePasswordForViolet(password: string): string {
  return password
    .split("")
    .map((ch) => {
      const code = ch.charCodeAt(0);
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

async function violetLogin(config: VioletAuthConfig): Promise<ApiResponse<VioletTokenData>> {
  try {
    const escapedPassword = escapePasswordForViolet(config.password);
    const body = `{"username":"${config.username}","password":"${escapedPassword}"}`;
    const res = await fetch(`${config.apiBase}/login`, {
      method: "POST",
      headers: appHeaders(config),
      body,
    });

    if (!res.ok) {
      const code = res.status === 429 ? "VIOLET.RATE_LIMITED" : "VIOLET.AUTH_FAILED";
      return { data: null, error: { code, message: `Violet login failed (${res.status})` } };
    }

    const loginData = await res.json();
    return {
      data: {
        token: loginData.token,
        refreshToken: loginData.refresh_token,
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

async function violetRefreshToken(
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

    const refreshData = await res.json();
    return {
      data: {
        token: refreshData.token,
        refreshToken: refreshData.refresh_token,
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

class VioletTokenManager {
  private config: VioletAuthConfig;
  private tokenData: VioletTokenData | null = null;
  private pendingToken: Promise<ApiResponse<string>> | null = null;

  constructor(config: VioletAuthConfig) {
    this.config = config;
  }

  private needsRefresh(): boolean {
    if (!this.tokenData) return true;
    const elapsed = Date.now() - this.tokenData.loginTimestamp;
    return elapsed >= TOKEN_LIFETIME_MS - TOKEN_REFRESH_BUFFER_MS;
  }

  async getValidToken(): Promise<ApiResponse<string>> {
    if (this.tokenData && !this.needsRefresh()) {
      return { data: this.tokenData.token, error: null };
    }

    if (this.pendingToken) return this.pendingToken;

    this.pendingToken = this.refreshOrLogin().finally(() => {
      this.pendingToken = null;
    });

    return this.pendingToken;
  }

  private async refreshOrLogin(): Promise<ApiResponse<string>> {
    if (this.tokenData) {
      const refreshResult = await violetRefreshToken(this.tokenData.refreshToken, this.config);
      if (refreshResult.data) {
        this.tokenData = refreshResult.data;
        return { data: this.tokenData.token, error: null };
      }
    }

    const loginResult = await violetLogin(this.config);
    if (loginResult.data) {
      this.tokenData = loginResult.data;
      return { data: this.tokenData.token, error: null };
    }

    this.tokenData = null;
    return loginResult as ApiResponse<string>;
  }

  async getAuthHeaders(): Promise<ApiResponse<VioletAuthHeaders>> {
    const tokenResult = await this.getValidToken();
    if (tokenResult.error) return { data: null, error: tokenResult.error };

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

// Module-scoped singleton — persists across warm invocations
let _manager: VioletTokenManager | null = null;

/**
 * Returns Violet auth headers for Edge Function API calls.
 * Handles token lifecycle automatically.
 */
export async function getVioletHeaders(): Promise<ApiResponse<VioletAuthHeaders>> {
  if (!_manager) {
    // Deno.env.get() is the standard way to access env vars in Edge Functions
    const appId = Deno.env.get("VIOLET_APP_ID");
    const appSecret = Deno.env.get("VIOLET_APP_SECRET");
    const username = Deno.env.get("VIOLET_USERNAME");
    const password = Deno.env.get("VIOLET_PASSWORD");
    const apiBase = Deno.env.get("VIOLET_API_BASE") ?? "https://sandbox-api.violet.io/v1";

    if (!appId || !appSecret || !username || !password) {
      return {
        data: null,
        error: {
          code: "VIOLET.CONFIG_MISSING",
          message:
            "Missing required Violet env vars: VIOLET_APP_ID, VIOLET_APP_SECRET, VIOLET_USERNAME, VIOLET_PASSWORD",
        },
      };
    }

    _manager = new VioletTokenManager({ appId, appSecret, username, password, apiBase });
  }

  return _manager.getAuthHeaders();
}
