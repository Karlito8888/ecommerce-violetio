import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { VioletAuthConfig, VioletLoginResponse } from "@ecommerce/shared";
import { violetLogin, violetRefreshToken, VioletTokenManager } from "@ecommerce/shared";

const MOCK_CONFIG: VioletAuthConfig = {
  appId: "11371",
  appSecret: "test-secret",
  username: "owner@example.com",
  password: "test-password",
  apiBase: "https://sandbox-api.violet.io/v1",
};

const MOCK_LOGIN_RESPONSE: VioletLoginResponse = {
  id: "user-123",
  email: "owner@example.com",
  token: "jwt-token-abc",
  refresh_token: "refresh-token-xyz",
  type: "OWNER",
  verified: true,
  status: "ACTIVE",
  roles: ["OWNER"],
};

function mockFetchSuccess(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

function mockFetchFailure(status: number, body?: unknown) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve(body ?? { error: "Failed" }),
  });
}

function mockFetchNetworkError() {
  return vi.fn().mockRejectedValue(new Error("Network error"));
}

describe("violetLogin", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("calls POST /login with correct headers and body", async () => {
    const fetchMock = mockFetchSuccess(MOCK_LOGIN_RESPONSE);
    globalThis.fetch = fetchMock;

    await violetLogin(MOCK_CONFIG);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://sandbox-api.violet.io/v1/login",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Violet-App-Id": "11371",
          "X-Violet-App-Secret": "test-secret",
          "Content-Type": "application/json",
        }),
        body: '{"username":"owner@example.com","password":"test\\u002dpassword"}',
      }),
    );
  });

  it("returns token data on success", async () => {
    globalThis.fetch = mockFetchSuccess(MOCK_LOGIN_RESPONSE);

    const result = await violetLogin(MOCK_CONFIG);

    expect(result.data).not.toBeNull();
    expect(result.data!.token).toBe("jwt-token-abc");
    expect(result.data!.refreshToken).toBe("refresh-token-xyz");
    expect(result.error).toBeNull();
  });

  it("returns error on 401 (invalid credentials)", async () => {
    globalThis.fetch = mockFetchFailure(401, { error: "Unauthorized" });

    const result = await violetLogin(MOCK_CONFIG);

    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe("VIOLET.AUTH_FAILED");
  });

  it("returns error on network failure", async () => {
    globalThis.fetch = mockFetchNetworkError();

    const result = await violetLogin(MOCK_CONFIG);

    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe("VIOLET.NETWORK_ERROR");
  });

  it("returns RATE_LIMITED error on 429", async () => {
    globalThis.fetch = mockFetchFailure(429);

    const result = await violetLogin(MOCK_CONFIG);

    expect(result.data).toBeNull();
    expect(result.error!.code).toBe("VIOLET.RATE_LIMITED");
  });

  it("includes loginTimestamp in returned token data", async () => {
    globalThis.fetch = mockFetchSuccess(MOCK_LOGIN_RESPONSE);

    const before = Date.now();
    const result = await violetLogin(MOCK_CONFIG);
    const after = Date.now();

    expect(result.data!.loginTimestamp).toBeGreaterThanOrEqual(before);
    expect(result.data!.loginTimestamp).toBeLessThanOrEqual(after);
  });
});

