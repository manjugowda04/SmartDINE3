/// <reference types="vite/client" />
import { describe, it, expect, beforeEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema.js";
import { api } from "./_generated/api.js";
import { modules } from "./test.setup.js";
import { calculateBillCharges } from "./billingCalculations.js";

describe("Owner-Configurable GST and Service Charges", () => {
  beforeEach(() => {
    process.env.DEVELOPER_MASTER_CODE = "DEV-MASTER-2026-SECURE";
  });

  it("1. Calculation Engine: GST disabled and service charge disabled", () => {
    const subtotal = 100000; // ₹1,000.00
    const res = calculateBillCharges(subtotal, {
      gstEnabled: false,
      gstPercentage: 5,
      serviceChargeEnabled: false,
      serviceChargePercentage: 10,
    });

    expect(res.subtotal).toBe(100000);
    expect(res.gstAmount).toBe(0);
    expect(res.serviceChargeAmount).toBe(0);
    expect(res.totalAmount).toBe(100000); // ₹1,000.00
  });

  it("2. Calculation Engine: GST enabled (5%) and service charge disabled", () => {
    const subtotal = 100000; // ₹1,000.00
    const res = calculateBillCharges(subtotal, {
      gstEnabled: true,
      gstPercentage: 5,
      serviceChargeEnabled: false,
    });

    expect(res.subtotal).toBe(100000);
    expect(res.gstAmount).toBe(5000); // ₹50.00
    expect(res.serviceChargeAmount).toBe(0);
    expect(res.totalAmount).toBe(105000); // ₹1,050.00
  });

  it("3. Calculation Engine: GST disabled and service charge enabled (10%)", () => {
    const subtotal = 100000; // ₹1,000.00
    const res = calculateBillCharges(subtotal, {
      gstEnabled: false,
      serviceChargeEnabled: true,
      serviceChargePercentage: 10,
      serviceChargeBasis: "subtotal",
    });

    expect(res.subtotal).toBe(100000);
    expect(res.gstAmount).toBe(0);
    expect(res.serviceChargeAmount).toBe(10000); // ₹100.00
    expect(res.totalAmount).toBe(110000); // ₹1,100.00
  });

  it("4. Calculation Engine: Both charges enabled (5% GST, 10% Service Charge)", () => {
    const subtotal = 100000; // ₹1,000.00

    // Basis A: Service charge on subtotal before GST
    const resA = calculateBillCharges(subtotal, {
      gstEnabled: true,
      gstPercentage: 5,
      serviceChargeEnabled: true,
      serviceChargePercentage: 10,
      serviceChargeBasis: "subtotal",
    });
    expect(resA.subtotal).toBe(100000);
    expect(resA.gstAmount).toBe(5000); // ₹50.00
    expect(resA.serviceChargeAmount).toBe(10000); // ₹100.00
    expect(resA.totalAmount).toBe(115000); // ₹1,150.00 (Matches prompt example exactly)

    // Basis B: Service charge on subtotal including GST
    const resB = calculateBillCharges(subtotal, {
      gstEnabled: true,
      gstPercentage: 5,
      serviceChargeEnabled: true,
      serviceChargePercentage: 10,
      serviceChargeBasis: "subtotal_with_gst",
    });
    expect(resB.subtotal).toBe(100000);
    expect(resB.gstAmount).toBe(5000); // ₹50.00
    // 10% of (100000 + 5000) = 10500 paise
    expect(resB.serviceChargeAmount).toBe(10500); // ₹105.00
    expect(resB.totalAmount).toBe(115500); // ₹1,155.00
  });

  it("5. Multi-Restaurant Isolation: Independent GST & Service Charge settings per restaurant", async () => {
    const t = convexTest(schema, modules);

    // Setup Restaurant A
    const restAId = await t.run(async (ctx) => {
      return await ctx.db.insert("restaurants", {
        name: "Restaurant Alpha",
        isActive: true,
        createdAt: Date.now(),
        gstEnabled: true,
        gstPercentage: 5,
        serviceChargeEnabled: false,
      });
    });

    const ownerAId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "ownerA@alpha.com",
        role: "owner",
        restaurantId: restAId,
        isActive: true,
      });
    });

    // Setup Restaurant B
    const restBId = await t.run(async (ctx) => {
      return await ctx.db.insert("restaurants", {
        name: "Restaurant Beta",
        isActive: true,
        createdAt: Date.now(),
        gstEnabled: true,
        gstPercentage: 18,
        serviceChargeEnabled: true,
        serviceChargePercentage: 10,
        serviceChargeBasis: "subtotal",
      });
    });

    const ownerBId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "ownerB@beta.com",
        role: "owner",
        restaurantId: restBId,
        isActive: true,
      });
    });

    // Owner A modifies their settings
    const asOwnerA = t.withIdentity({ subject: ownerAId });
    await asOwnerA.mutation(api.restaurants.updateTaxAndServiceCharges, {
      gstEnabled: true,
      gstPercentage: 12,
      serviceChargeEnabled: true,
      serviceChargePercentage: 5,
      serviceChargeBasis: "subtotal",
    });

    // Verify Restaurant A updated
    const restA = await t.run(async (ctx) => ctx.db.get("restaurants", restAId));
    expect(restA?.gstPercentage).toBe(12);
    expect(restA?.serviceChargePercentage).toBe(5);

    // Verify Restaurant B remained completely unchanged
    const restB = await t.run(async (ctx) => ctx.db.get("restaurants", restBId));
    expect(restB?.gstPercentage).toBe(18);
    expect(restB?.serviceChargePercentage).toBe(10);
  });

  it("6 & 7. Full Workflow: Order placement, tax calculation, partial payments, multiple payments, and session closure", async () => {
    const t = convexTest(schema, modules);

    // Setup Restaurant with 5% GST and 10% Service Charge
    const restId = await t.run(async (ctx) => {
      return await ctx.db.insert("restaurants", {
        name: "Dine Fine",
        isActive: true,
        createdAt: Date.now(),
        gstEnabled: true,
        gstPercentage: 5,
        serviceChargeEnabled: true,
        serviceChargePercentage: 10,
        serviceChargeBasis: "subtotal",
      });
    });

    const managerId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "manager@dinefine.com",
        role: "manager",
        restaurantId: restId,
        isActive: true,
      });
    });

    const tableId = await t.run(async (ctx) => {
      return await ctx.db.insert("restaurant_tables", {
        tableNumber: 1,
        name: "Table 1",
        token: "table-1-token",
        status: "available",
        isActive: true,
        restaurantId: restId,
      });
    });

    // Customer opens session via QR code
    const sessionRes = await t.mutation(api.sessions.createOrJoinSession, {
      tableToken: "table-1-token",
      peopleCount: 2,
      phoneNumber: "+91 9999999999",
    });
    const sessionId = sessionRes.sessionId;

    // Create Category and Menu item priced at ₹1,000 (100000 paise)
    const categoryId = await t.run(async (ctx) => {
      return await ctx.db.insert("categories", {
        name: "Mains",
        sortOrder: 1,
        isActive: true,
        restaurantId: restId,
      });
    });

    const menuItemId = await t.run(async (ctx) => {
      return await ctx.db.insert("menu_items", {
        name: "Special Platter",
        categoryId,
        price: 100000, // ₹1,000.00
        isVeg: true,
        isAvailable: true,
        restaurantId: restId,
      });
    });

    // Customer adds item to cart and places order
    await t.mutation(api.cart.addToCart, {
      sessionId,
      menuItemId,
      quantity: 1,
    });

    await t.mutation(api.orders.placeOrder, { sessionId });

    // Verify Bill breakdown: Subtotal: ₹1,000, SC (10%): ₹100, GST (5%): ₹50, Total: ₹1,150
    const billData = await t.query(api.payments.getBillForSession, { sessionId });
    expect(billData).not.toBeNull();
    expect(billData?.bill.subtotal).toBe(100000);
    expect(billData?.bill.serviceChargeAmount).toBe(10000);
    expect(billData?.bill.gstAmount).toBe(5000);
    expect(billData?.bill.totalAmount).toBe(115000);
    expect(billData?.remaining).toBe(115000);
    expect(billData?.bill.status).toBe("unpaid");

    const asManager = t.withIdentity({ subject: managerId });

    // Attempting to close session with outstanding balance must fail
    await expect(
      asManager.mutation(api.sessions.closeSession, { sessionId })
    ).rejects.toThrow(/remaining balance/);

    // Partial Payment 1: Record ₹500 (50000 paise) via cash
    await asManager.mutation(api.payments.recordPayment, {
      sessionId,
      amount: 50000,
      method: "cash",
    });

    const billAfterPartial1 = await t.query(api.payments.getBillForSession, { sessionId });
    expect(billAfterPartial1?.bill.paidAmount).toBe(50000);
    expect(billAfterPartial1?.remaining).toBe(65000); // ₹650.00 remaining
    expect(billAfterPartial1?.bill.status).toBe("partial");

    // Partial Payment 2: Record remaining ₹650 (65000 paise) via UPI
    await asManager.mutation(api.payments.recordPayment, {
      sessionId,
      amount: 65000,
      method: "upi",
      reference: "UPI-TXN-987654",
    });

    const billAfterPaid = await t.query(api.payments.getBillForSession, { sessionId });
    expect(billAfterPaid?.bill.paidAmount).toBe(115000);
    expect(billAfterPaid?.remaining).toBe(0);
    expect(billAfterPaid?.bill.status).toBe("paid");

    // Fulfill order so session can be closed
    const activeOrders = await t.run(async (ctx) =>
      ctx.db.query("orders").withIndex("by_session", (q) => q.eq("sessionId", sessionId)).collect()
    );
    await asManager.mutation(api.orders.updateOrderStatus, {
      orderId: activeOrders[0]._id,
      status: "accepted",
    });
    await asManager.mutation(api.orders.updateOrderStatus, {
      orderId: activeOrders[0]._id,
      status: "ready",
    });
    await asManager.mutation(api.orders.updateOrderStatus, {
      orderId: activeOrders[0]._id,
      status: "served",
    });

    // Outstanding balance is 0: Close session now succeeds!
    await asManager.mutation(api.sessions.closeSession, { sessionId });

    const closedSession = await t.run(async (ctx) => ctx.db.get("table_sessions", sessionId));
    expect(closedSession?.status).toBe("closed");
  });

  it("8. Historical Preservation: Editing restaurant settings later does NOT alter existing bills", async () => {
    const t = convexTest(schema, modules);

    const restId = await t.run(async (ctx) => {
      return await ctx.db.insert("restaurants", {
        name: "Vintage Cafe",
        isActive: true,
        createdAt: Date.now(),
        gstEnabled: true,
        gstPercentage: 5,
        serviceChargeEnabled: false,
      });
    });

    const ownerId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "owner@vintage.com",
        role: "owner",
        restaurantId: restId,
        isActive: true,
      });
    });

    const tableId = await t.run(async (ctx) => {
      return await ctx.db.insert("restaurant_tables", {
        tableNumber: 1,
        name: "Table 1",
        token: "vintage-table-1",
        status: "available",
        isActive: true,
        restaurantId: restId,
      });
    });

    // Create session & order
    const sessionRes = await t.mutation(api.sessions.createOrJoinSession, {
      tableToken: "vintage-table-1",
      peopleCount: 1,
      phoneNumber: "+91 8888888888",
    });
    const sessionId = sessionRes.sessionId;

    const catId = await t.run(async (ctx) =>
      ctx.db.insert("categories", { name: "Drinks", sortOrder: 1, isActive: true, restaurantId: restId })
    );
    const itemId = await t.run(async (ctx) =>
      ctx.db.insert("menu_items", {
        name: "Artisan Coffee",
        categoryId: catId,
        price: 20000, // ₹200.00
        isVeg: true,
        isAvailable: true,
        restaurantId: restId,
      })
    );

    await t.mutation(api.cart.addToCart, { sessionId, menuItemId: itemId, quantity: 1 });
    await t.mutation(api.orders.placeOrder, { sessionId });

    const originalBill = await t.query(api.payments.getBillForSession, { sessionId });
    expect(originalBill?.bill.subtotal).toBe(20000);
    expect(originalBill?.bill.gstAmount).toBe(1000); // 5% of ₹200 = ₹10
    expect(originalBill?.bill.totalAmount).toBe(21000); // ₹210.00

    // Owner now changes restaurant settings to 18% GST and 10% Service Charge
    const asOwner = t.withIdentity({ subject: ownerId });
    await asOwner.mutation(api.restaurants.updateTaxAndServiceCharges, {
      gstEnabled: true,
      gstPercentage: 18,
      serviceChargeEnabled: true,
      serviceChargePercentage: 10,
      serviceChargeBasis: "subtotal",
    });

    // Simulate completion / payment of the bill
    await t.run(async (ctx) => {
      const b = await ctx.db.query("bills").withIndex("by_session", (q) => q.eq("sessionId", sessionId)).first();
      if (b) {
        await ctx.db.patch("bills", b._id, {
          paidAmount: 21000,
          status: "paid",
          completedAt: new Date().toISOString(),
        });
      }
    });

    // The historical bill must preserve its original 5% GST and ₹210.00 total!
    const billAfterConfigChange = await t.query(api.payments.getBillForSession, { sessionId });
    expect(billAfterConfigChange?.bill.totalAmount).toBe(21000);
    expect(billAfterConfigChange?.bill.gstPercentage).toBe(5);
    expect(billAfterConfigChange?.bill.serviceChargeAmount).toBe(0);
  });

  it("10. Role Permissions: Owner can update charges; Manager and Staff are rejected", async () => {
    const t = convexTest(schema, modules);

    const restId = await t.run(async (ctx) => {
      return await ctx.db.insert("restaurants", {
        name: "Permission Test Bistro",
        isActive: true,
        createdAt: Date.now(),
      });
    });

    const ownerId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "owner@perm.com", role: "owner", restaurantId: restId, isActive: true })
    );

    const managerId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "manager@perm.com", role: "manager", restaurantId: restId, isActive: true })
    );

    const staffId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "staff@perm.com", role: "staff", restaurantId: restId, isActive: true })
    );

    // Staff attempt must be rejected with FORBIDDEN
    const asStaff = t.withIdentity({ subject: staffId });
    await expect(
      asStaff.mutation(api.restaurants.updateTaxAndServiceCharges, {
        gstEnabled: true,
        gstPercentage: 5,
        serviceChargeEnabled: false,
        serviceChargePercentage: 0,
        serviceChargeBasis: "subtotal",
      })
    ).rejects.toThrow();

    // Manager attempt must be rejected with FORBIDDEN
    const asManager = t.withIdentity({ subject: managerId });
    await expect(
      asManager.mutation(api.restaurants.updateTaxAndServiceCharges, {
        gstEnabled: true,
        gstPercentage: 5,
        serviceChargeEnabled: false,
        serviceChargePercentage: 0,
        serviceChargeBasis: "subtotal",
      })
    ).rejects.toThrow();

    // Owner attempt must succeed
    const asOwner = t.withIdentity({ subject: ownerId });
    const result = await asOwner.mutation(api.restaurants.updateTaxAndServiceCharges, {
      gstEnabled: true,
      gstPercentage: 5,
      serviceChargeEnabled: true,
      serviceChargePercentage: 7.5,
      serviceChargeBasis: "subtotal",
    });

    expect(result.success).toBe(true);
    expect(result.serviceChargePercentage).toBe(7.5);
  });
});
