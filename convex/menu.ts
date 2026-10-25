import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import type { Id } from "./_generated/dataModel.d.ts";
import {
  requireOwner,
  requireManagerOrOwner,
  getAuthorizedRestaurantId,
  requireAuthenticatedUser,
} from "./authHelpers.js";

// ─── Queries ───────────────────────────────────────────────────────

export const listCategories = query({
  args: {
    restaurantId: v.optional(v.id("restaurants")),
  },
  handler: async (ctx, args) => {
    let targetRestaurantId = args.restaurantId;
    if (!targetRestaurantId) {
      try {
        const user = await requireAuthenticatedUser(ctx);
        if (user.restaurantId) targetRestaurantId = user.restaurantId;
      } catch {
        // Unauthenticated customer query
      }
    }

    if (targetRestaurantId) {
      const cats = await ctx.db
        .query("categories")
        .withIndex("by_restaurant", (q) => q.eq("restaurantId", targetRestaurantId))
        .collect();
      if (cats.length > 0) {
        return cats.sort((a, b) => a.sortOrder - b.sortOrder);
      }
    }

    // Fallback for pre-migration data
    const all = await ctx.db.query("categories").withIndex("by_sort_order").collect();
    return targetRestaurantId
      ? all.filter((c) => !c.restaurantId || c.restaurantId === targetRestaurantId)
      : all;
  },
});

export const listMenuItems = query({
  args: {
    categoryId: v.optional(v.id("categories")),
    includeUnavailable: v.optional(v.boolean()),
    restaurantId: v.optional(v.id("restaurants")),
  },
  handler: async (ctx, args) => {
    let items = args.categoryId
      ? await ctx.db
          .query("menu_items")
          .withIndex("by_category", (q) => q.eq("categoryId", args.categoryId!))
          .collect()
      : args.restaurantId
      ? await ctx.db
          .query("menu_items")
          .withIndex("by_restaurant", (q) => q.eq("restaurantId", args.restaurantId))
          .collect()
      : await ctx.db.query("menu_items").collect();

    if (args.restaurantId) {
      items = items.filter(
        (i) => !i.restaurantId || i.restaurantId === args.restaurantId
      );
    }

    if (!args.includeUnavailable) {
      items = items.filter((i) => i.isAvailable);
    }
    return items.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
  },
});

export const listAddonsForItem = query({
  args: { menuItemId: v.id("menu_items") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("menu_addons")
      .withIndex("by_menu_item", (q) => q.eq("menuItemId", args.menuItemId))
      .collect();
  },
});

export const getMenuWithCategories = query({
  args: {
    restaurantId: v.optional(v.id("restaurants")),
  },
  handler: async (ctx, args) => {
    let targetRestaurantId = args.restaurantId;
    if (!targetRestaurantId) {
      try {
        const user = await requireAuthenticatedUser(ctx);
        if (user.restaurantId) targetRestaurantId = user.restaurantId;
      } catch {
        // Unauthenticated customer query
      }
    }

    let categories = targetRestaurantId
      ? await ctx.db
          .query("categories")
          .withIndex("by_restaurant", (q) => q.eq("restaurantId", targetRestaurantId))
          .collect()
      : await ctx.db.query("categories").withIndex("by_sort_order").collect();

    if (categories.length === 0) {
      categories = await ctx.db.query("categories").withIndex("by_sort_order").collect();
      if (targetRestaurantId) {
        categories = categories.filter(
          (c) => !c.restaurantId || c.restaurantId === targetRestaurantId
        );
      }
    }

    const activeCategories = categories
      .filter((c) => c.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const results = await Promise.all(
      activeCategories.map(async (cat) => {
        const items = await ctx.db
          .query("menu_items")
          .withIndex("by_category", (q) => q.eq("categoryId", cat._id))
          .collect();
        const availableItems = items.filter((i) => i.isAvailable);
        const itemsWithAddons = await Promise.all(
          availableItems.map(async (item) => {
            const addons = await ctx.db
              .query("menu_addons")
              .withIndex("by_menu_item", (q) => q.eq("menuItemId", item._id))
              .collect();
            return { ...item, addons: addons.filter((a) => a.isAvailable) };
          })
        );
        return { ...cat, items: itemsWithAddons };
      })
    );
    return results.filter((c) => c.items.length > 0);
  },
});

export const getMenuItemWithAddons = query({
  args: { menuItemId: v.id("menu_items") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get("menu_items", args.menuItemId);
    if (!item) return null;
    const addons = await ctx.db
      .query("menu_addons")
      .withIndex("by_menu_item", (q) => q.eq("menuItemId", args.menuItemId))
      .collect();
    return { ...item, addons };
  },
});

// ─── Mutations ─────────────────────────────────────────────────────

export const createCategory = mutation({
  args: {
    name: v.string(),
    sortOrder: v.number(),
  },
  handler: async (ctx, args): Promise<Id<"categories">> => {
    const owner = await requireOwner(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, owner);
    return ctx.db.insert("categories", { ...args, isActive: true, restaurantId });
  },
});

export const updateCategory = mutation({
  args: {
    categoryId: v.id("categories"),
    name: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, owner);

    const cat = await ctx.db.get("categories", args.categoryId);
    if (!cat) throw new ConvexError({ code: "NOT_FOUND", message: "Category not found." });
    if (cat.restaurantId && cat.restaurantId !== restaurantId) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Category belongs to another restaurant." });
    }

    const { categoryId, ...updates } = args;
    const clean: Record<string, unknown> = {};
    if (updates.name !== undefined) clean.name = updates.name;
    if (updates.sortOrder !== undefined) clean.sortOrder = updates.sortOrder;
    if (updates.isActive !== undefined) clean.isActive = updates.isActive;
    await ctx.db.patch("categories", categoryId, clean);
  },
});

