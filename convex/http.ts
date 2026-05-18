// convex/http.ts
//
// HTTP route handler for Convex.
// Routes authentication endpoints (OAuth callbacks, JWT verification, etc.)
// and Violet.io webhook endpoint (Phase 7).
//
// Doc: https://docs.convex.dev/functions/http-actions

import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { handleVioletWebhook } from "./webhooks/violet";

const http = httpRouter();

// ─── Convex Auth HTTP routes ────────────────────────────────────────────────
// Handles:
//   - GET /.well-known/openid-configuration
//   - GET /.well-known/jwks.json
//   - POST /api/auth/callback/:provider (OAuth callbacks)
//   - POST /api/auth/signin/:provider (OAuth sign-in)
//   - GET /api/auth/csrf
//   - POST /api/auth/signout
auth.addHttpRoutes(http);

// ─── Violet Webhook Endpoint (Phase 7) ──────────────────────────────────────
// Receives ALL Violet webhook events (orders, bags, merchants, transfers, etc.)
// Violet sends POST requests to this endpoint with HMAC-SHA256 signature.
//
// Production URL: https://api.maisonemile.com/api/webhooks/violet
// Dev URL:        http://localhost:3211/api/webhooks/violet
//
// Doc: https://docs.violet.io/prism/webhooks/handling-webhooks
http.route({
  path: "/api/webhooks/violet",
  method: "POST",
  handler: handleVioletWebhook,
});

export default http;
