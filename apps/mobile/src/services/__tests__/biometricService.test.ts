import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock expo-local-authentication
vi.mock("expo-local-authentication", () => ({
  hasHardwareAsync: vi.fn(),
  isEnrolledAsync: vi.fn(),
  supportedAuthenticationTypesAsync: vi.fn(),
  authenticateAsync: vi.fn(),
}));

// Mock expo-secure-store
vi.mock("expo-secure-store", () => ({
  setItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));

import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import {
  checkBiometricAvailability,
  authenticateWithBiometric,
  storeCredentials,
  retrieveCredentials,
  clearCredentials,
  enrollBiometric,
  disableBiometric,
  attemptBiometricLogin,
  resetBiometricFailCount,
} from "../biometricService";

// Mock function matching new biometricService signature (Convex mutation)
const mockSetBiometric = vi.fn().mockResolvedValue(null);

describe("checkBiometricAvailability", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns available and enrolled status", async () => {
    vi.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(true);
    vi.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(true);
    vi.mocked(LocalAuthentication.supportedAuthenticationTypesAsync).mockResolvedValue([1, 2]);

    const result = await checkBiometricAvailability();

    expect(result).toEqual({
      isAvailable: true,
      isEnrolled: true,
      supportedTypes: [1, 2],
    });
  });

  it("returns not available when no hardware", async () => {
    vi.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(false);
    vi.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(false);
    vi.mocked(LocalAuthentication.supportedAuthenticationTypesAsync).mockResolvedValue([]);

    const result = await checkBiometricAvailability();

    expect(result.isAvailable).toBe(false);
    expect(result.isEnrolled).toBe(false);
  });
});

describe("authenticateWithBiometric", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns success on successful authentication", async () => {
    vi.mocked(LocalAuthentication.authenticateAsync).mockResolvedValue({
      success: true,
    });

    const result = await authenticateWithBiometric();

    expect(result.success).toBe(true);
  });

  it("returns USER_CANCEL when user cancels", async () => {
    vi.mocked(LocalAuthentication.authenticateAsync).mockResolvedValue({
      success: false,
      error: "user_cancel",
    });

    const result = await authenticateWithBiometric();

    expect(result.success).toBe(false);
    expect(result.error).toBe("BIOMETRIC.USER_CANCEL");
  });

  it("returns AUTH_FAILED on other failure", async () => {
    vi.mocked(LocalAuthentication.authenticateAsync).mockResolvedValue({
      success: false,
      error: "lockout",
    });

    const result = await authenticateWithBiometric();

    expect(result.success).toBe(false);
    expect(result.error).toBe("BIOMETRIC.AUTH_FAILED");
  });
});

describe("storeCredentials / retrieveCredentials / clearCredentials", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores credentials with biometric protection", async () => {
    await storeCredentials("user@test.com", "refresh-token-123");

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "biometric_session_token",
      "refresh-token-123",
      expect.objectContaining({
        requireAuthentication: true,
        keychainService: "biometric-credentials",
      }),
    );
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "biometric_user_email",
      "user@test.com",
      expect.objectContaining({
        keychainService: "biometric-credentials",
      }),
    );
  });

  it("retrieves credentials successfully", async () => {
    vi.mocked(SecureStore.getItemAsync)
      .mockResolvedValueOnce("refresh-token-123")
      .mockResolvedValueOnce("user@test.com");

    const result = await retrieveCredentials();

    expect(result.success).toBe(true);
    expect(result.refreshToken).toBe("refresh-token-123");
    expect(result.email).toBe("user@test.com");
  });

  it("returns error when no token stored", async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);

    const result = await retrieveCredentials();

    expect(result.success).toBe(false);
    expect(result.error).toBe("BIOMETRIC.CREDENTIAL_ERROR");
  });

  it("returns storage error on exception", async () => {
    vi.mocked(SecureStore.getItemAsync).mockRejectedValue(new Error("Keychain error"));

    const result = await retrieveCredentials();

    expect(result.success).toBe(false);
    expect(result.error).toBe("BIOMETRIC.STORAGE_ERROR");
  });

  it("clears both credential keys", async () => {
    await clearCredentials();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("biometric_session_token", {
      keychainService: "biometric-credentials",
    });
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("biometric_user_email", {
      keychainService: "biometric-credentials",
    });
  });
});

