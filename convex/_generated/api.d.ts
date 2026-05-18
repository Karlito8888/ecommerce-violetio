/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin_mutations from "../admin/mutations.js";
import type * as admin_queries from "../admin/queries.js";
import type * as auth from "../auth.js";
import type * as content_queries from "../content/queries.js";
import type * as crons from "../crons.js";
import type * as health_queries from "../health/queries.js";
import type * as http from "../http.js";
import type * as lib_admin from "../lib/admin.js";
import type * as lib_email from "../lib/email.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_push from "../lib/push.js";
import type * as lib_resendOTP from "../lib/resendOTP.js";
import type * as lib_violetApi from "../lib/violetApi.js";
import type * as lib_webhookSchemas from "../lib/webhookSchemas.js";
import type * as notifications_mutations from "../notifications/mutations.js";
import type * as notifications_queries from "../notifications/queries.js";
import type * as orders_queries from "../orders/queries.js";
import type * as support_mutations from "../support/mutations.js";
import type * as support_queries from "../support/queries.js";
import type * as tracking_mutations from "../tracking/mutations.js";
import type * as tracking_queries from "../tracking/queries.js";
import type * as users_mutations from "../users/mutations.js";
import type * as users_queries from "../users/queries.js";
import type * as webhooks_violet from "../webhooks/violet.js";
import type * as wishlists_mutations from "../wishlists/mutations.js";
import type * as wishlists_queries from "../wishlists/queries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "admin/mutations": typeof admin_mutations;
  "admin/queries": typeof admin_queries;
  auth: typeof auth;
  "content/queries": typeof content_queries;
  crons: typeof crons;
  "health/queries": typeof health_queries;
  http: typeof http;
  "lib/admin": typeof lib_admin;
  "lib/email": typeof lib_email;
  "lib/errors": typeof lib_errors;
  "lib/push": typeof lib_push;
  "lib/resendOTP": typeof lib_resendOTP;
  "lib/violetApi": typeof lib_violetApi;
  "lib/webhookSchemas": typeof lib_webhookSchemas;
  "notifications/mutations": typeof notifications_mutations;
  "notifications/queries": typeof notifications_queries;
  "orders/queries": typeof orders_queries;
  "support/mutations": typeof support_mutations;
  "support/queries": typeof support_queries;
  "tracking/mutations": typeof tracking_mutations;
  "tracking/queries": typeof tracking_queries;
  "users/mutations": typeof users_mutations;
  "users/queries": typeof users_queries;
  "webhooks/violet": typeof webhooks_violet;
  "wishlists/mutations": typeof wishlists_mutations;
  "wishlists/queries": typeof wishlists_queries;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
