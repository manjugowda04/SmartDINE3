/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema.js";
import { api } from "./_generated/api.js";
import { modules } from "./test.setup.js";
import type { Id } from "./_generated/dataModel.d.ts";

describe("Customer Name Entry & Request Service", () => {
  async function setupTableAndSession(t: ReturnType<typeof convexTest>) {
    return t.run(async (ctx) => {
      const rid = await ctx.db.insert("restaurants", {
        name: "The Grand Bistro",
        isActive: true,
        createdAt: Date.now(),
      });
      const tid = await ctx.db.insert("restaurant_tables", {
        tableNumber: 5,
        name: "Table 5",
        token: "tok-name-test-5",
        status: "available",
        isActive: true,
        restaurantId: rid,
      });

      // ── Also insert a bill to satisfy session constraints ──
      const sid = await ctx.db.insert("table_sessions", {
        tableId: tid,
        status: "active",
        peopleCount: 2,
        sessionNumber: "SES-0100",
        startTime: new Date().toISOString(),
        restaurantId: rid,
      });

      // ── Initialize bill (needed by some queries) ──
      await ctx.db.insert("bills", {
        sessionId: sid,
        subtotal: 0,
        gstEnabled: false,
        gstPercentage: 0,
        gstAmount: 0,
        serviceChargeEnabled: false,
        serviceChargePercentage: 0,
        serviceChargeAmount: 0,
        serviceChargeBasis: "subtotal",
        totalAmount: 0,
        paidAmount: 0,
        status: "unpaid",
        restaurantId: rid,
      });

      return { rid, tid, sid, tableToken: "tok-name-test-5" };
    });
  }

  it("1. createOrJoinSession: succeeds without phone number", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      const rid = await ctx.db.insert("restaurants", {
        name: "No Phone Bistro",
        isActive: true,
        createdAt: Date.now(),
      });
      await ctx.db.insert("restaurant_tables", {
        tableNumber: 10,
        name: "Table 10",
        token: "tok-no-phone",
        status: "available",
        isActive: true,
        restaurantId: rid,
      });
    });

    const result = await t.mutation(api.sessions.createOrJoinSession, {
      tableToken: "tok-no-phone",
      peopleCount: 2,
    });

    expect(result.isNew).toBe(true);
    expect(result.sessionId).toBeDefined();
  });

  it("2. addCustomerName: rejects blank / whitespace-only name", async () => {
    const t = convexTest(schema, modules);
    const { sid } = await setupTableAndSession(t);

    await expect(
      t.mutation(api.sessions.addCustomerName, {
        sessionId: sid,
        customerName: "   ",
      })
    ).rejects.toThrow(/valid name/i);
  });

  it("3. addCustomerName: stores first guest name on session", async () => {
    const t = convexTest(schema, modules);
    const { sid } = await setupTableAndSession(t);

    const result = await t.mutation(api.sessions.addCustomerName, {
      sessionId: sid,
      customerName: "Aarav",
    });

    expect(result.name).toBe("Aarav");

    const session = await t.run(async (ctx) => ctx.db.get("table_sessions", sid));
    expect(session?.customerNames).toContain("Aarav");
  });

  it("4. addCustomerName: multiple guests accumulate distinct names", async () => {
    const t = convexTest(schema, modules);
    const { sid } = await setupTableAndSession(t);

    await t.mutation(api.sessions.addCustomerName, { sessionId: sid, customerName: "Aarav" });
    await t.mutation(api.sessions.addCustomerName, { sessionId: sid, customerName: "Priya" });

    const session = await t.run(async (ctx) => ctx.db.get("table_sessions", sid));
    expect(session?.customerNames).toContain("Aarav");
    expect(session?.customerNames).toContain("Priya");
    expect(session?.customerNames?.length).toBe(2);
  });

  it("5. addCustomerName: duplicate names are not stored twice", async () => {
    const t = convexTest(schema, modules);
    const { sid } = await setupTableAndSession(t);

    await t.mutation(api.sessions.addCustomerName, { sessionId: sid, customerName: "Aarav" });
    await t.mutation(api.sessions.addCustomerName, { sessionId: sid, customerName: "Aarav" });

    const session = await t.run(async (ctx) => ctx.db.get("table_sessions", sid));
    expect(session?.customerNames?.filter((n: string) => n === "Aarav").length).toBe(1);
  });

  it("6. createWaiterRequest: Call Waiter creates correct request scoped to restaurant+table", async () => {
    const t = convexTest(schema, modules);
    const { sid, rid, tid } = await setupTableAndSession(t);

    const reqId = await t.mutation(api.requests.createWaiterRequest, {
      sessionId: sid,
      requestType: "waiter",
    });
    expect(reqId).toBeDefined();

    const req = await t.run(async (ctx) => ctx.db.get("waiter_requests", reqId));
    expect(req?.requestType).toBe("waiter");
    expect(req?.status).toBe("pending");
    expect(req?.restaurantId).toBe(rid);
    expect(req?.tableId).toBe(tid);
    expect(req?.sessionId).toBe(sid);
  });

  it("7. createWaiterRequest: Request Bill creates correct request", async () => {
    const t = convexTest(schema, modules);
    const { sid, rid } = await setupTableAndSession(t);

    const reqId = await t.mutation(api.requests.createWaiterRequest, {
      sessionId: sid,
      requestType: "bill",
    });

    const req = await t.run(async (ctx) => ctx.db.get("waiter_requests", reqId));
    expect(req?.requestType).toBe("bill");
    expect(req?.restaurantId).toBe(rid);
  });

  it("8. createWaiterRequest: Request Assistance creates correct request", async () => {
    const t = convexTest(schema, modules);
    const { sid, rid } = await setupTableAndSession(t);

    const reqId = await t.mutation(api.requests.createWaiterRequest, {
      sessionId: sid,
      requestType: "assistance",
    });

    const req = await t.run(async (ctx) => ctx.db.get("waiter_requests", reqId));
    expect(req?.requestType).toBe("assistance");
    expect(req?.restaurantId).toBe(rid);
  });

  it("9. createWaiterRequest: Duplicate pending requests are deduplicated (returns same id)", async () => {
    const t = convexTest(schema, modules);
    const { sid } = await setupTableAndSession(t);

    const req1 = await t.mutation(api.requests.createWaiterRequest, {
      sessionId: sid,
      requestType: "bill",
    });
    const req2 = await t.mutation(api.requests.createWaiterRequest, {
      sessionId: sid,
      requestType: "bill",
    });

    expect(req2).toBe(req1); // same pending request returned
  });

  it("10. addCustomerName: name trimmed before storage", async () => {
    const t = convexTest(schema, modules);
    const { sid } = await setupTableAndSession(t);

    const result = await t.mutation(api.sessions.addCustomerName, {
      sessionId: sid,
      customerName: "  John  ",
    });

    expect(result.name).toBe("John");
    const session = await t.run(async (ctx) => ctx.db.get("table_sessions", sid));
    expect(session?.customerNames).toContain("John");
  });
});
