import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import type { MutationCtx } from "./_generated/server.js";
import type { Id } from "./_generated/dataModel.d.ts";
import { requireOwner, requireStaffOrAbove, getAuthorizedRestaurantId } from "./authHelpers.js";

async function getNextSequence(
  ctx: MutationCtx,
  name: string,
  prefix: string,
  restaurantId?: Id<"restaurants">,
  width = 4
): Promise<string> {
  let seq = null;
  if (restaurantId) {
    seq = await ctx.db
      .query("sequences")
      .withIndex("by_restaurant_name", (q) =>
        q.eq("restaurantId", restaurantId).eq("name", name)
      )
      .first();
  }
  if (!seq) {
    seq = await ctx.db
      .query("sequences")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
  }

  const next = seq ? seq.value + 1 : 1;
  if (seq) {
    await ctx.db.patch("sequences", seq._id, { value: next, restaurantId });
  } else {
    await ctx.db.insert("sequences", { name, value: next, restaurantId });
  }
  return `${prefix}${String(next).padStart(width, "0")}`;
}

export const generateTableToken = (): string => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

// ─── Queries ───────────────────────────────────────────────────────

export const listTables = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireStaffOrAbove(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, user);

    const tables = await ctx.db
      .query("restaurant_tables")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect();

    return tables.sort((a, b) => a.tableNumber - b.tableNumber);
  },
});

export const getTableByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const table = await ctx.db
      .query("restaurant_tables")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!table) return null;

    const restaurant = table.restaurantId
      ? await ctx.db.get("restaurants", table.restaurantId)
      : null;

    let logoUrl = restaurant?.logoUrl;
    if (restaurant?.logoStorageId) {
      const storageUrl = await ctx.storage.getUrl(restaurant.logoStorageId);
      if (storageUrl) logoUrl = storageUrl;
    }

    return {
      ...table,
      restaurant: restaurant
        ? {
            _id: restaurant._id,
            name: restaurant.name,
            address: restaurant.address,
            contactNumber: restaurant.contactNumber,
            logoUrl,
          }
        : null,
    };
  },
});

export const getTableById = query({
  args: { tableId: v.id("restaurant_tables") },
  handler: async (ctx, args) => {
    // Staff-only: prevents anonymous callers from enumerating table IDs.
    await requireStaffOrAbove(ctx);
    return await ctx.db.get("restaurant_tables", args.tableId);
  },
});

export const getTableWithSession = query({
  args: { tableId: v.id("restaurant_tables") },
  handler: async (ctx, args) => {
    // Staff-only: this endpoint returns session IDs and bill totals that must
    // not be exposed to unauthenticated customers.
    await requireStaffOrAbove(ctx);
    const table = await ctx.db.get("restaurant_tables", args.tableId);
    if (!table) return null;
    const session = await ctx.db
      .query("table_sessions")
      .withIndex("by_table_active", (q) =>
        q.eq("tableId", args.tableId).eq("status", "active")
      )
      .first();
    if (!session) return { table, session: null, bill: null };
    const bill = await ctx.db
      .query("bills")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .first();
    return { table, session, bill };
  },
});

// ─── Mutations ─────────────────────────────────────────────────────

export const createTable = mutation({
  args: {
    tableNumber: v.number(),
    name: v.string(),
    capacity: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Id<"restaurant_tables">> => {
    const owner = await requireOwner(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, owner);

    // Ensure table number is unique within this restaurant
    const existing = await ctx.db
      .query("restaurant_tables")
      .withIndex("by_table_number", (q) => q.eq("tableNumber", args.tableNumber))
      .collect();

    const duplicate = existing.find(
      (t) => !t.restaurantId || t.restaurantId === restaurantId
    );
    if (duplicate) {
      throw new ConvexError({
        code: "CONFLICT",
        message: `Table ${args.tableNumber} already exists in your restaurant.`,
      });
    }

    const token = generateTableToken();
    return await ctx.db.insert("restaurant_tables", {
      tableNumber: args.tableNumber,
      name: args.name,
      token,
      status: "available",
      isActive: true,
      capacity: args.capacity,
      restaurantId,
    });
  },
});

export const updateTable = mutation({
  args: {
    tableId: v.id("restaurant_tables"),
    name: v.optional(v.string()),
    capacity: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, owner);

    const table = await ctx.db.get("restaurant_tables", args.tableId);
    if (!table) throw new ConvexError({ code: "NOT_FOUND", message: "Table not found" });

    if (table.restaurantId && table.restaurantId !== restaurantId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You cannot modify tables from another restaurant.",
      });
    }

    const { tableId, ...updates } = args;
    const clean: Record<string, unknown> = {};
    if (updates.name !== undefined) clean.name = updates.name;
    if (updates.capacity !== undefined) clean.capacity = updates.capacity;
    if (updates.isActive !== undefined) clean.isActive = updates.isActive;
    await ctx.db.patch("restaurant_tables", tableId, clean);
  },
});

export const regenerateTableToken = mutation({
  args: { tableId: v.id("restaurant_tables") },
  handler: async (ctx, args): Promise<string> => {
    const owner = await requireOwner(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, owner);

    const table = await ctx.db.get("restaurant_tables", args.tableId);
    if (!table) throw new ConvexError({ code: "NOT_FOUND", message: "Table not found" });

    if (table.restaurantId && table.restaurantId !== restaurantId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You cannot modify tables from another restaurant.",
      });
    }

    // Only regenerate if table has no active session
    const activeSession = await ctx.db
      .query("table_sessions")
      .withIndex("by_table_active", (q) =>
        q.eq("tableId", args.tableId).eq("status", "active")
      )
      .first();
    if (activeSession) {
      throw new ConvexError({ code: "CONFLICT", message: "Cannot regenerate QR while table is occupied" });
    }
    const token = generateTableToken();
    await ctx.db.patch("restaurant_tables", args.tableId, { token });
    return token;
  },
});

// Helper functions
export const getNextOrderNumber = async (
  ctx: MutationCtx,
  restaurantId?: Id<"restaurants">
) => getNextSequence(ctx, "order_number", "ORD-", restaurantId);

export const getNextSessionNumber = async (
  ctx: MutationCtx,
  restaurantId?: Id<"restaurants">
) => getNextSequence(ctx, "session_number", "SES-", restaurantId);
