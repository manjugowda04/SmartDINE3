/// <reference types="vite/client" />
import { describe, it, expect, beforeEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema.js";
import { api } from "./_generated/api.js";
import { modules } from "./test.setup.js";

describe("Payments Workflow & Inline Confirmations Backend", () => {
  beforeEach(() => {
    process.env.DEVELOPER_MASTER_CODE = "DEV-MASTER-2026-SECURE";
  });

  async function setupRestaurantWithSession(t: ReturnType<typeof convexTest>, initialRemaining = 10000) {
    return t.run(async (ctx) => {
      const rid = await ctx.db.insert("restaurants", {
        name: "Test Dining Bistro",
        isActive: true,
        createdAt: Date.now(),
      });

      const managerId = await ctx.db.insert("users", {
        name: "Manager John",
        email: "john@dining.com",
        role: "manager",
        restaurantId: rid,
        isActive: true,
      });

      const staffId = await ctx.db.insert("users", {
        name: "Staff Sam",
        email: "sam@dining.com",
        role: "staff",
        restaurantId: rid,
        isActive: true,
      });

      const tid = await ctx.db.insert("restaurant_tables", {
        tableNumber: 3,
        name: "Table 3",
        token: "tok-table-3",
        status: "occupied",
        isActive: true,
        restaurantId: rid,
      });

      const sid = await ctx.db.insert("table_sessions", {
        tableId: tid,
        status: "active",
        peopleCount: 2,
        sessionNumber: "SES-0042",
        customerNames: ["Manjunath Gowda"],
        startTime: new Date().toISOString(),
        restaurantId: rid,
      });

      const billId = await ctx.db.insert("bills", {
        sessionId: sid,
        subtotal: initialRemaining,
        gstEnabled: false,
        gstPercentage: 0,
        gstAmount: 0,
        serviceChargeEnabled: false,
        serviceChargePercentage: 0,
        serviceChargeAmount: 0,
        serviceChargeBasis: "subtotal",
        totalAmount: initialRemaining,
        paidAmount: 0,
        status: "unpaid",
        restaurantId: rid,
      });

      return { rid, managerId, staffId, tid, sid, billId };
    });
  }

  it("1. recordPayment: records partial payment and updates bill reactively", async () => {
    const t = convexTest(schema, modules);
    const { managerId, sid, billId } = await setupRestaurantWithSession(t, 100000); // ₹1,000.00
    const asManager = t.withIdentity({ subject: managerId });

    // Partial payment: ₹400.00 (40000 paise) via UPI
    const paymentId = await asManager.mutation(api.payments.recordPayment, {
      sessionId: sid,
      amount: 40000,
      method: "upi",
    });

    expect(paymentId).toBeDefined();

    // Verify payment record
    const payment = await t.run(async (ctx) => ctx.db.get("payments", paymentId));
    expect(payment?.amount).toBe(40000);
    expect(payment?.method).toBe("upi");
    expect(payment?.status).toBe("paid");

    // Verify bill was updated
    const bill = await t.run(async (ctx) => ctx.db.get("bills", billId));
    expect(bill?.paidAmount).toBe(40000);
    expect(bill?.status).toBe("partial");

    // Session must remain active
    const session = await t.run(async (ctx) => ctx.db.get("table_sessions", sid));
    expect(session?.status).toBe("active");
  });

  it("2. recordPayment: rejects overpayment and 0 amount", async () => {
    const t = convexTest(schema, modules);
    const { managerId, sid } = await setupRestaurantWithSession(t, 50000); // ₹500.00
    const asManager = t.withIdentity({ subject: managerId });

    // Zero amount
    await expect(
      asManager.mutation(api.payments.recordPayment, {
        sessionId: sid,
        amount: 0,
        method: "cash",
      })
    ).rejects.toThrow(/greater than 0/i);

    // Overpayment: ₹600.00 when balance is ₹500.00
    await expect(
      asManager.mutation(api.payments.recordPayment, {
        sessionId: sid,
        amount: 60000,
        method: "card",
      })
    ).rejects.toThrow(/exceeds remaining balance/i);
  });

  it("3. payFullAndCloseSession: records exact remaining balance, closes session, and frees table", async () => {
    const t = convexTest(schema, modules);
    const { managerId, tid, sid, billId } = await setupRestaurantWithSession(t, 85000); // ₹850.00
    const asManager = t.withIdentity({ subject: managerId });

    const result = await asManager.mutation(api.payments.payFullAndCloseSession, {
      sessionId: sid,
      method: "upi",
    });

    expect(result.success).toBe(true);
    expect(result.amount).toBe(85000);
    expect(result.method).toBe("upi");
    expect(result.tableNumber).toBe(3);

    // Verify bill is fully paid
    const bill = await t.run(async (ctx) => ctx.db.get("bills", billId));
    expect(bill?.paidAmount).toBe(85000);
    expect(bill?.status).toBe("paid");

    // Verify session is closed
    const session = await t.run(async (ctx) => ctx.db.get("table_sessions", sid));
    expect(session?.status).toBe("closed");
    expect(session?.closedBy).toBe(managerId);

    // Verify table is freed (status: "available")
    const table = await t.run(async (ctx) => ctx.db.get("restaurant_tables", tid));
    expect(table?.status).toBe("available");
  });

  it("4. payFullAndCloseSession: blocks closure if unserved orders remain", async () => {
    const t = convexTest(schema, modules);
    const { rid, managerId, tid, sid } = await setupRestaurantWithSession(t, 50000);
    const asManager = t.withIdentity({ subject: managerId });

    // Insert an active order in "preparing" state
    await t.run(async (ctx) => {
      await ctx.db.insert("orders", {
        sessionId: sid,
        tableId: tid,
        status: "preparing",
        orderNumber: "ORD-001",
        subtotal: 50000,
        total: 50000,
        placedAt: new Date().toISOString(),
        cancellationDeadline: new Date(Date.now() + 100000).toISOString(),
        restaurantId: rid,
      });
    });

    await expect(
      asManager.mutation(api.payments.payFullAndCloseSession, {
        sessionId: sid,
        method: "upi",
      })
    ).rejects.toThrow(/still being prepared or waiting to be served/i);

    // Session must remain active and table not freed
    const session = await t.run(async (ctx) => ctx.db.get("table_sessions", sid));
    expect(session?.status).toBe("active");
  });

  it("5. payFullAndCloseSession: blocks closure if pending payment verification requests exist", async () => {
    const t = convexTest(schema, modules);
    const { rid, managerId, tid, sid } = await setupRestaurantWithSession(t, 60000);
    const asManager = t.withIdentity({ subject: managerId });

    // Insert a pending payment_verification request
    await t.run(async (ctx) => {
      await ctx.db.insert("waiter_requests", {
        sessionId: sid,
        tableId: tid,
        restaurantId: rid,
        requestType: "payment_verification",
        status: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    await expect(
      asManager.mutation(api.payments.payFullAndCloseSession, {
        sessionId: sid,
        method: "card",
      })
    ).rejects.toThrow(/payment verification requests are pending/i);
  });

  it("6. payFullAndCloseSession: blocks non-manager staff from closing session", async () => {
    const t = convexTest(schema, modules);
    const { staffId, sid } = await setupRestaurantWithSession(t, 25000);
    const asStaff = t.withIdentity({ subject: staffId });

    await expect(
      asStaff.mutation(api.payments.payFullAndCloseSession, {
        sessionId: sid,
        method: "cash",
      })
    ).rejects.toThrow(/forbidden|unauthorized/i);
  });

  it("7. closeSession: executes directly when remaining balance is 0 without requiring duplicate confirmations", async () => {
    const t = convexTest(schema, modules);
    const { managerId, tid, sid, billId } = await setupRestaurantWithSession(t, 40000);
    const asManager = t.withIdentity({ subject: managerId });

    // Manager records full payment first
    await asManager.mutation(api.payments.recordPayment, {
      sessionId: sid,
      amount: 40000,
      method: "cash",
    });

    const bill = await t.run(async (ctx) => ctx.db.get("bills", billId));
    expect(bill?.status).toBe("paid");

    // Now call closeSession directly (Workflow 1 Step 3)
    await asManager.mutation(api.sessions.closeSession, { sessionId: sid });

    // Session is closed and table available
    const session = await t.run(async (ctx) => ctx.db.get("table_sessions", sid));
    expect(session?.status).toBe("closed");
    const table = await t.run(async (ctx) => ctx.db.get("restaurant_tables", tid));
    expect(table?.status).toBe("available");
  });
});