export const createMenuItem = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    categoryId: v.id("categories"),
    price: v.number(), // in paise
    isVeg: v.boolean(),
    isAvailable: v.boolean(),
    ingredients: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Id<"menu_items">> => {
    const owner = await requireOwner(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, owner);
    return ctx.db.insert("menu_items", { ...args, restaurantId });
  },
});

export const updateMenuItem = mutation({
  args: {
    menuItemId: v.id("menu_items"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    price: v.optional(v.number()),
    isVeg: v.optional(v.boolean()),
    isAvailable: v.optional(v.boolean()),
    ingredients: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Both Owner and authorized Manager can update menu item availability/details
    const user = await requireManagerOrOwner(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, user);

    const item = await ctx.db.get("menu_items", args.menuItemId);
    if (!item) throw new ConvexError({ code: "NOT_FOUND", message: "Menu item not found." });
    if (item.restaurantId && item.restaurantId !== restaurantId) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Item belongs to another restaurant." });
    }

    const { menuItemId, ...updates } = args;
    const clean: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(updates)) {
      if (val !== undefined) clean[k] = val;
    }
    await ctx.db.patch("menu_items", menuItemId, clean);
  },
});

export const deleteMenuItem = mutation({
  args: { menuItemId: v.id("menu_items") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, owner);

    const item = await ctx.db.get("menu_items", args.menuItemId);
    if (!item) throw new ConvexError({ code: "NOT_FOUND", message: "Menu item not found." });
    if (item.restaurantId && item.restaurantId !== restaurantId) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Item belongs to another restaurant." });
    }

    await ctx.db.patch("menu_items", args.menuItemId, { isAvailable: false });
  },
});

export const createAddon = mutation({
  args: {
    menuItemId: v.id("menu_items"),
    name: v.string(),
    price: v.number(), // in paise
  },
  handler: async (ctx, args): Promise<Id<"menu_addons">> => {
    await requireOwner(ctx);
    return ctx.db.insert("menu_addons", { ...args, isAvailable: true });
  },
});

export const updateAddon = mutation({
  args: {
    addonId: v.id("menu_addons"),
    name: v.optional(v.string()),
    price: v.optional(v.number()),
    isAvailable: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireManagerOrOwner(ctx);
    const { addonId, ...updates } = args;
    const clean: Record<string, unknown> = {};
    if (updates.name !== undefined) clean.name = updates.name;
    if (updates.price !== undefined) clean.price = updates.price;
    if (updates.isAvailable !== undefined) clean.isAvailable = updates.isAvailable;
    await ctx.db.patch("menu_addons", addonId, clean);
  },
});

export const deleteAddon = mutation({
  args: { addonId: v.id("menu_addons") },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    await ctx.db.patch("menu_addons", args.addonId, { isAvailable: false });
  },
});
