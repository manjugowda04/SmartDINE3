import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import type { MutationCtx } from "./_generated/server.js";
import type { Id } from "./_generated/dataModel.d.ts";
import { requireStaffOrAbove, getAuthorizedRestaurantId } from "./authHelpers.js";
import { syncBillForSession } from "./billingCalculations.js";

const ORDER_CANCEL_WINDOW_MS = 3 * 60 * 1000; // 3 minutes

// ─── Queries ───────────────────────────────────────────────────────

export const getOrdersForSession = query({
  args: { sessionId: v.id("table_sessions") },
  handler: async (ctx, args) => {
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .collect();

    return Promise.all(
      orders.map(async (order) => {
        const items = await ctx.db
          .query("order_items")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();
        const itemsWithAddons = await Promise.all(
          items.map(async (item) => {
            const addons = await ctx.db
              .query("order_item_addons")
              .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
              .collect();
            return { ...item, addons };
          })
        );
        return {
          ...order,
          customerName: order.customerName || "Guest",
          items: itemsWithAddons,
        };
      })
    );
  },
});

export const getOrderById = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get("orders", args.orderId);
    if (!order) return null;
    const items = await ctx.db
      .query("order_items")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();
    const itemsWithAddons = await Promise.all(
      items.map(async (item) => {
        const addons = await ctx.db
          .query("order_item_addons")
          .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
          .collect();
        return { ...item, addons };
      })
    );
    const table = await ctx.db.get("restaurant_tables", order.tableId);
    const session = await ctx.db.get("table_sessions", order.sessionId);
    return {
      ...order,
      customerName: order.customerName || session?.customerNames?.[0] || "Guest",
      sessionNumber: session?.sessionNumber ?? "—",
      session: session ? { sessionNumber: session.sessionNumber } : null,
      items: itemsWithAddons,
      table,
    };
  },
});

export const listActiveOrders = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireStaffOrAbove(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, user);

    const activeStatuses = ["placed", "accepted", "preparing", "ready"] as const;
    const allOrders = await Promise.all(
      activeStatuses.map((status) =>
        ctx.db
          .query("orders")
          .withIndex("by_status", (q) => q.eq("status", status))
          .collect()
      )
    );

    const filtered = allOrders
      .flat()
      .filter((o) => o.restaurantId === restaurantId)
      .sort(
        (a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime()
      );

    return Promise.all(
      filtered.map(async (order) => {
        const table = await ctx.db.get("restaurant_tables", order.tableId);
        const session = await ctx.db.get("table_sessions", order.sessionId);
        const items = await ctx.db
          .query("order_items")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();
        const itemsWithAddons = await Promise.all(
          items.map(async (item) => {
            const addons = await ctx.db
              .query("order_item_addons")
              .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
              .collect();
            return { ...item, addons };
          })
        );
        return {
          ...order,
          customerName: order.customerName || session?.customerNames?.[0] || "Guest",
          sessionNumber: session?.sessionNumber ?? "—",
          session: session ? { sessionNumber: session.sessionNumber } : null,
          items: itemsWithAddons,
          table,
        };
      })
    );
  },
});

export const listAllOrdersForManagement = query({
  args: {
    sessionId: v.optional(v.id("table_sessions")),
  },
  handler: async (ctx, args) => {
    const user = await requireStaffOrAbove(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, user);

    let orders;
    if (args.sessionId) {
      orders = await ctx.db
        .query("orders")
        .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId!))
        .order("desc")
        .collect();
    } else {
      orders = await ctx.db
        .query("orders")
        .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
        .order("desc")
        .take(100);
    }

    return Promise.all(
      orders.map(async (order) => {
        const table = await ctx.db.get("restaurant_tables", order.tableId);
        const session = await ctx.db.get("table_sessions", order.sessionId);
        const items = await ctx.db
          .query("order_items")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();
        const itemsWithAddons = await Promise.all(
          items.map(async (item) => {
            const addons = await ctx.db
              .query("order_item_addons")
              .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
              .collect();
            return { ...item, addons };
          })
        );
        return {
          ...order,
          customerName: order.customerName || session?.customerNames?.[0] || "Guest",
          sessionNumber: session?.sessionNumber ?? "—",
          session: session ? { sessionNumber: session.sessionNumber } : null,
          items: itemsWithAddons,
          table,
        };
      })
    );
  },
});

