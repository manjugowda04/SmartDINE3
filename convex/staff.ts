import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireOwner, getAuthorizedRestaurantId } from "./authHelpers.js";
import { Scrypt } from "lucia";

/**
 * Computes a SHA-256 hex digest of a token string.
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generates a cryptographically secure random token string (48 hex characters).
 */
export function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Queries ───────────────────────────────────────────────────────

/**
 * List all restaurant staff, managers, and owners for the current restaurant. (Owner only)
 */
export const listStaff = query({
  args: {},
  handler: async (ctx) => {
    const owner = await requireOwner(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, owner);

    const users = await ctx.db
      .query("users")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect();

    const staffMembers = users
      .filter((u) => u.role === "owner" || u.role === "manager" || u.role === "staff")
      .map((u) => ({
        _id: u._id,
        name: u.name ?? "Staff Member",
        email: u.email ?? "",
        role: (u.role ?? "staff") as "owner" | "manager" | "staff",
        isActive: u.isActive !== false,
        _creationTime: u._creationTime,
      }));

    return staffMembers.sort((a, b) => {
      const roleOrder = { owner: 0, manager: 1, staff: 2 };
      const diff = (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });
  },
});

/**
 * List all invitations scoped to the owner's restaurant. (Owner only)
 */
export const listInvitations = query({
  args: {},
  handler: async (ctx) => {
    const owner = await requireOwner(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, owner);

    const invitations = await ctx.db
      .query("staff_invitations")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .order("desc")
      .take(100);

    return invitations.map((inv) => ({
      _id: inv._id,
      name: inv.name,
      email: inv.email,
      role: inv.role,
      status: inv.status,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
      redeemedAt: inv.redeemedAt,
      isExpired: Date.now() > inv.expiresAt && inv.status === "pending",
    }));
  },
});

/**
 * Public query to inspect invitation status by token on the accept page.
 * Hashes token server-side; does not reveal tokenHash or secrets.
 */
export const getInvitationDetails = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const token = args.token.trim();
    if (!token) {
      return { isValid: false, reason: "INVALID_TOKEN" as const };
    }

    const tokenHash = await hashToken(token);
    const invitation = await ctx.db
      .query("staff_invitations")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .unique();

    if (!invitation) {
      return { isValid: false, reason: "NOT_FOUND" as const };
    }

    if (invitation.status === "revoked") {
      return { isValid: false, reason: "REVOKED" as const };
    }

    if (invitation.status === "redeemed") {
      return { isValid: false, reason: "ALREADY_REDEEMED" as const };
    }

    if (Date.now() > invitation.expiresAt) {
      return { isValid: false, reason: "EXPIRED" as const };
    }

    let restaurantName = "SmartDine";
    if (invitation.restaurantId) {
      const rest = await ctx.db.get("restaurants", invitation.restaurantId);
      if (rest) restaurantName = rest.name;
    }

    return {
      isValid: true,
      email: invitation.email,
      name: invitation.name,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      restaurantName,
    };
  },
});

// ─── Mutations ─────────────────────────────────────────────────────

/**
 * Create a single-use invitation for a staff member or manager. (Owner only)
 * Strictly scoped to the owner's restaurant.
 */
export const createInvitation = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    role: v.union(v.literal("manager"), v.literal("staff")),
    expiryHours: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, owner);

    const name = args.name.trim();
    const email = args.email.trim().toLowerCase();

    if (name.length < 2) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Name must be at least 2 characters.",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Please provide a valid email address.",
      });
    }

    // Check if an active user with this email already exists in this restaurant
    const existingUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();

    if (existingUser && existingUser.isActive !== false) {
      throw new ConvexError({
        code: "CONFLICT",
        message: `A user with email ${email} already exists and is active.`,
      });
    }

    // If existing pending invitations exist for this email, revoke them
    const existingInvitations = await ctx.db
      .query("staff_invitations")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();

    for (const inv of existingInvitations) {
      if (inv.status === "pending") {
        await ctx.db.patch("staff_invitations", inv._id, { status: "revoked" });
      }
    }

    const hours =
      args.expiryHours && args.expiryHours >= 1 && args.expiryHours <= 168
        ? args.expiryHours
        : 48; // default 48h
    const now = Date.now();
    const expiresAt = now + hours * 60 * 60 * 1000;

    const token = generateToken();
    const tokenHash = await hashToken(token);

    const invitationId = await ctx.db.insert("staff_invitations", {
      name,
      email,
      role: args.role,
      tokenHash,
      expiresAt,
      status: "pending",
      invitedBy: owner._id,
      createdAt: now,
      restaurantId,
    });

    return {
      invitationId,
      token,
      email,
      role: args.role,
      expiresAt,
    };
  },
});

/**
 * Creates a staff account directly with a secure temporary password. (Owner only)
 * Passwords are fully hashed with Scrypt matching Convex Auth Password provider.
 */
