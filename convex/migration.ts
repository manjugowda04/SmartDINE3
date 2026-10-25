import { mutation } from "./_generated/server.js";
import type { Id } from "./_generated/dataModel.d.ts";

/**
 * Safe, idempotent migration to backfill `restaurantId` on all pre-existing records.
 * Ensures backward compatibility without data loss or reset.
 */
export const backfillMultiRestaurant = mutation({
  args: {},
  handler: async (ctx) => {
    // 1. Ensure at least one default restaurant exists for pre-existing data
    let defaultRestaurant = await ctx.db.query("restaurants").first();
    if (!defaultRestaurant) {
      const defaultId = await ctx.db.insert("restaurants", {
        name: "SmartDine Restaurant",
        address: "Main Branch",
        contactNumber: "+91 98765 43210",
        isActive: true,
        createdAt: Date.now(),
      });
      defaultRestaurant = (await ctx.db.get("restaurants", defaultId))!;
    }

    const restaurantId: Id<"restaurants"> = defaultRestaurant._id;
    let updatedCount = 0;

    // 2. Backfill Users
    const users = await ctx.db.query("users").collect();
    for (const u of users) {
      if (!u.restaurantId && (u.role === "owner" || u.role === "manager" || u.role === "staff")) {
        await ctx.db.patch("users", u._id, { restaurantId });
        updatedCount++;
      }
    }

    // 3. Backfill Tables
    const tables = await ctx.db.query("restaurant_tables").collect();
    for (const t of tables) {
      if (!t.restaurantId) {
        await ctx.db.patch("restaurant_tables", t._id, { restaurantId });
        updatedCount++;
      }
    }

    // 4. Backfill Sessions
    const sessions = await ctx.db.query("table_sessions").collect();
    for (const s of sessions) {
      if (!s.restaurantId) {
        await ctx.db.patch("table_sessions", s._id, { restaurantId });
        updatedCount++;
      }
    }

    // 5. Backfill Categories
    const categories = await ctx.db.query("categories").collect();
    for (const c of categories) {
      if (!c.restaurantId) {
        await ctx.db.patch("categories", c._id, { restaurantId });
        updatedCount++;
      }
    }

    // 6. Backfill Menu Items
    const menuItems = await ctx.db.query("menu_items").collect();
    for (const m of menuItems) {
      if (!m.restaurantId) {
        await ctx.db.patch("menu_items", m._id, { restaurantId });
        updatedCount++;
      }
    }

    // 7. Backfill Orders
    const orders = await ctx.db.query("orders").collect();
    for (const o of orders) {
      if (!o.restaurantId) {
        await ctx.db.patch("orders", o._id, { restaurantId });
        updatedCount++;
      }
    }

    // 8. Backfill Bills
    const bills = await ctx.db.query("bills").collect();
    for (const b of bills) {
      if (!b.restaurantId) {
        await ctx.db.patch("bills", b._id, { restaurantId });
        updatedCount++;
      }
    }

    // 9. Backfill Payments
    const payments = await ctx.db.query("payments").collect();
    for (const p of payments) {
      if (!p.restaurantId) {
        await ctx.db.patch("payments", p._id, { restaurantId });
        updatedCount++;
      }
    }

    // 10. Backfill Waiter Requests
    const waiterRequests = await ctx.db.query("waiter_requests").collect();
    for (const w of waiterRequests) {
      if (!w.restaurantId) {
        await ctx.db.patch("waiter_requests", w._id, { restaurantId });
        updatedCount++;
      }
    }

    // 11. Backfill Staff Invitations
    const invitations = await ctx.db.query("staff_invitations").collect();
    for (const inv of invitations) {
      if (!inv.restaurantId) {
        await ctx.db.patch("staff_invitations", inv._id, { restaurantId });
        updatedCount++;
      }
    }

    // 12. Backfill Sequences
    const sequences = await ctx.db.query("sequences").collect();
    for (const seq of sequences) {
      if (!seq.restaurantId) {
        await ctx.db.patch("sequences", seq._id, { restaurantId });
        updatedCount++;
      }
    }

    // 13. Backfill Daily Counts
    const dailyCounts = await ctx.db.query("daily_customer_counts").collect();
    for (const d of dailyCounts) {
      if (!d.restaurantId) {
        await ctx.db.patch("daily_customer_counts", d._id, { restaurantId });
        updatedCount++;
      }
    }

    return {
      success: true,
      defaultRestaurantId: restaurantId,
      updatedCount,
    };
  },
});
