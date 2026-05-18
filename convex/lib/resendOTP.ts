// convex/lib/resendOTP.ts
//
// Custom Resend OTP provider for Convex Auth.
// Used for:
//   - Email verification (sign-up confirmation)
//   - Password reset (OTP-based flow)
//
// Requires:
//   - AUTH_RESEND_KEY env var (set via `npx convex env set AUTH_RESEND_KEY <key>`)
//   - EMAIL_FROM_ADDRESS env var (set via `npx convex env set EMAIL_FROM_ADDRESS <addr>`)
//
// Doc: https://labs.convex.dev/auth/config/passwords
// Doc: https://labs.convex.dev/auth/config/otps

import { Email } from "@convex-dev/auth/providers/Email";
import { Resend as ResendAPI } from "resend";
import { type RandomReader, generateRandomString } from "@oslojs/crypto/random";

const FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS ?? "noreply@maisonemile.com";
const APP_NAME = "Maison Émile";

/**
 * Random reader using Web Crypto API — available in Convex actions runtime.
 */
const random: RandomReader = {
  read(bytes: Uint8Array) {
    crypto.getRandomValues(bytes);
  },
};

/**
 * Generate a 6-digit numeric OTP code.
 */
function generateOTP(): string {
  const alphabet = "0123456789";
  return generateRandomString(random, alphabet, 6);
}

/**
 * Resend OTP provider — used for email verification on sign-up.
 * Sends a 6-digit code valid for 15 minutes.
 */
export const ResendOTP = Email({
  id: "resend-otp",
  apiKey: process.env.AUTH_RESEND_KEY,
  maxAge: 60 * 15, // 15 minutes
  async generateVerificationToken() {
    return generateOTP();
  },
  async sendVerificationRequest({ identifier: email, provider, token }) {
    const resend = new ResendAPI(provider.apiKey);
    const { error } = await resend.emails.send({
      from: `${APP_NAME} <${FROM_ADDRESS}>`,
      to: [email],
      subject: `Your ${APP_NAME} verification code`,
      text: `Your verification code is: ${token}\n\nThis code expires in 15 minutes.`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">${APP_NAME}</h2>
          <p>Your verification code is:</p>
          <p style="font-size: 2rem; font-weight: bold; letter-spacing: 0.3em; color: #2563eb;">${token}</p>
          <p style="color: #666;">This code expires in 15 minutes.</p>
        </div>
      `,
    });
    if (error) {
      throw new Error(`Failed to send verification email: ${JSON.stringify(error)}`);
    }
  },
});

/**
 * Resend OTP provider — used for password reset.
 * Sends a 6-digit code valid for 15 minutes.
 */
export const ResendOTPPasswordReset = Email({
  id: "resend-password-reset",
  apiKey: process.env.AUTH_RESEND_KEY,
  maxAge: 60 * 15, // 15 minutes
  async generateVerificationToken() {
    return generateOTP();
  },
  async sendVerificationRequest({ identifier: email, provider, token }) {
    const resend = new ResendAPI(provider.apiKey);
    const { error } = await resend.emails.send({
      from: `${APP_NAME} <${FROM_ADDRESS}>`,
      to: [email],
      subject: `Reset your ${APP_NAME} password`,
      text: `Your password reset code is: ${token}\n\nThis code expires in 15 minutes.`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">${APP_NAME}</h2>
          <p>Your password reset code is:</p>
          <p style="font-size: 2rem; font-weight: bold; letter-spacing: 0.3em; color: #2563eb;">${token}</p>
          <p style="color: #666;">This code expires in 15 minutes.</p>
          <p style="color: #999; font-size: 0.85rem;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });
    if (error) {
      throw new Error(`Failed to send password reset email: ${JSON.stringify(error)}`);
    }
  },
});
