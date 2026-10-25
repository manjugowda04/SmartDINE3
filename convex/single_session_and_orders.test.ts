/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema.js";
import { api } from "./_generated/api.js";
import { modules } from "./test.setup.js";
import type { Id } from "./_generated/dataModel.d.ts";

describe("Single Active Table Session & Customer-Identified Orders", () => {
  async function setupRestaurantAndTable(t: ReturnType<typeof convexTest>, tableNum = 2) {
    return t.run(async (ctx) => {
      const rid = await ctx.db.insert("restaurants", {
        name: "Spice Symphony",
        isActive: true,
        createdAt: Date.now(),
      });
      const token = `table-qr-token-${tableNum}-${Date.now()}`;
      const tid = await ctx.db.insert("restaurant_tables", {
        tableNumber: tableNum,
        name: `Table ${tableNum}`,
        token,
        status: "available",
        isActive: true,
        restaurantId: rid,
      });

      const catId = await ctx.db.insert("categories", {
        name: "Main Course",
        sortOrder: 1,
        isActive: true,
        restaurantId: rid,
      });

      const menuItemId = await ctx.db.insert("menu_items", {
        categoryId: catId,
        name: "Paneer Butter Masala",
        description: "Rich cottage cheese gravy",
        price: 32000,
        isVeg: true,
        isAvailable: true,
        sortOrder: 1,
        restaurantId: rid,
      });

      const managerId = await ctx.db.insert("users", {
        name: "Manager Alice",
        email: `manager-${Date.now()}@spicesymphony.com`,
        role: "manager",
        isActive: true,
        restaurantId: rid,
      });

      return { rid, tid, token, menuItemId, managerId };
    });
  }

  it("1. First customer can start an available table session", async () => {
    const t = convexTest(schema, modules);
    const { tid, token } = await setupRestaurantAndTable(t, 2);

    const sessionRes = await t.mutation(api.sessions.createOrJoinSession, {
      tableToken: token,
      customerName: "Manju",
      peopleCount: 2,
    });

    expect(sessionRes.isNew).toBe(true);
    expect(sessionRes.sessionId).toBeDefined();
    expect(sessionRes.sessionNumber).toMatch(/^SES-/);

    // Verify table is now marked occupied
    const table = await t.run(async (ctx) => ctx.db.get("restaurant_tables", tid));
    expect(table?.status).toBe("occupied");

    // Verify session stores the customer name
    const sessionDoc = await t.run(async (ctx) => ctx.db.get("table_sessions", sessionRes.sessionId));
    expect(sessionDoc?.status).toBe("active");
    expect(sessionDoc?.customerNames).toContain("Manju");
  });

  it("2. A second customer cannot join an occupied table", async () => {
    const t = convexTest(schema, modules);
    const { token } = await setupRestaurantAndTable(t, 3);

    // Manju starts the session
    await t.mutation(api.sessions.createOrJoinSession, {
      tableToken: token,
      customerName: "Manju",
      peopleCount: 2,
    });

    // Jay attempts to join or start another session for the same occupied table
    await expect(
      t.mutation(api.sessions.createOrJoinSession, {
        tableToken: token,
        customerName: "Jay",
        peopleCount: 1,
      })
    ).rejects.toThrow(/table is currently in use/i);
  });

  it("3. Two simultaneous requests cannot create two active sessions for the same table", async () => {
    const t = convexTest(schema, modules);
    const { token, tid } = await setupRestaurantAndTable(t, 4);

    // First one succeeds
    const s1 = await t.mutation(api.sessions.createOrJoinSession, {
      tableToken: token,
      customerName: "Manju",
    });
    expect(s1.sessionId).toBeDefined();

    // Second simultaneous request fails due to active session check
    await expect(
      t.mutation(api.sessions.createOrJoinSession, {
        tableToken: token,
        customerName: "Jay",
      })
    ).rejects.toThrow(/table is currently in use/i);

    // Exactly one active session exists
    const activeSessions = await t.run(async (ctx) =>
      ctx.db
        .query("table_sessions")
        .withIndex("by_table_active", (q) => q.eq("tableId", tid).eq("status", "active"))
        .collect()
    );
    expect(activeSessions.length).toBe(1);
  });

  it("4. Refreshing or reopening the QR URL does not bypass the occupied state", async () => {
    const t = convexTest(schema, modules);
    const { tid, token } = await setupRestaurantAndTable(t, 5);

    await t.mutation(api.sessions.createOrJoinSession, {
      tableToken: token,
      customerName: "Manju",
    });

    // Query active session for the table as if a new browser opened the URL
    const activeSession = await t.query(api.sessions.getActiveSessionForTable, {
      tableId: tid,
    });
    expect(activeSession).not.toBeNull();
    // The query now returns a safe public shape (no PII / full doc).
    // Verify the occupied flag and that status is NOT leaked.
    expect(activeSession?.isOccupied).toBe(true);
    expect((activeSession as Record<string, unknown>)?.status).toBeUndefined();
    expect((activeSession as Record<string, unknown>)?.customerNames).toBeUndefined();
    expect((activeSession as Record<string, unknown>)?.phoneNumber).toBeUndefined();

    const table = await t.query(api.tables.getTableByToken, { token });
    expect(table?.status).toBe("occupied");
  });

  it("5. A closed session allows a new customer to start a fresh session", async () => {
    const t = convexTest(schema, modules);
    const { token, tid, managerId } = await setupRestaurantAndTable(t, 6);

    // First session
    const firstSession = await t.mutation(api.sessions.createOrJoinSession, {
      tableToken: token,
      customerName: "Manju",
    });

    // Manager closes the session
    const asManager = t.withIdentity({ subject: managerId });
    await asManager.mutation(api.sessions.closeSession, {
      sessionId: firstSession.sessionId,
    });

    // Table is now available again
    const tableAfterClose = await t.run(async (ctx) => ctx.db.get("restaurant_tables", tid));
    expect(tableAfterClose?.status).toBe("available");

    // New customer Jay can now start a fresh session!
    const secondSession = await t.mutation(api.sessions.createOrJoinSession, {
      tableToken: token,
      customerName: "Jay",
    });

    expect(secondSession.isNew).toBe(true);
    expect(secondSession.sessionId).not.toBe(firstSession.sessionId);
    expect(secondSession.sessionNumber).not.toBe(firstSession.sessionNumber);
  });

  it("6. The new session cannot access the previous session's cart or billing details", async () => {
    const t = convexTest(schema, modules);
    const { token, menuItemId, managerId } = await setupRestaurantAndTable(t, 7);

    // Manju's session
    const session1 = await t.mutation(api.sessions.createOrJoinSession, {
      tableToken: token,
      customerName: "Manju",
    });

    // Manju adds item to cart
    await t.mutation(api.cart.addToCart, {
      sessionId: session1.sessionId,
      menuItemId,
      quantity: 2,
    });

    const cart1 = await t.query(api.cart.getCart, { sessionId: session1.sessionId });
    expect(cart1?.items.length).toBe(1);

    // Manager closes Manju's session
    const asManager = t.withIdentity({ subject: managerId });
    await asManager.mutation(api.sessions.closeSession, { sessionId: session1.sessionId });

    // Jay starts fresh session
    const session2 = await t.mutation(api.sessions.createOrJoinSession, {
      tableToken: token,
      customerName: "Jay",
    });

    // Jay's cart is brand new and completely empty
    const cart2 = await t.query(api.cart.getCart, { sessionId: session2.sessionId });
    expect(cart2?.items.length).toBe(0);
    expect(cart2?.total).toBe(0);
  });

  it("7. Each order stores or resolves the correct customer's name", async () => {
    const t = convexTest(schema, modules);
    const { token, menuItemId } = await setupRestaurantAndTable(t, 8);

    const session = await t.mutation(api.sessions.createOrJoinSession, {
      tableToken: token,
      customerName: "Manju",
    });

    await t.mutation(api.cart.addToCart, {
      sessionId: session.sessionId,
      menuItemId,
      quantity: 1,
    });

    const orderRes = await t.mutation(api.orders.placeOrder, {
      sessionId: session.sessionId,
      customerName: "Manju",
    });

    const order = await t.run(async (ctx) => ctx.db.get("orders", orderRes.orderId));
    expect(order?.customerName).toBe("Manju");
  });

  it("8. Customer names remain correct across all order status filters", async () => {
    const t = convexTest(schema, modules);
    const { token, menuItemId, managerId } = await setupRestaurantAndTable(t, 9);

    const session = await t.mutation(api.sessions.createOrJoinSession, {
      tableToken: token,
      customerName: "Manju",
    });

    await t.mutation(api.cart.addToCart, {
      sessionId: session.sessionId,
      menuItemId,
      quantity: 1,
    });

    const orderRes = await t.mutation(api.orders.placeOrder, {
      sessionId: session.sessionId,
      customerName: "Manju",
    });

    const asStaff = t.withIdentity({ subject: managerId });

    // Check in active orders (status: placed)
    const activePlaced = await asStaff.query(api.orders.listActiveOrders, {});
    const placedOrder = activePlaced.find((o) => o._id === orderRes.orderId);
    expect(placedOrder?.customerName).toBe("Manju");

    // Transition placed -> accepted
    await asStaff.mutation(api.orders.updateOrderStatus, {
      orderId: orderRes.orderId,
      status: "accepted",
    });

    // Transition accepted -> ready (Preparing removed from normal workflow)
    await asStaff.mutation(api.orders.updateOrderStatus, {
      orderId: orderRes.orderId,
      status: "ready",
    });

    const activeReady = await asStaff.query(api.orders.listActiveOrders, {});
    const readyOrder = activeReady.find((o) => o._id === orderRes.orderId);
    expect(readyOrder?.customerName).toBe("Manju");

    // Transition ready -> served
    await asStaff.mutation(api.orders.updateOrderStatus, {
      orderId: orderRes.orderId,
      status: "served",
    });

    const allOrders = await asStaff.query(api.orders.listAllOrdersForManagement, {});
    const servedOrder = allOrders.find((o) => o._id === orderRes.orderId);
    expect(servedOrder?.customerName).toBe("Manju");
  });

  it("9. Historical orders without customer names display Guest", async () => {
    const t = convexTest(schema, modules);
    const { tid, rid, managerId } = await setupRestaurantAndTable(t, 10);

    // Insert historical order with no customerName directly in DB
    const orderId = await t.run(async (ctx) => {
      const sid = await ctx.db.insert("table_sessions", {
        tableId: tid,
        status: "closed",
        peopleCount: 1,
        sessionNumber: "SES-OLD-1",
        startTime: new Date().toISOString(),
        restaurantId: rid,
      });

      return await ctx.db.insert("orders", {
        sessionId: sid,
        tableId: tid,
        orderNumber: "ORD-HISTORICAL-999",
        status: "served",
        subtotal: 50000,
        total: 50000,
        placedAt: new Date().toISOString(),
        cancellationDeadline: new Date().toISOString(),
        restaurantId: rid,
        // customerName intentionally omitted!
      });
    });

    const asStaff = t.withIdentity({ subject: managerId });
    const orderDetail = await asStaff.query(api.orders.getOrderById, { orderId });
    expect(orderDetail?.customerName).toBe("Guest");

    const allOrders = await asStaff.query(api.orders.listAllOrdersForManagement, {});
    const historical = allOrders.find((o) => o._id === orderId);
    expect(historical?.customerName).toBe("Guest");
  });

  it("10. Different restaurants' tables and sessions remain isolated", async () => {
    const t = convexTest(schema, modules);
    const restA = await setupRestaurantAndTable(t, 11);
    const restB = await setupRestaurantAndTable(t, 12);

    // Restaurant A session
    const sessionA = await t.mutation(api.sessions.createOrJoinSession, {
      tableToken: restA.token,
      customerName: "Customer A",
    });

    // Restaurant B session
    const sessionB = await t.mutation(api.sessions.createOrJoinSession, {
      tableToken: restB.token,
      customerName: "Customer B",
    });

    // Manager A cannot see orders from Restaurant B
    const asManagerA = t.withIdentity({ subject: restA.managerId });
    const ordersA = await asManagerA.query(api.orders.listAllOrdersForManagement, {});
    expect(ordersA.every((o) => o.restaurantId === restA.rid)).toBe(true);
    expect(ordersA.some((o) => o.sessionId === sessionB.sessionId)).toBe(false);

    // Manager A cannot close Restaurant B session
    await expect(
      asManagerA.mutation(api.sessions.closeSession, { sessionId: sessionB.sessionId })
    ).rejects.toThrow(/another restaurant/i);
  });
});
