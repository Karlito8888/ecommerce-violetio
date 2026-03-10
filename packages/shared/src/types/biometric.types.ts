/** Biometric hardware and enrollment status. */
export interface BiometricStatus {
  isAvailable: boolean;
  isEnrolled: boolean;
  supportedTypes: BiometricType[];
}

/** Biometric authentication types (mirrors expo-local-authentication AuthenticationType). */
export enum BiometricType {
  FINGERPRINT = 1,
  FACIAL_RECOGNITION = 2,
  IRIS = 3,
}

/** Result of a biometric enrollment attempt. */
export interface BiometricEnrollResult {
  success: boolean;
  error?: BiometricErrorCode;
}

/** Result of a biometric authentication attempt. */
export interface BiometricAuthResult {
  success: boolean;
  /** When true, the app should navigate to password login. */
  fallbackToPassword?: boolean;
  /** Remaining biometric attempts before fallback. */
  attemptsRemaining?: number;
  error?: BiometricErrorCode;
}

/** Domain-specific error codes following DOMAIN.ACTION pattern. */
export type BiometricErrorCode =
  | "BIOMETRIC.NOT_AVAILABLE"
  | "BIOMETRIC.NOT_ENROLLED"
  | "BIOMETRIC.AUTH_FAILED"
  | "BIOMETRIC.USER_CANCEL"
  | "BIOMETRIC.CREDENTIAL_ERROR"
  | "BIOMETRIC.STORAGE_ERROR"
  | "BIOMETRIC.SESSION_EXPIRED";