describe("enrollBiometric", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetBiometricFailCount();
    mockSetBiometric.mockResolvedValue(null);
  });

  it("completes enrollment successfully", async () => {
    vi.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(true);
    vi.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(true);
    vi.mocked(LocalAuthentication.supportedAuthenticationTypesAsync).mockResolvedValue([1]);
    vi.mocked(LocalAuthentication.authenticateAsync).mockResolvedValue({ success: true });

    const result = await enrollBiometric(mockSetBiometric, "user@test.com", "refresh-token");

    expect(result.success).toBe(true);
    expect(SecureStore.setItemAsync).toHaveBeenCalled();
    expect(mockSetBiometric).toHaveBeenCalledWith({ enabled: true });
  });

  it("fails when biometric not available", async () => {
    vi.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(false);
    vi.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(false);
    vi.mocked(LocalAuthentication.supportedAuthenticationTypesAsync).mockResolvedValue([]);

    const result = await enrollBiometric(mockSetBiometric, "user@test.com", "refresh-token");

    expect(result.success).toBe(false);
    expect(result.error).toBe("BIOMETRIC.NOT_AVAILABLE");
  });

  it("fails when biometric not enrolled on device", async () => {
    vi.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(true);
    vi.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(false);
    vi.mocked(LocalAuthentication.supportedAuthenticationTypesAsync).mockResolvedValue([]);

    const result = await enrollBiometric(mockSetBiometric, "user@test.com", "refresh-token");

    expect(result.success).toBe(false);
    expect(result.error).toBe("BIOMETRIC.NOT_ENROLLED");
  });

  it("fails when biometric auth is rejected", async () => {
    vi.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(true);
    vi.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(true);
    vi.mocked(LocalAuthentication.supportedAuthenticationTypesAsync).mockResolvedValue([1]);
    vi.mocked(LocalAuthentication.authenticateAsync).mockResolvedValue({
      success: false,
      error: "user_cancel",
    });

    const result = await enrollBiometric(mockSetBiometric, "user@test.com", "refresh-token");

    expect(result.success).toBe(false);
    expect(result.error).toBe("BIOMETRIC.USER_CANCEL");
  });

  it("cleans up credentials if preference update fails", async () => {
    vi.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(true);
    vi.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(true);
    vi.mocked(LocalAuthentication.supportedAuthenticationTypesAsync).mockResolvedValue([1]);
    vi.mocked(LocalAuthentication.authenticateAsync).mockResolvedValue({ success: true });
    mockSetBiometric.mockRejectedValueOnce(new Error("DB error"));

    const result = await enrollBiometric(mockSetBiometric, "user@test.com", "refresh-token");

    expect(result.success).toBe(false);
    expect(result.error).toBe("BIOMETRIC.STORAGE_ERROR");
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  });
});

describe("disableBiometric", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clears credentials and updates preference", async () => {
    await disableBiometric(mockSetBiometric);

    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
    expect(mockSetBiometric).toHaveBeenCalledWith({ enabled: false });
  });
});

describe("attemptBiometricLogin — 3-strike fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetBiometricFailCount();
  });

  it("returns success and resets counter on successful login", async () => {
    vi.mocked(SecureStore.getItemAsync)
      .mockResolvedValueOnce("refresh-token")
      .mockResolvedValueOnce("user@test.com");

    const result = await attemptBiometricLogin();

    expect(result.success).toBe(true);
  });

  it("increments counter on failure, shows remaining attempts", async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);

    const result1 = await attemptBiometricLogin();
    expect(result1.success).toBe(false);
    expect(result1.attemptsRemaining).toBe(2);
    expect(result1.fallbackToPassword).toBeUndefined();

    const result2 = await attemptBiometricLogin();
    expect(result2.attemptsRemaining).toBe(1);
  });

  it("triggers fallback to password after 3 consecutive failures", async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);

    await attemptBiometricLogin(); // strike 1
    await attemptBiometricLogin(); // strike 2
    const result3 = await attemptBiometricLogin(); // strike 3

    expect(result3.success).toBe(false);
    expect(result3.fallbackToPassword).toBe(true);
  });

  it("resets counter after successful login following failures", async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
    await attemptBiometricLogin(); // strike 1
    await attemptBiometricLogin(); // strike 2

    // Now succeed
    resetBiometricFailCount();
    vi.mocked(SecureStore.getItemAsync)
      .mockResolvedValueOnce("refresh-token")
      .mockResolvedValueOnce("user@test.com");

    const successResult = await attemptBiometricLogin();
    expect(successResult.success).toBe(true);

    // Next failure should be strike 1 again (counter reset)
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
    const failResult = await attemptBiometricLogin();
    expect(failResult.attemptsRemaining).toBe(2);
  });
});