// ─── Mutations ─────────────────────────────────────────────────────

async function getNextOrderNumber(
  ctx: MutationCtx,
  restaurantId?: Id<"restaurants">
): Promise<string> {
  let seq = null;
  if (restaurantId) {
    seq = await ctx.db
      .query("sequences")
      .withIndex("by_restaurant_name", (q) =>
        q.eq("restaurantId", restaurantId).eq("name", "order_number")
      )
      .first();
  }
  if (!seq) {
    seq = await ctx.db
      .query("sequences")
      .withIndex("by_name", (q) => q.eq("name", "order_number"))
      .first();
  }

  const next = seq ? seq.value + 1 : 1001;
  if (seq) {
    await ctx.db.patch("sequences", seq._id, { value: next, restaurantId });
  } else {
    await ctx.db.insert("sequences", { name: "order_number", value: next, restaurantId });
  }
  return `ORD-${next}`;
}

export const placeOrder = mutation({
  args: {
    sessionId: v.id("table_sessions"),
    customerName: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ orderId: Id<"orders">; orderNumber: string }> => {
    // Validate session
    const session = await ctx.db.get("table_sessions", args.sessionId);
    if (!session || session.status !== "active") {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Session is not active" });
    }

    const table = await ctx.db.get("restaurant_tables", session.tableId);
    if (!table || !table.isActive) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Table is not available" });
    }

    const restaurantId = session.restaurantId || table.restaurantId;

    // Load cart
    const cartItems = await ctx.db
      .query("cart_items")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    if (cartItems.length === 0) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Cart is empty" });
    }

    // Validate availability
    for (const cartItem of cartItems) {
      const menuItem = await ctx.db.get("menu_items", cartItem.menuItemId);
      if (!menuItem || !menuItem.isAvailable) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message: `"${cartItem.menuItemName}" is no longer available`,
        });
      }
      if (cartItem.quantity < 1) {
        throw new ConvexError({ code: "BAD_REQUEST", message: "Invalid quantity" });
      }
    }

    let subtotal = 0;
    const cartItemsWithAddons = await Promise.all(
      cartItems.map(async (item) => {
        const addons = await ctx.db
          .query("cart_item_addons")
          .withIndex("by_cart_item", (q) => q.eq("cartItemId", item._id))
          .collect();

        const validatedAddons: Array<{ addonId: Id<"menu_addons">; addonName: string; addonPrice: number }> = [];
        for (const ca of addons) {
          const addon = await ctx.db.get("menu_addons", ca.addonId);
          if (addon && addon.isAvailable) {
            validatedAddons.push({
              addonId: ca.addonId,
              addonName: addon.name,
              addonPrice: addon.price,
            });
          }
        }

        const menuItem = (await ctx.db.get("menu_items", item.menuItemId))!;
        const addonTotal = validatedAddons.reduce((s, a) => s + a.addonPrice, 0);
        const lineTotal = (menuItem.price + addonTotal) * item.quantity;
        subtotal += lineTotal;

        return { cartItem: item, menuItem, addons: validatedAddons, lineTotal };
      })
    );

    const now = new Date();
    const orderNumber = await getNextOrderNumber(ctx, restaurantId);
    const cancellationDeadline = new Date(now.getTime() + ORDER_CANCEL_WINDOW_MS).toISOString();

    const resolvedCustomerName =
      args.customerName?.trim() || session.customerNames?.[0] || "Guest";

    const orderId = await ctx.db.insert("orders", {
      sessionId: args.sessionId,
      tableId: table._id,
      orderNumber,
      customerName: resolvedCustomerName,
      status: "placed",
      subtotal,
      total: subtotal,
      placedAt: now.toISOString(),
      cancellationDeadline,
      restaurantId,
      customerPhone: session.phoneNumber,
    });

    for (const { cartItem, menuItem, addons, lineTotal } of cartItemsWithAddons) {
      const orderItemId = await ctx.db.insert("order_items", {
        orderId,
        menuItemId: cartItem.menuItemId,
        menuItemName: menuItem.name,
        basePrice: menuItem.price,
        quantity: cartItem.quantity,
        specialInstructions: cartItem.specialInstructions,
        lineTotal,
      });

      for (const addon of addons) {
        await ctx.db.insert("order_item_addons", {
          orderItemId,
          addonId: addon.addonId,
          addonName: addon.addonName,
          addonPrice: addon.addonPrice,
        });
      }
    }

    // Update bill with GST and service charges
    await syncBillForSession(ctx, args.sessionId);

    // Clear cart
    for (const cartItem of cartItems) {
      const cartAddons = await ctx.db
        .query("cart_item_addons")
        .withIndex("by_cart_item", (q) => q.eq("cartItemId", cartItem._id))
        .collect();
      for (const ca of cartAddons) {
        await ctx.db.delete("cart_item_addons", ca._id);
      }
      await ctx.db.delete("cart_items", cartItem._id);
    }

    return { orderId, orderNumber };
  },
});