export const createStaffDirect = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    role: v.union(v.literal("manager"), v.literal("staff")),
    temporaryPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, owner);

    const name = args.name.trim();
    const email = args.email.trim().toLowerCase();
    const password = args.temporaryPassword.trim();

    if (name.length < 2) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Name must be at least 2 characters.",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Please provide a valid email address.",
      });
    }

    if (password.length < 8) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Password must be at least 8 characters.",
      });
    }

    // Check if user already exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();

    if (existingUser && existingUser.isActive !== false) {
      throw new ConvexError({
        code: "CONFLICT",
        message: `A user with email ${email} already exists.`,
      });
    }

    // Hash password with Lucia Scrypt (exact same algorithm as @convex-dev/auth/providers/Password)
    const scrypt = new Scrypt();
    const hashedPassword = await scrypt.hash(password);

    let userId = existingUser?._id;
    if (existingUser) {
      await ctx.db.patch("users", existingUser._id, {
        name,
        role: args.role,
        isActive: true,
        restaurantId,
      });
    } else {
      userId = await ctx.db.insert("users", {
        name,
        email,
        role: args.role,
        isActive: true,
        restaurantId,
      });
    }

    // Insert or update authAccounts record for password login
    const existingAccount = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) =>
        q.eq("userId", userId!).eq("provider", "password")
      )
      .first();

    if (existingAccount) {
      await ctx.db.patch("authAccounts", existingAccount._id, {
        secret: hashedPassword,
        providerAccountId: email,
      });
    } else {
      await ctx.db.insert("authAccounts", {
        userId: userId!,
        provider: "password",
        providerAccountId: email,
        secret: hashedPassword,
      });
    }

    return {
      success: true,
      userId: userId!,
      email,
      role: args.role,
    };
  },
});

/**
 * Revoke a pending invitation. (Owner only)
 */
export const revokeInvitation = mutation({
  args: { invitationId: v.id("staff_invitations") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, owner);

    const inv = await ctx.db.get("staff_invitations", args.invitationId);
    if (!inv) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Invitation not found." });
    }

    if (inv.restaurantId && inv.restaurantId !== restaurantId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You cannot revoke an invitation belonging to another restaurant.",
      });
    }

    if (inv.status !== "pending") {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: `Cannot revoke invitation that is already ${inv.status}.`,
      });
    }

    await ctx.db.patch("staff_invitations", args.invitationId, { status: "revoked" });
  },
});

/**
 * Deactivate or reactivate a staff member or manager account. (Owner only)
 */
export const setUserActiveStatus = mutation({
  args: {
    userId: v.id("users"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, owner);

    if (args.userId === owner._id) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "You cannot deactivate your own account.",
      });
    }

    const targetUser = await ctx.db.get("users", args.userId);
    if (!targetUser) {
      throw new ConvexError({ code: "NOT_FOUND", message: "User not found." });
    }

    if (targetUser.restaurantId && targetUser.restaurantId !== restaurantId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You cannot modify accounts belonging to another restaurant.",
      });
    }

    if (targetUser.role === "owner") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Owner accounts cannot be modified here.",
      });
    }

    await ctx.db.patch("users", args.userId, { isActive: args.isActive });
  },
});

/**
 * Change the role of a staff member (manager <-> staff). (Owner only)
 */
export const updateStaffRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("manager"), v.literal("staff")),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, owner);

    const targetUser = await ctx.db.get("users", args.userId);
    if (!targetUser) {
      throw new ConvexError({ code: "NOT_FOUND", message: "User not found." });
    }

    if (targetUser.restaurantId && targetUser.restaurantId !== restaurantId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You cannot modify accounts belonging to another restaurant.",
      });
    }

    if (targetUser.role === "owner") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Cannot change the role of an owner.",
      });
    }

    await ctx.db.patch("users", args.userId, { role: args.role });
  },
});

/**
 * Finalizes the redemption once the authenticated account is created.
 * Atomically validates token hash, verifies pending/redeemed status, non-expired,
 * and email match. Marks invitation redeemed and assigns authorized role & restaurantId.
 */
export const finalizeInvitationRedemption = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in required." });
    }
    const user = await ctx.db.get("users", userId);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "User not found." });
    }

    const token = args.token.trim();
    const tokenHash = await hashToken(token);
    const invitation = await ctx.db
      .query("staff_invitations")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .unique();

    if (!invitation) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Invitation not found." });
    }

    // Idempotent success: if already redeemed by this exact user during signup callback
    if (invitation.status === "redeemed" && invitation.redeemedBy === user._id) {
      return {
        success: true,
        role: invitation.role,
        name: invitation.name,
      };
    }

    if (invitation.status === "revoked") {
      throw new ConvexError({ code: "FORBIDDEN", message: "This invitation has been revoked." });
    }

    if (invitation.status === "redeemed") {
      throw new ConvexError({
        code: "CONFLICT",
        message: "This invitation has already been redeemed by another account.",
      });
    }

    if (Date.now() > invitation.expiresAt) {
      throw new ConvexError({ code: "GONE", message: "This invitation has expired." });
    }

    // Resolve the canonical email for this user
    const authAccount = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) =>
        q.eq("userId", userId).eq("provider", "password")
      )
      .first();

    const canonicalEmail = (
      authAccount?.providerAccountId ??
      user.email ??
      ""
    )
      .trim()
      .toLowerCase();

    if (invitation.email.trim().toLowerCase() !== canonicalEmail) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Invitation was issued for a different email address.",
      });
    }

    const now = Date.now();
    await ctx.db.patch("staff_invitations", invitation._id, {
      status: "redeemed",
      redeemedAt: now,
      redeemedBy: user._id,
    });

    // Assign authorized role, link to correct restaurant, and ensure user is active
    await ctx.db.patch("users", user._id, {
      role: invitation.role,
      isActive: true,
      restaurantId: invitation.restaurantId,
      name: user.name || invitation.name,
    });

    return {
      success: true,
      role: invitation.role,
      name: invitation.name,
    };
  },
});
