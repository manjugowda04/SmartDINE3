/// <reference types="vite/client" />
import { describe, it, expect, beforeEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema.js";
import { api } from "./_generated/api.js";
import { modules } from "./test.setup.js";

describe("Step 1 Backend: Restaurant UPI Settings & Payment Verification Requests", () => {
  beforeEach(() => {
    process.env.DEVELOPER_MASTER_CODE = "DEV-MASTER-2026-SECURE";
  });

  async function setupRestaurantWithRoles(t: ReturnType<typeof convexTest>) {
    return t.run(async (ctx) => {
      const restId = await ctx.db.insert("restaurants", {
        name: "Spice Garden",
        isActive: true,
        createdAt: Date.now(),
      });

      const ownerId = await ctx.db.insert("users", {
        email: `owner-${Date.now()}@spice.com`,
        name: "Owner User",
        role: "owner",
        isActive: true,
        restaurantId: restId,
      });

      const managerId = await ctx.db.insert("users", {
        email: `manager-${Date.now()}@spice.com`,
        name: "Manager User",
        role: "manager",
        isActive: true,
        restaurantId: restId,
      });

      const staffId = await ctx.db.insert("users", {
        email: `staff-${Date.now()}@spice.com`,
        name: "Staff User",
        role: "staff",
        isActive: true,
        restaurantId: restId,
      });

      const tableId = await ctx.db.insert("restaurant_tables", {
        tableNumber: 1,
        name: "Table 1",
        token: `tok-${Date.now()}`,
        status: "available",
        isActive: true,
        restaurantId: restId,
      });

      return { restId, ownerId, managerId, staffId, tableId };
    });
  }

  it("1. Owner and Manager can configure UPI settings; Staff is rejected", async () => {
    const t = convexTest(schema, modules);
    const { ownerId, managerId, staffId, restId } = await setupRestaurantWithRoles(t);

    const asStaff = t.withIdentity({ subject: staffId });
    // Staff should be rejected
    await expect(
      asStaff.mutation(api.restaurants.updatePaymentSettings, {
        upiId: "spice@okaxis",
      })
    ).rejects.toThrow(/privileges required/i);

    // Manager succeeds
    const asManager = t.withIdentity({ subject: managerId });
    const mgrRes = await asManager.mutation(api.restaurants.updatePaymentSettings, {
      upiId: "spicegarden@okhdfcbank",
    });
    expect(mgrRes.success).toBe(true);
    expect(mgrRes.upiId).toBe("spicegarden@okhdfcbank");

    // Owner succeeds
    const asOwner = t.withIdentity({ subject: ownerId });
    const ownerRes = await asOwner.mutation(api.restaurants.updatePaymentSettings, {
      upiId: "spicegarden@icici",
    });
    expect(ownerRes.success).toBe(true);
    expect(ownerRes.upiId).toBe("spicegarden@icici");

    // Verified in public query
    const publicInfo = await t.query(api.restaurants.getRestaurantPublicInfo, {
      restaurantId: restId,
    });
    expect(publicInfo?.upiId).toBe("spicegarden@icici");
  });

  it("2. UPI ID validation rejects invalid formats", async () => {
    const t = convexTest(schema, modules);
    const { ownerId } = await setupRestaurantWithRoles(t);
    const asOwner = t.withIdentity({ subject: ownerId });

    // Invalid UPI IDs
    await expect(
      asOwner.mutation(api.restaurants.updatePaymentSettings, {
        upiId: "invalid-upi-no-at",
      })
    ).rejects.toThrow(/invalid upi id format/i);

    await expect(
      asOwner.mutation(api.restaurants.updatePaymentSettings, {
        upiId: "invalid@",
      })
    ).rejects.toThrow(/invalid upi id format/i);

    await expect(
      asOwner.mutation(api.restaurants.updatePaymentSettings, {
        upiId: "@invalidbank",
      })
    ).rejects.toThrow(/invalid upi id format/i);
  });

  it("3. Payment verification requests create deduplicated pending requests", async () => {
    const t = convexTest(schema, modules);
    const { tableId, restId } = await setupRestaurantWithRoles(t);

    const sessionId = await t.run(async (ctx) => {
      const sid = await ctx.db.insert("table_sessions", {
        tableId,
        status: "active",
        peopleCount: 2,
        sessionNumber: "SES-101",
        startTime: new Date().toISOString(),
        restaurantId: restId,
      });

      // Insert an unpaid bill
      await ctx.db.insert("bills", {
        sessionId: sid,
        subtotal: 50000,
        totalAmount: 50000,
        paidAmount: 0,
        status: "unpaid",
        restaurantId: restId,
      });

      return sid;
    });

    // Customer requests payment verification
    await t.mutation(api.payments.requestPaymentVerification, { sessionId });

    // Verify waiter_request inserted
    const reqs = await t.run(async (ctx) =>
      ctx.db.query("waiter_requests").withIndex("by_session", (q) => q.eq("sessionId", sessionId)).collect()
    );
    expect(reqs.length).toBe(1);
    expect(reqs[0].requestType).toBe("payment_verification");
    expect(reqs[0].status).toBe("pending");

    // Table status updated to bill_pending
    const table = await t.run(async (ctx) => ctx.db.get("restaurant_tables", tableId));
    expect(table?.status).toBe("bill_pending");

    // Repeated call should deduplicate gracefully without error
    await t.mutation(api.payments.requestPaymentVerification, { sessionId });
    const reqsAfter = await t.run(async (ctx) =>
      ctx.db.query("waiter_requests").withIndex("by_session", (q) => q.eq("sessionId", sessionId)).collect()
    );
    expect(reqsAfter.length).toBe(1);
  });
});