export const cancelOrder = mutation({
  args: {
    orderId: v.id("orders"),
    sessionId: v.id("table_sessions"),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get("orders", args.orderId);
    if (!order) throw new ConvexError({ code: "NOT_FOUND", message: "Order not found" });
    if (order.sessionId !== args.sessionId) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Order does not belong to this session" });
    }

    if (["accepted", "preparing", "ready", "served", "cancelled", "rejected"].includes(order.status)) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: order.status === "accepted" || order.status === "preparing"
          ? "Cannot cancel — order has already been accepted by the kitchen"
          : `Cannot cancel order with status: ${order.status}`,
      });
    }

    const now = new Date();
    const deadline = new Date(order.cancellationDeadline);
    if (now > deadline) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Cancellation window has expired (3-minute limit)",
      });
    }

    const nowIso = now.toISOString();
    await ctx.db.patch("orders", args.orderId, {
      status: "cancelled",
      cancelledAt: nowIso,
    });

    await syncBillForSession(ctx, args.sessionId);
  },
});

export const updateOrderStatus = mutation({
  args: {
    orderId: v.id("orders"),
    status: v.union(
      v.literal("accepted"),
      v.literal("preparing"),
      v.literal("ready"),
      v.literal("served"),
      v.literal("rejected")
    ),
    rejectionReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireStaffOrAbove(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, user);

    const order = await ctx.db.get("orders", args.orderId);
    if (!order) throw new ConvexError({ code: "NOT_FOUND", message: "Order not found" });

    if (order.restaurantId && order.restaurantId !== restaurantId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Order belongs to another restaurant.",
      });
    }

    // ── Workflow: placed → accepted | rejected
    //              accepted → ready   (Preparing step removed from UI workflow)
    //              preparing → ready  (legacy records: kept for historical compat)
    //              ready → served
    //
    // CRITICAL: once an order is accepted it CANNOT be rejected or cancelled
    // through any path. This is enforced here in the backend.
    const validTransitions: Record<string, string[]> = {
      placed: ["accepted", "rejected"],
      accepted: ["ready"],        // direct: no Preparing step
      preparing: ["ready"],       // legacy compatibility only
      ready: ["served"],
    };
    const allowed = validTransitions[order.status] ?? [];
    if (!allowed.includes(args.status)) {
      // Give a specific, actionable message for the most common illegal attempt.
      if (
        args.status === "rejected" &&
        ["accepted", "preparing", "ready", "served"].includes(order.status)
      ) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message: "Accepted orders cannot be rejected or cancelled.",
        });
      }
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: `Cannot transition from ${order.status} to ${args.status}`,
      });
    }

    const updates: Record<string, unknown> = {
      status: args.status,
      updatedBy: user._id,
    };
    if (args.status === "rejected" && args.rejectionReason) {
      updates.rejectionReason = args.rejectionReason;
    }

    if (args.status === "rejected") {
      await syncBillForSession(ctx, order.sessionId);
    }

    await ctx.db.patch("orders", args.orderId, updates);
  },
});
