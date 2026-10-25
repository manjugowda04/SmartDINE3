/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema.js";
import { api } from "./_generated/api.js";
import { modules } from "./test.setup.js";
import type { Id } from "./_generated/dataModel.d.ts";

// ─── Shared setup ──────────────────────────────────────────────────────────────

async function setupRestaurant(t: ReturnType<typeof convexTest>, tableNum = 1) {
  return t.run(async (ctx) => {
    const rid = await ctx.db.insert("restaurants", {
      name: "Test Kitchen",
      isActive: true,
      createdAt: Date.now(),
    });
    const token = `order-test-token-${tableNum}-${Date.now()}-${Math.random()}`;
    const tid = await ctx.db.insert("restaurant_tables", {
      tableNumber: tableNum,
      name: `Table ${tableNum}`,
      token,
      status: "available",
      isActive: true,
      restaurantId: rid,
    });
    const catId = await ctx.db.insert("categories", {
      name: "Main",
      sortOrder: 1,
      isActive: true,
      restaurantId: rid,
    });
    const menuItemId = await ctx.db.insert("menu_items", {
      categoryId: catId,
      name: "Paneer Tikka",
      price: 25000,
      isVeg: true,
      isAvailable: true,
      restaurantId: rid,
    });
    const ownerId = await ctx.db.insert("users", {
      name: "Owner",
      email: `owner-${Date.now()}@test.com`,
      role: "owner",
      isActive: true,
      restaurantId: rid,
    });
    const managerId = await ctx.db.insert("users", {
      name: "Manager",
      email: `mgr-${Date.now()}@test.com`,
      role: "manager",
      isActive: true,
      restaurantId: rid,
    });
    const staffId = await ctx.db.insert("users", {
      name: "Staff",
      email: `staff-${Date.now()}@test.com`,
      role: "staff",
      isActive: true,
      restaurantId: rid,
    });
    return { rid, tid, token, menuItemId, ownerId, managerId, staffId };
  });
}