describe("violetRefreshToken", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("calls GET /auth/token with X-Violet-Token header", async () => {
    const fetchMock = mockFetchSuccess(MOCK_LOGIN_RESPONSE);
    globalThis.fetch = fetchMock;

    await violetRefreshToken("refresh-token-xyz", MOCK_CONFIG);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://sandbox-api.violet.io/v1/auth/token",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "X-Violet-App-Id": "11371",
          "X-Violet-App-Secret": "test-secret",
          "X-Violet-Token": "refresh-token-xyz",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("returns new token data on success", async () => {
    const refreshedResponse = { ...MOCK_LOGIN_RESPONSE, token: "new-jwt-token" };
    globalThis.fetch = mockFetchSuccess(refreshedResponse);

    const result = await violetRefreshToken("refresh-token-xyz", MOCK_CONFIG);

    expect(result.data).not.toBeNull();
    expect(result.data!.token).toBe("new-jwt-token");
    expect(result.error).toBeNull();
  });

  it("returns error on refresh failure", async () => {
    globalThis.fetch = mockFetchFailure(401);

    const result = await violetRefreshToken("expired-token", MOCK_CONFIG);

    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe("VIOLET.AUTH_FAILED");
  });
});

describe("VioletTokenManager", () => {
  const originalFetch = globalThis.fetch;
  let manager: VioletTokenManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new VioletTokenManager(MOCK_CONFIG);
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it("performs fresh login on first getValidToken() call", async () => {
    globalThis.fetch = mockFetchSuccess(MOCK_LOGIN_RESPONSE);

    const result = await manager.getValidToken();

    expect(result.data).toBe("jwt-token-abc");
    expect(result.error).toBeNull();
  });

  it("returns cached token on subsequent calls within expiry window", async () => {
    const fetchMock = mockFetchSuccess(MOCK_LOGIN_RESPONSE);
    globalThis.fetch = fetchMock;

    await manager.getValidToken();
    const result = await manager.getValidToken();

    // fetch should only be called once (the initial login)
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.data).toBe("jwt-token-abc");
  });

  it("proactively refreshes token 5 minutes before 24h expiry", async () => {
    // First call — login
    globalThis.fetch = mockFetchSuccess(MOCK_LOGIN_RESPONSE);
    await manager.getValidToken();

    // Advance time to 23h56m (past the 23h55m threshold)
    const MS_23H56M = 23 * 60 * 60 * 1000 + 56 * 60 * 1000;
    vi.advanceTimersByTime(MS_23H56M);

    // Set up refresh response
    const refreshedResponse = { ...MOCK_LOGIN_RESPONSE, token: "refreshed-jwt" };
    globalThis.fetch = mockFetchSuccess(refreshedResponse);

    const result = await manager.getValidToken();

    expect(result.data).toBe("refreshed-jwt");
  });

  it("falls back to full re-login when refresh fails", async () => {
    // First call — login
    globalThis.fetch = mockFetchSuccess(MOCK_LOGIN_RESPONSE);
    await manager.getValidToken();

    // Advance past refresh threshold
    const MS_23H56M = 23 * 60 * 60 * 1000 + 56 * 60 * 1000;
    vi.advanceTimersByTime(MS_23H56M);

    // Refresh fails, then re-login succeeds
    const reLoginResponse = { ...MOCK_LOGIN_RESPONSE, token: "relogin-jwt" };
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Refresh call fails
        return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) });
      }
      // Re-login succeeds
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(reLoginResponse),
      });
    });

    const result = await manager.getValidToken();

    expect(result.data).toBe("relogin-jwt");
  });

  it("returns error when both refresh and re-login fail", async () => {
    // First call — login
    globalThis.fetch = mockFetchSuccess(MOCK_LOGIN_RESPONSE);
    await manager.getValidToken();

    // Advance past refresh threshold
    const MS_23H56M = 23 * 60 * 60 * 1000 + 56 * 60 * 1000;
    vi.advanceTimersByTime(MS_23H56M);

    // Both refresh and re-login fail
    globalThis.fetch = mockFetchFailure(401);

    const result = await manager.getValidToken();

    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
  });

  it("getAuthHeaders() returns correct header shape", async () => {
    globalThis.fetch = mockFetchSuccess(MOCK_LOGIN_RESPONSE);

    const result = await manager.getAuthHeaders();

    expect(result.data).toEqual({
      "X-Violet-Token": "jwt-token-abc",
      "X-Violet-App-Id": "11371",
      "X-Violet-App-Secret": "test-secret",
    });
  });

  it("getAuthHeaders() returns error when authentication fails", async () => {
    globalThis.fetch = mockFetchNetworkError();

    const result = await manager.getAuthHeaders();

    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
  });

  it("deduplicates concurrent getValidToken() calls (single login)", async () => {
    let resolveLogin: (value: Response) => void;
    const loginPromise = new Promise<Response>((resolve) => {
      resolveLogin = resolve;
    });
    globalThis.fetch = vi.fn().mockReturnValue(loginPromise);

    // Fire 3 concurrent calls
    const p1 = manager.getValidToken();
    const p2 = manager.getValidToken();
    const p3 = manager.getValidToken();

    // Resolve the single login
    resolveLogin!({
      ok: true,
      status: 200,
      json: () => Promise.resolve(MOCK_LOGIN_RESPONSE),
    } as Response);

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    // All three should succeed with the same token
    expect(r1.data).toBe("jwt-token-abc");
    expect(r2.data).toBe("jwt-token-abc");
    expect(r3.data).toBe("jwt-token-abc");
    // fetch should only have been called once
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("Web Server Function: ensureVioletAuth", () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Reset module-level singleton by importing the reset function
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  it("returns CONFIG_MISSING error when env vars are absent", async () => {
    delete process.env.VIOLET_APP_ID;
    delete process.env.VIOLET_APP_SECRET;
    delete process.env.VIOLET_USERNAME;
    delete process.env.VIOLET_PASSWORD;

    const { ensureVioletAuth, resetTokenManager } = await import("../server/violetAuth.js");
    resetTokenManager();

    const result = await ensureVioletAuth();

    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe("VIOLET.CONFIG_MISSING");
  });

  it("returns auth headers when env vars are set", async () => {
    process.env.VIOLET_APP_ID = "11371";
    process.env.VIOLET_APP_SECRET = "test-secret";
    process.env.VIOLET_USERNAME = "owner@example.com";
    process.env.VIOLET_PASSWORD = "test-password";
    process.env.VIOLET_API_BASE = "https://sandbox-api.violet.io/v1";

    globalThis.fetch = mockFetchSuccess(MOCK_LOGIN_RESPONSE);

    const { ensureVioletAuth, resetTokenManager } = await import("../server/violetAuth.js");
    resetTokenManager();

    const result = await ensureVioletAuth();

    expect(result.data).not.toBeNull();
    expect(result.data!["X-Violet-Token"]).toBe("jwt-token-abc");
    expect(result.data!["X-Violet-App-Id"]).toBe("11371");
    expect(result.data!["X-Violet-App-Secret"]).toBe("test-secret");
  });

  it("resetTokenManager() allows re-initialization with new config", async () => {
    // First: missing config
    delete process.env.VIOLET_APP_ID;
    const { ensureVioletAuth, resetTokenManager } = await import("../server/violetAuth.js");
    resetTokenManager();

    const r1 = await ensureVioletAuth();
    expect(r1.error!.code).toBe("VIOLET.CONFIG_MISSING");

    // Now set env vars and reset
    process.env.VIOLET_APP_ID = "11371";
    process.env.VIOLET_APP_SECRET = "test-secret";
    process.env.VIOLET_USERNAME = "owner@example.com";
    process.env.VIOLET_PASSWORD = "test-password";
    globalThis.fetch = mockFetchSuccess(MOCK_LOGIN_RESPONSE);

    resetTokenManager();

    const r2 = await ensureVioletAuth();
    expect(r2.data).not.toBeNull();
    expect(r2.data!["X-Violet-Token"]).toBe("jwt-token-abc");
  });
});
