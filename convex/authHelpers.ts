import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx, MutationCtx } from "./_generated/server.js";
import type { Doc, Id } from "./_generated/dataModel.d.ts";

export type Role = "owner" | "manager" | "staff";

/**
 * Ensures the caller is authenticated and their account is active.
 * Rejects unauthenticated calls and deactivated accounts.
 */
export async function requireAuthenticatedUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Sign in required to perform this action.",
    });
  }

  const user = await ctx.db.get("users", userId);
  if (!user || user.isActive === false) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Your account is not active or has been deactivated. Contact the restaurant owner.",
    });
  }

  return user;
}

/**
 * Ensures the caller has the OWNER role and is active.
 */
export async function requireOwner(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const user = await requireAuthenticatedUser(ctx);
  if (user.role !== "owner") {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Owner privileges required.",
    });
  }
  return user;
}

/**
 * Ensures the caller has either OWNER or MANAGER role and is active.
 */
export async function requireManagerOrOwner(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const user = await requireAuthenticatedUser(ctx);
  if (user.role !== "owner" && user.role !== "manager") {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Manager or Owner privileges required.",
    });
  }
  return user;
}

/**
 * Ensures the caller has either OWNER, MANAGER, or STAFF role and is active.
 */
export async function requireStaffOrAbove(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const user = await requireAuthenticatedUser(ctx);
  if (
    user.role !== "owner" &&
    user.role !== "manager" &&
    user.role !== "staff"
  ) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Staff, Manager, or Owner privileges required.",
    });
  }
  return user;
}

/**
 * Retrieves the authorized restaurant ID for the user.
 * Strictly requires that the user has a restaurantId already assigned.
 * Does NOT auto-link users to arbitrary restaurants or auto-create restaurants.
 * This prevents privilege escalation and cross-restaurant data leakage.
 */
export async function getAuthorizedRestaurantId(
  _ctx: QueryCtx | MutationCtx,
  user: Doc<"users">
): Promise<Id<"restaurants">> {
  if (user.restaurantId) {
    return user.restaurantId;
  }

  throw new ConvexError({
    code: "NOT_FOUND",
    message: "No restaurant is linked to this account. Please register your restaurant first.",
  });
}
