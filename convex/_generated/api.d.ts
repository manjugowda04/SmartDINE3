/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as analytics from "../analytics.js";
import type * as auth from "../auth.js";
import type * as authHelpers from "../authHelpers.js";
import type * as billingCalculations from "../billingCalculations.js";
import type * as cart from "../cart.js";
import type * as http from "../http.js";
import type * as masterCode from "../masterCode.js";
import type * as menu from "../menu.js";
import type * as migration from "../migration.js";
import type * as orders from "../orders.js";
import type * as payments from "../payments.js";
import type * as requests from "../requests.js";
import type * as restaurants from "../restaurants.js";
import type * as seed from "../seed.js";
import type * as sessions from "../sessions.js";
import type * as staff from "../staff.js";
import type * as tables from "../tables.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  analytics: typeof analytics;
  auth: typeof auth;
  authHelpers: typeof authHelpers;
  billingCalculations: typeof billingCalculations;
  cart: typeof cart;
  http: typeof http;
  masterCode: typeof masterCode;
  menu: typeof menu;
  migration: typeof migration;
  orders: typeof orders;
  payments: typeof payments;
  requests: typeof requests;
  restaurants: typeof restaurants;
  seed: typeof seed;
  sessions: typeof sessions;
  staff: typeof staff;
  tables: typeof tables;
  users: typeof users;
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
