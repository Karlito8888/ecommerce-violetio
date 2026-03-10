import { createServerFn } from "@tanstack/react-start";
import { VioletTokenManager } from "@ecommerce/shared";
import type { ApiResponse, VioletAuthConfig, VioletAuthHeaders } from "@ecommerce/shared";

function loadVioletConfig(): ApiResponse<VioletAuthConfig> {
  const appId = process.env.VIOLET_APP_ID;
  const appSecret = process.env.VIOLET_APP_SECRET;
  const username = process.env.VIOLET_USERNAME;
  const password = process.env.VIOLET_PASSWORD;
  const apiBase = process.env.VIOLET_API_BASE ?? "https://sandbox-api.violet.io/v1";

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

  return { data: { appId, appSecret, username, password, apiBase }, error: null };
}

// Singleton — survives across requests in the same server process
let tokenManager: VioletTokenManager | null = null;

function getTokenManager(): ApiResponse<VioletTokenManager> {
  if (tokenManager) return { data: tokenManager, error: null };

  const configResult = loadVioletConfig();
  if (configResult.error) return { data: null, error: configResult.error };

  tokenManager = new VioletTokenManager(configResult.data!);
  return { data: tokenManager, error: null };
}

/**
 * Server Function — returns Violet auth headers for API calls.
 * Handles token lifecycle automatically (login, cache, refresh, re-login).
 */
export const getVioletHeaders = createServerFn().handler(
  async (): Promise<ApiResponse<VioletAuthHeaders>> => {
    const managerResult = getTokenManager();
    if (managerResult.error) return { data: null, error: managerResult.error };

    return managerResult.data!.getAuthHeaders();
  },
);

/**
 * Internal helper for other Server Functions to obtain Violet auth headers.
 * Unlike getVioletHeaders (a Server Function callable via RPC), this is a plain
 * async function meant for server-side composition only.
 */
export async function ensureVioletAuth(): Promise<ApiResponse<VioletAuthHeaders>> {
  const managerResult = getTokenManager();
  if (managerResult.error) return { data: null, error: managerResult.error };

  return managerResult.data!.getAuthHeaders();
}

/**
 * Resets the cached VioletTokenManager singleton.
 * Use after fatal auth errors or when env vars change (e.g., dev hot-reload).
 */
export function resetTokenManager(): void {
  tokenManager = null;
}
