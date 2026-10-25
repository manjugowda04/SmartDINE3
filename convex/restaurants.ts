import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireOwner, requireAuthenticatedUser } from "./authHelpers.js";
import { validateAndRedeemMasterCode } from "./masterCode.js";

// ─── Queries ───────────────────────────────────────────────────────

/**
 * Returns the current restaurant profile for the authenticated
 * management user.
 *
 * An unlinked user must not receive another restaurant's profile.
 */
export const getCurrentRestaurant = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthenticatedUser(ctx);

    // Never fall back to the first restaurant.
    if (!user.restaurantId) {
      return null;
    }

    const restaurant = await ctx.db.get(
      "restaurants",
      user.restaurantId
    );

    if (!restaurant) {
      return null;
    }

    let logoUrl = restaurant.logoUrl;

    if (restaurant.logoStorageId) {
      const storageUrl = await ctx.storage.getUrl(
        restaurant.logoStorageId
      );

      if (storageUrl) {
        logoUrl = storageUrl;
      }
    }

    return {
      ...restaurant,
      logoUrl,
    };
  },
});

/**
 * Returns public restaurant branding for a customer table view.
 */
export const getRestaurantPublicInfo = query({
  args: {
    restaurantId: v.id("restaurants"),
  },
  handler: async (ctx, args) => {
    const restaurant = await ctx.db.get(
      "restaurants",
      args.restaurantId
    );

    if (!restaurant || !restaurant.isActive) {
      return null;
    }

    let logoUrl = restaurant.logoUrl;

    if (restaurant.logoStorageId) {
      const storageUrl = await ctx.storage.getUrl(
        restaurant.logoStorageId
      );

      if (storageUrl) {
        logoUrl = storageUrl;
      }
    }

    return {
      _id: restaurant._id,
      name: restaurant.name,
      address: restaurant.address,
      contactNumber: restaurant.contactNumber,
      logoUrl,
      gstEnabled: !!restaurant.gstEnabled,
      gstPercentage: restaurant.gstPercentage ?? 0,
      serviceChargeEnabled: !!restaurant.serviceChargeEnabled,
      serviceChargePercentage: restaurant.serviceChargePercentage ?? 0,
      serviceChargeBasis: restaurant.serviceChargeBasis || "subtotal",
    };
  },
});

// ─── Mutations ─────────────────────────────────────────────────────

/**
 * Registers a new independent restaurant using a developer-issued
 * single-use Master Code.
 *
 * This mutation is retained because existing tests use it.
 */
export const registerRestaurantWithMasterCode = mutation({
  args: {
    masterCode: v.string(),
    restaurantName: v.string(),
    restaurantAddress: v.string(),
    contactNumber: v.string(),
  },

  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (userId === null) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message:
          "Authentication required to complete restaurant registration.",
      });
    }

    const user = await ctx.db.get("users", userId);

    if (!user) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "User account not found.",
      });
    }

    const name = args.restaurantName.trim();
    const address = args.restaurantAddress.trim();
    const contact = args.contactNumber.trim();

    if (name.length < 2) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Restaurant name must be at least 2 characters.",
      });
    }

    if (user.restaurantId) {
      const existingRestaurant = await ctx.db.get(
        "restaurants",
        user.restaurantId
      );

      if (existingRestaurant) {
        throw new ConvexError({
          code: "CONFLICT",
          message:
            "Your account is already associated with a restaurant.",
        });
      }
    }

    // Validate and redeem the Master Code within this mutation.
    const userEmail = user.email || String(userId);

    await validateAndRedeemMasterCode(
      ctx,
      args.masterCode,
      userEmail
    );

    // Create the restaurant.
    const restaurantId = await ctx.db.insert("restaurants", {
      name,
      address: address || undefined,
      contactNumber: contact || undefined,
      isActive: true,
      createdAt: Date.now(),
    });

    // Link the user as owner.
    await ctx.db.patch("users", userId, {
      role: "owner",
      isActive: true,
      restaurantId,
      name: user.name || `${name} Owner`,
    });

    // Initialize restaurant-specific sequences.
    await ctx.db.insert("sequences", {
      name: "session_number",
      value: 0,
      restaurantId,
    });

    await ctx.db.insert("sequences", {
      name: "order_number",
      value: 1000,
      restaurantId,
    });

    // Create the initial table with a random token.
    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

    const initialToken = Array.from(
      { length: 24 },
      () => chars[Math.floor(Math.random() * chars.length)]
    ).join("");

    await ctx.db.insert("restaurant_tables", {
      tableNumber: 1,
      name: "Table 1",
      token: initialToken,
      status: "available",
      isActive: true,
      capacity: 4,
      restaurantId,
    });

    // Record the registration in the audit log.
    await ctx.db.insert("audit_logs", {
      userId,
      action: "register_restaurant",
      resourceType: "restaurants",
      resourceId: restaurantId,
      details: `Registered restaurant "${name}"`,
      createdAt: new Date().toISOString(),
      restaurantId,
    });

    return {
      success: true,
      restaurantId,
      restaurantName: name,
    };
  },
});