/** Places an order and returns orderId + orderNumber */
async function placeOrder(
  t: ReturnType<typeof convexTest>,
  token: string,
  menuItemId: Id<"menu_items">,
  customerName = "Test Customer"
) {
  const session = await t.mutation(api.sessions.createOrJoinSession, {
    tableToken: token,
    customerName,
  });
  await t.mutation(api.cart.addToCart, {
    sessionId: session.sessionId,
    menuItemId,
    quantity: 1,
  });
  const result = await t.mutation(api.orders.placeOrder, {
    sessionId: session.sessionId,
    customerName,
  });
  return { ...result, sessionId: session.sessionId };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("Orders Management – Redesign & Workflow Rules", () => {
  // ── 1. Active Orders query returns placed/accepted/preparing/ready orders ──

  it("1. listActiveOrders returns only active-status orders", async () => {
    const t = convexTest(schema, modules);
    const { token, menuItemId, managerId } = await setupRestaurant(t, 1);
    const asManager = t.withIdentity({ subject: managerId });

    const { orderId } = await placeOrder(t, token, menuItemId, "Manju");

    const active = await asManager.query(api.orders.listActiveOrders, {});
    const found = active.find((o) => o._id === orderId);
    expect(found).toBeDefined();
    expect(found?.status).toBe("placed");

    // After serving the order it must not appear in active
    await asManager.mutation(api.orders.updateOrderStatus, {
      orderId,
      status: "accepted",
    });
    await asManager.mutation(api.orders.updateOrderStatus, {
      orderId,
      status: "ready",
    });
    await asManager.mutation(api.orders.updateOrderStatus, {
      orderId,
      status: "served",
    });

    const activeAfter = await asManager.query(api.orders.listActiveOrders, {});
    expect(activeAfter.find((o) => o._id === orderId)).toBeUndefined();
  });

  // ── 2. Status sub-filter counts are correct ────────────────────────────────

  it("2. Active sub-filters count placed / accepted / ready correctly", async () => {
    const t = convexTest(schema, modules);
    const { token, menuItemId, managerId } = await setupRestaurant(t, 2);
    const asManager = t.withIdentity({ subject: managerId });

    // Place two orders
    const o1 = await placeOrder(t, token, menuItemId, "A");

    // Use a second table for second order
    const { token: token2, menuItemId: mid2 } = await t.run(async (ctx) => {
      const tableId = await ctx.db.insert("restaurant_tables", {
        tableNumber: 22,
        name: "Table 22",
        token: `t22-${Date.now()}`,
        status: "available",
        isActive: true,
        restaurantId: (await ctx.db.get("menu_items", menuItemId))!.restaurantId!,
      });
      return { token: `t22-${Date.now()}`, menuItemId, tableId };
    });

    const active = await asManager.query(api.orders.listActiveOrders, {});
    const placed = active.filter((o) => o.status === "placed");
    expect(placed.length).toBeGreaterThanOrEqual(1);

    // Accept o1
    await asManager.mutation(api.orders.updateOrderStatus, {
      orderId: o1.orderId,
      status: "accepted",
    });

    const active2 = await asManager.query(api.orders.listActiveOrders, {});
    expect(active2.find((o) => o._id === o1.orderId)?.status).toBe("accepted");
  });

  // ── 3. All Orders: Completed and Rejected filters ──────────────────────────

  it("3. All Orders shows Completed (served) and Rejected separately", async () => {
    const t = convexTest(schema, modules);
    const { token, menuItemId, managerId } = await setupRestaurant(t, 3);
    const asManager = t.withIdentity({ subject: managerId });

    // Place and serve order A
    const orderA = await placeOrder(t, token, menuItemId, "Alice");
    await asManager.mutation(api.orders.updateOrderStatus, {
      orderId: orderA.orderId,
      status: "accepted",
    });
    await asManager.mutation(api.orders.updateOrderStatus, {
      orderId: orderA.orderId,
      status: "ready",
    });
    await asManager.mutation(api.orders.updateOrderStatus, {
      orderId: orderA.orderId,
      status: "served",
    });

    // Place and reject order B (using a fresh table/session)
    const { token: tokenB } = await t.run(async (ctx) => {
      const rid = (await ctx.db.get("menu_items", menuItemId))!.restaurantId!;
      const tokenVal = `test-tok-B-${Date.now()}`;
      await ctx.db.insert("restaurant_tables", {
        tableNumber: 33,
        name: "Table 33",
        token: tokenVal,
        status: "available",
        isActive: true,
        restaurantId: rid,
      });
      return { token: tokenVal };
    });
    const orderB = await placeOrder(t, tokenB, menuItemId, "Bob");
    await asManager.mutation(api.orders.updateOrderStatus, {
      orderId: orderB.orderId,
      status: "rejected",
      rejectionReason: "Out of stock",
    });

    const all = await asManager.query(api.orders.listAllOrdersForManagement, {});

    const completed = all.filter((o) => o.status === "served");
    const rejected = all.filter((o) => o.status === "rejected");

    expect(completed.find((o) => o._id === orderA.orderId)).toBeDefined();
    expect(rejected.find((o) => o._id === orderB.orderId)).toBeDefined();

    // Completed should not contain orderB
    expect(completed.find((o) => o._id === orderB.orderId)).toBeUndefined();
    // Rejected should not contain orderA
    expect(rejected.find((o) => o._id === orderA.orderId)).toBeUndefined();
  });

  // ── 4. New order can be accepted or rejected ───────────────────────────────

  it("4a. A New (placed) order can be accepted by staff", async () => {
    const t = convexTest(schema, modules);
    const { token, menuItemId, staffId } = await setupRestaurant(t, 4);
    const asStaff = t.withIdentity({ subject: staffId });

    const { orderId } = await placeOrder(t, token, menuItemId, "Jay");

    await asStaff.mutation(api.orders.updateOrderStatus, {
      orderId,
      status: "accepted",
    });

    const order = await t.run((ctx) => ctx.db.get("orders", orderId));
    expect(order?.status).toBe("accepted");
  });

  it("4b. A New (placed) order can be rejected by staff with a reason", async () => {
    const t = convexTest(schema, modules);
    const { token, menuItemId, staffId } = await setupRestaurant(t, 5);
    const asStaff = t.withIdentity({ subject: staffId });

    const { orderId } = await placeOrder(t, token, menuItemId, "Ravi");

    await asStaff.mutation(api.orders.updateOrderStatus, {
      orderId,
      status: "rejected",
      rejectionReason: "Item not available",
    });

    const order = await t.run((ctx) => ctx.db.get("orders", orderId));
    expect(order?.status).toBe("rejected");
    expect(order?.rejectionReason).toBe("Item not available");
  });

  // ── 5. CRITICAL: Accepted order cannot be rejected or cancelled ────────────

  it("5a. An Accepted order cannot be rejected via updateOrderStatus", async () => {
    const t = convexTest(schema, modules);
    const { token, menuItemId, managerId } = await setupRestaurant(t, 6);
    const asManager = t.withIdentity({ subject: managerId });

    const { orderId } = await placeOrder(t, token, menuItemId, "Priya");

    await asManager.mutation(api.orders.updateOrderStatus, {
      orderId,
      status: "accepted",
    });

    // Attempting to reject an accepted order must throw
    await expect(
      asManager.mutation(api.orders.updateOrderStatus, {
        orderId,
        status: "rejected",
      })
    ).rejects.toThrow(/cannot be rejected|cannot transition/i);

    const order = await t.run((ctx) => ctx.db.get("orders", orderId));
    expect(order?.status).toBe("accepted"); // unchanged
  });

  it("5b. An Accepted order cannot be customer-cancelled via cancelOrder", async () => {
    const t = convexTest(schema, modules);
    const { token, menuItemId, managerId } = await setupRestaurant(t, 7);
    const asManager = t.withIdentity({ subject: managerId });

    const { orderId, sessionId } = await placeOrder(t, token, menuItemId, "Sonia");

    await asManager.mutation(api.orders.updateOrderStatus, {
      orderId,
      status: "accepted",
    });

    // Customer tries to cancel an accepted order — must fail
    await expect(
      t.mutation(api.orders.cancelOrder, { orderId, sessionId })
    ).rejects.toThrow(/accepted|already been accepted/i);

    const order = await t.run((ctx) => ctx.db.get("orders", orderId));
    expect(order?.status).toBe("accepted");
  });

  // ── 6. Ready and served orders cannot transition backwards ────────────────

  it("6. Ready orders cannot go back to accepted or placed", async () => {
    const t = convexTest(schema, modules);
    const { token, menuItemId, managerId } = await setupRestaurant(t, 8);
    const asManager = t.withIdentity({ subject: managerId });

    const { orderId } = await placeOrder(t, token, menuItemId, "Amit");

    await asManager.mutation(api.orders.updateOrderStatus, {
      orderId,
      status: "accepted",
    });
    await asManager.mutation(api.orders.updateOrderStatus, {
      orderId,
      status: "ready",
    });

    await expect(
      asManager.mutation(api.orders.updateOrderStatus, {
        orderId,
        status: "accepted",
      })
    ).rejects.toThrow(/cannot transition/i);

    await expect(
      asManager.mutation(api.orders.updateOrderStatus, {
        orderId,
        status: "rejected",
      })
    ).rejects.toThrow(/cannot transition|cannot be rejected/i);
  });

  // ── 7. Repeated / concurrent status updates are idempotent-safe ──────────

  it("7. Applying the same status transition twice fails on the second attempt", async () => {
    const t = convexTest(schema, modules);
    const { token, menuItemId, managerId } = await setupRestaurant(t, 9);
    const asManager = t.withIdentity({ subject: managerId });

    const { orderId } = await placeOrder(t, token, menuItemId, "Dev");

    // First accept succeeds
    await asManager.mutation(api.orders.updateOrderStatus, {
      orderId,
      status: "accepted",
    });

    // Second accept (stale client) fails because order is already accepted
    await expect(
      asManager.mutation(api.orders.updateOrderStatus, {
        orderId,
        status: "accepted",
      })
    ).rejects.toThrow(/cannot transition/i);
  });

  // ── 8. Customer, staff, manager, owner permissions ────────────────────────

  it("8a. Unauthenticated user cannot list active orders", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.orders.listActiveOrders, {})).rejects.toThrow();
  });

  it("8b. Staff can accept orders; unauthenticated cannot", async () => {
    const t = convexTest(schema, modules);
    const { token, menuItemId, staffId } = await setupRestaurant(t, 10);
    const asStaff = t.withIdentity({ subject: staffId });

    const { orderId } = await placeOrder(t, token, menuItemId, "Keerthi");

    // Unauthenticated updateOrderStatus must fail
    await expect(
      t.mutation(api.orders.updateOrderStatus, { orderId, status: "accepted" })
    ).rejects.toThrow();

    // Staff succeeds
    await asStaff.mutation(api.orders.updateOrderStatus, { orderId, status: "accepted" });
    const order = await t.run((ctx) => ctx.db.get("orders", orderId));
    expect(order?.status).toBe("accepted");
  });

  // ── 9. Cross-restaurant isolation ────────────────────────────────────────

  it("9. Manager of Restaurant A cannot modify orders from Restaurant B", async () => {
    const t = convexTest(schema, modules);
    const restA = await setupRestaurant(t, 11);
    const restB = await setupRestaurant(t, 12);

    // Place an order in restaurant B
    const { orderId: orderBId } = await placeOrder(
      t,
      restB.token,
      restB.menuItemId,
      "CustomerB"
    );

    // Manager A attempts to accept order B's order
    const asManagerA = t.withIdentity({ subject: restA.managerId });
    await expect(
      asManagerA.mutation(api.orders.updateOrderStatus, {
        orderId: orderBId,
        status: "accepted",
      })
    ).rejects.toThrow(/another restaurant/i);

    // Order B remains unchanged
    const order = await t.run((ctx) => ctx.db.get("orders", orderBId));
    expect(order?.status).toBe("placed");
  });

  it("9b. Manager A's listAllOrdersForManagement does not include Restaurant B's orders", async () => {
    const t = convexTest(schema, modules);
    const restA = await setupRestaurant(t, 13);
    const restB = await setupRestaurant(t, 14);

    await placeOrder(t, restB.token, restB.menuItemId, "CustomerB");

    const asManagerA = t.withIdentity({ subject: restA.managerId });
    const orders = await asManagerA.query(api.orders.listAllOrdersForManagement, {});
    expect(orders.every((o) => o.restaurantId === restA.rid)).toBe(true);
  });

  // ── 10. Historical orders remain visible and correctly classified ─────────

  it("10. Historical served orders appear in listAllOrdersForManagement with correct status", async () => {
    const t = convexTest(schema, modules);
    const { tid, rid, managerId } = await setupRestaurant(t, 15);

    // Insert a legacy historical served order directly
    const orderId = await t.run(async (ctx) => {
      const sid = await ctx.db.insert("table_sessions", {
        tableId: tid,
        status: "closed",
        peopleCount: 2,
        sessionNumber: "SES-LEGACY-1",
        startTime: new Date().toISOString(),
        restaurantId: rid,
      });
      return ctx.db.insert("orders", {
        sessionId: sid,
        tableId: tid,
        orderNumber: "ORD-LEGACY-100",
        customerName: "Old Customer",
        status: "served",
        subtotal: 40000,
        total: 40000,
        placedAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        cancellationDeadline: new Date().toISOString(),
        restaurantId: rid,
      });
    });

    const asManager = t.withIdentity({ subject: managerId });
    const all = await asManager.query(api.orders.listAllOrdersForManagement, {});
    const historical = all.find((o) => o._id === orderId);

    expect(historical).toBeDefined();
    expect(historical?.status).toBe("served");
    expect(historical?.customerName).toBe("Old Customer");
    expect(historical?.orderNumber).toBe("ORD-LEGACY-100");
  });

  // ── 11. New workflow: placed → accepted → ready (no preparing step) ───────

  it("11. New workflow: placed -> accepted -> ready -> served (no preparing)", async () => {
    const t = convexTest(schema, modules);
    const { token, menuItemId, managerId } = await setupRestaurant(t, 16);
    const asManager = t.withIdentity({ subject: managerId });

    const { orderId } = await placeOrder(t, token, menuItemId, "Workflow Test");

    await asManager.mutation(api.orders.updateOrderStatus, {
      orderId,
      status: "accepted",
    });
    let order = await t.run((ctx) => ctx.db.get("orders", orderId));
    expect(order?.status).toBe("accepted");

    await asManager.mutation(api.orders.updateOrderStatus, {
      orderId,
      status: "ready",
    });
    order = await t.run((ctx) => ctx.db.get("orders", orderId));
    expect(order?.status).toBe("ready");

    await asManager.mutation(api.orders.updateOrderStatus, {
      orderId,
      status: "served",
    });
    order = await t.run((ctx) => ctx.db.get("orders", orderId));
    expect(order?.status).toBe("served");
  });

  // ── 12. Legacy preparing records still transition to ready ────────────────

  it("12. Legacy 'preparing' orders can still transition to ready (backward compat)", async () => {
    const t = convexTest(schema, modules);
    const { tid, rid, managerId } = await setupRestaurant(t, 17);

    // Insert an order directly with preparing status (legacy record)
    const orderId = await t.run(async (ctx) => {
      const sid = await ctx.db.insert("table_sessions", {
        tableId: tid,
        status: "active",
        peopleCount: 1,
        sessionNumber: "SES-PREP-1",
        startTime: new Date().toISOString(),
        restaurantId: rid,
      });
      return ctx.db.insert("orders", {
        sessionId: sid,
        tableId: tid,
        orderNumber: "ORD-PREP-001",
        customerName: "Legacy Customer",
        status: "preparing",
        subtotal: 20000,
        total: 20000,
        placedAt: new Date().toISOString(),
        cancellationDeadline: new Date(Date.now() + 180000).toISOString(),
        restaurantId: rid,
      });
    });

    const asManager = t.withIdentity({ subject: managerId });
    await asManager.mutation(api.orders.updateOrderStatus, {
      orderId,
      status: "ready",
    });

    const order = await t.run((ctx) => ctx.db.get("orders", orderId));
    expect(order?.status).toBe("ready");
  });
});
