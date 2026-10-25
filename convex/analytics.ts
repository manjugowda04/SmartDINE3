import { v } from "convex/values";
import { query } from "./_generated/server.js";
import { requireManagerOrOwner, getAuthorizedRestaurantId } from "./authHelpers.js";

export const getDailyCounts = query({
  args: { days: v.number() },
  handler: async (ctx, args) => {
    const user = await requireManagerOrOwner(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, user);

    const results = [];
    const today = new Date();
    for (let i = 0; i < args.days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);

      const rec = await ctx.db
        .query("daily_customer_counts")
        .withIndex("by_restaurant_date", (q) =>
          q.eq("restaurantId", restaurantId).eq("date", dateStr)
        )
        .first();

      // Fallback for pre-migration data
      const legacyRec = rec
        ? rec
        : await ctx.db
            .query("daily_customer_counts")
            .withIndex("by_date", (q) => q.eq("date", dateStr))
            .first();

      results.push({ date: dateStr, count: legacyRec?.count ?? 0 });
    }
    return results.reverse();
  },
});

export const getAnalytics = query({
  args: { days: v.number() },
  handler: async (ctx, args) => {
    const user = await requireManagerOrOwner(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, user);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - args.days);
    const cutoffIso = cutoff.toISOString();

    // All orders in range for this restaurant
    const allOrders = (await ctx.db.query("orders").collect()).filter(
      (o) => !o.restaurantId || o.restaurantId === restaurantId
    );

    const rangeOrders = allOrders.filter(
      (o) =>
        o.placedAt >= cutoffIso &&
        o.status !== "cancelled" &&
        o.status !== "rejected"
    );
    const cancelledInRange = allOrders.filter(
      (o) =>
        o.placedAt >= cutoffIso &&
        (o.status === "cancelled" || o.status === "rejected")
    );

    const totalRevenue = rangeOrders.reduce((s, o) => s + o.total, 0);
    const totalOrders = rangeOrders.length;

    // Customer counts
    const customerCounts = (
      await ctx.db.query("daily_customer_counts").collect()
    ).filter((c) => !c.restaurantId || c.restaurantId === restaurantId);

    const rangeCustomers = customerCounts
      .filter((c) => c.date >= cutoffIso.slice(0, 10))
      .reduce((s, c) => s + c.count, 0);

    // Item counts
    const itemCounts: Record<
      string,
      { name: string; count: number; revenue: number }
    > = {};
    for (const order of rangeOrders) {
      const items = await ctx.db
        .query("order_items")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect();
      for (const item of items) {
        const key = item.menuItemId;
        if (!itemCounts[key]) {
          itemCounts[key] = { name: item.menuItemName, count: 0, revenue: 0 };
        }
        itemCounts[key].count += item.quantity;
        itemCounts[key].revenue += item.lineTotal;
      }
    }

    const sortedItems = Object.values(itemCounts).sort(
      (a, b) => b.count - a.count
    );
    const top5 = sortedItems.slice(0, 5);
    const least5 = [...sortedItems]
      .sort((a, b) => a.count - b.count)
      .slice(0, 5);

    // Active tables
    const activeSessions = (
      await ctx.db
        .query("table_sessions")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .collect()
    ).filter((s) => !s.restaurantId || s.restaurantId === restaurantId);

    // Payment statistics
    const allPayments = (await ctx.db.query("payments").collect()).filter(
      (p) => !p.restaurantId || p.restaurantId === restaurantId
    );
    const rangePayments = allPayments.filter(
      (p) => p.createdAt >= cutoffIso && p.status === "paid"
    );
    const paymentByMethod = {
      upi: rangePayments
        .filter((p) => p.method === "upi")
        .reduce((s, p) => s + p.amount, 0),
      card: rangePayments
        .filter((p) => p.method === "card")
        .reduce((s, p) => s + p.amount, 0),
      cash: rangePayments
        .filter((p) => p.method === "cash")
        .reduce((s, p) => s + p.amount, 0),
    };

    return {
      totalRevenue,
      totalOrders,
      totalCustomers: rangeCustomers,
      activeTables: activeSessions.length,
      cancelledOrders: cancelledInRange.length,
      top5Items: top5,
      least5Items: least5,
      paymentByMethod,
      dailyCustomers: customerCounts
        .filter((c) => c.date >= cutoffIso.slice(0, 10))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  },
});

export const getDailyRevenue = query({
  args: { days: v.number() },
  handler: async (ctx, args) => {
    const user = await requireManagerOrOwner(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, user);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - args.days);
    const cutoffIso = cutoff.toISOString();

    const allOrders = (await ctx.db.query("orders").collect()).filter(
      (o) => !o.restaurantId || o.restaurantId === restaurantId
    );
    const rangeOrders = allOrders.filter(
      (o) =>
        o.placedAt >= cutoffIso &&
        o.status !== "cancelled" &&
        o.status !== "rejected"
    );

    // Group by date
    const byDate: Record<string, number> = {};
    for (const order of rangeOrders) {
      const date = order.placedAt.slice(0, 10);
      byDate[date] = (byDate[date] ?? 0) + order.total;
    }

    const results = [];
    const today = new Date();
    for (let i = args.days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      results.push({ date: dateStr, revenue: byDate[dateStr] ?? 0 });
    }
    return results;
  },
});