/**
 * Updates restaurant profile and branding. Owner only.
 */
export const updateRestaurantProfile = mutation({
  args: {
    name: v.optional(v.string()),
    address: v.optional(v.string()),
    contactNumber: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
  },

  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);

    if (!owner.restaurantId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "No restaurant associated with your account.",
      });
    }

    const updates: Record<string, unknown> = {};

    if (args.name !== undefined) {
      const name = args.name.trim();

      if (name.length < 2) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message: "Restaurant name must be at least 2 characters.",
        });
      }

      updates.name = name;
    }

    if (args.address !== undefined) {
      updates.address = args.address.trim();
    }

    if (args.contactNumber !== undefined) {
      updates.contactNumber = args.contactNumber.trim();
    }

    if (args.logoStorageId !== undefined) {
      updates.logoStorageId = args.logoStorageId;

      const url = await ctx.storage.getUrl(
        args.logoStorageId
      );

      if (url) {
        updates.logoUrl = url;
      }
    }

    await ctx.db.patch("restaurants", owner.restaurantId, updates);

    await ctx.db.insert("audit_logs", {
      userId: owner._id,
      action: "update_profile",
      resourceType: "restaurants",
      resourceId: owner.restaurantId,
      details: "Updated restaurant profile branding",
      createdAt: new Date().toISOString(),
      restaurantId: owner.restaurantId,
    });
  },
});

/**
 * Generates an upload URL for the restaurant logo. Owner only.
 */
export const generateUploadUrl = mutation({
  args: {},

  handler: async (ctx) => {
    await requireOwner(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Updates restaurant GST and service charge settings. Owner only.
 */
export const updateTaxAndServiceCharges = mutation({
  args: {
    gstEnabled: v.boolean(),
    gstPercentage: v.number(),
    serviceChargeEnabled: v.boolean(),
    serviceChargePercentage: v.number(),
    serviceChargeBasis: v.union(
      v.literal("subtotal"),
      v.literal("subtotal_with_gst")
    ),
  },

  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);

    if (!owner.restaurantId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "No restaurant associated with your account.",
      });
    }

    if (
      isNaN(args.gstPercentage) ||
      args.gstPercentage < 0 ||
      args.gstPercentage > 100
    ) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "GST percentage must be a number between 0 and 100.",
      });
    }

    if (
      isNaN(args.serviceChargePercentage) ||
      args.serviceChargePercentage < 0 ||
      args.serviceChargePercentage > 100
    ) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Service charge percentage must be a number between 0 and 100.",
      });
    }

    const gstPercentage = Math.round(args.gstPercentage * 100) / 100;
    const serviceChargePercentage =
      Math.round(args.serviceChargePercentage * 100) / 100;

    await ctx.db.patch("restaurants", owner.restaurantId, {
      gstEnabled: args.gstEnabled,
      gstPercentage,
      serviceChargeEnabled: args.serviceChargeEnabled,
      serviceChargePercentage,
      serviceChargeBasis: args.serviceChargeBasis,
    });

    await ctx.db.insert("audit_logs", {
      userId: owner._id,
      action: "update_tax_settings",
      resourceType: "restaurants",
      resourceId: owner.restaurantId,
      details: `Updated tax settings: GST ${args.gstEnabled ? `${gstPercentage}%` : "Off"}, Service Charge ${args.serviceChargeEnabled ? `${serviceChargePercentage}% (${args.serviceChargeBasis})` : "Off"}`,
      createdAt: new Date().toISOString(),
      restaurantId: owner.restaurantId,
    });

    return {
      success: true,
      gstEnabled: args.gstEnabled,
      gstPercentage,
      serviceChargeEnabled: args.serviceChargeEnabled,
      serviceChargePercentage,
      serviceChargeBasis: args.serviceChargeBasis,
    };
  },
});
