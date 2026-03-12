import { BiometricType } from "@ecommerce/shared";

export function getBiometricLabel(supportedTypes: number[]): string {
  if (supportedTypes.includes(BiometricType.FACIAL_RECOGNITION)) return "Face ID";
  if (supportedTypes.includes(BiometricType.FINGERPRINT)) return "Fingerprint";
  return "Biometric";
}
