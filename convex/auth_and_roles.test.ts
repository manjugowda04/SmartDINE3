/// <reference types="vite/client" />
import { describe, it, expect, beforeEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema.js";
import { api } from "./_generated/api.js";
import { modules } from "./test.setup.js";
import type { Id } from "./_generated/dataModel.d.ts";

describe("SmartDine Role-Based Access Control, Master Code & Multi-Restaurant Isolation", () => {
  beforeEach(() => {
    process.env.DEVELOPER_MASTER_CODE = "DEV-MASTER-2026-SECURE";
  });

  it("1. Master Code Registration: Validates code, sets up restaurant & owner, prevents reuse", async () => {
    const t = convexTest(schema, modules);

    // Create an unprivileged user
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "owner@firstrestaurant.com",
        name: "First Owner",
      });
    });

    const asUser = t.withIdentity({ subject: userId });

    // Missing code should fail
    await expect(
      asUser.mutation(api.restaurants.registerRestaurantWithMasterCode, {
        masterCode: "",
        restaurantName: "First Bites",
        restaurantAddress: "123 Food Street",
        contactNumber: "+91 9876543210",
      })
    ).rejects.toThrow();

    // Invalid code should fail
    await expect(
      asUser.mutation(api.restaurants.registerRestaurantWithMasterCode, {
        masterCode: "WRONG-CODE-999",
        restaurantName: "First Bites",
        restaurantAddress: "123 Food Street",
        contactNumber: "+91 9876543210",
      })
    ).rejects.toThrow();

    // Valid code should succeed
    const regResult = await asUser.mutation(
      api.restaurants.registerRestaurantWithMasterCode,
      {
        masterCode: "DEV-MASTER-2026-SECURE",
        restaurantName: "First Bites",
        restaurantAddress: "123 Food Street",
        contactNumber: "+91 9876543210",
      }
    );

    expect(regResult.success).toBe(true);
    expect(regResult.restaurantId).toBeDefined();

    // Verify user is now owner with correct restaurantId
    const user = await t.run(async (ctx) => {
      return await ctx.db.get("users", userId);
    });
    expect(user?.role).toBe("owner");
    expect(user?.isActive).toBe(true);
    expect(user?.restaurantId).toBe(regResult.restaurantId);

    // Second user tries to reuse the SAME master code: MUST BE REJECTED (single-use policy)
    const secondUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "owner@secondrestaurant.com",
        name: "Second Owner",
      });
    });
    const asSecondUser = t.withIdentity({ subject: secondUserId });

    await expect(
      asSecondUser.mutation(
        api.restaurants.registerRestaurantWithMasterCode,
        {
          masterCode: "DEV-MASTER-2026-SECURE",
          restaurantName: "Second Bites",
          restaurantAddress: "456 Market Road",
          contactNumber: "+91 9123456780",
        }
      )
    ).rejects.toThrow(/already been redeemed/i);
  });

  it("2. Multi-Restaurant Isolation: Restaurant A cannot access Restaurant B data", async () => {
    const t = convexTest(schema, modules);

    // Create Restaurant A and Owner A
    const { restAId, ownerAId } = await t.run(async (ctx) => {
      const rid = await ctx.db.insert("restaurants", {
        name: "Restaurant A",
        isActive: true,
        createdAt: Date.now(),
      });
      const uid = await ctx.db.insert("users", {
        email: "ownerA@restA.com",
        name: "Owner A",
        role: "owner",
        isActive: true,
        restaurantId: rid,
      });
      return { restAId: rid, ownerAId: uid };
    });

    // Create Restaurant B and Owner B
    const { restBId, ownerBId } = await t.run(async (ctx) => {
      const rid = await ctx.db.insert("restaurants", {
        name: "Restaurant B",
        isActive: true,
        createdAt: Date.now(),
      });
      const uid = await ctx.db.insert("users", {
        email: "ownerB@restB.com",
        name: "Owner B",
        role: "owner",
        isActive: true,
        restaurantId: rid,
      });
      return { restBId: rid, ownerBId: uid };
    });

    const asOwnerA = t.withIdentity({ subject: ownerAId });
    const asOwnerB = t.withIdentity({ subject: ownerBId });

    // Owner A creates a table in Restaurant A
    const tableAId = await asOwnerA.mutation(api.tables.createTable, {
      tableNumber: 10,
      name: "Table 10 (Rest A)",
    });
    expect(tableAId).toBeDefined();

    // Owner B creates a table in Restaurant B
    const tableBId = await asOwnerB.mutation(api.tables.createTable, {
      tableNumber: 10, // Same table number in different restaurant is allowed!
      name: "Table 10 (Rest B)",
    });
    expect(tableBId).toBeDefined();

    // Owner A lists tables: should ONLY see Restaurant A tables
    const tablesA = await asOwnerA.query(api.tables.listTables, {});
    expect(tablesA.length).toBe(1);
    expect(tablesA[0].name).toBe("Table 10 (Rest A)");

    // Owner B lists tables: should ONLY see Restaurant B tables
    const tablesB = await asOwnerB.query(api.tables.listTables, {});
    expect(tablesB.length).toBe(1);
    expect(tablesB[0].name).toBe("Table 10 (Rest B)");

    // Owner A attempts to modify Owner B's table: MUST BE REJECTED
    await expect(
      asOwnerA.mutation(api.tables.updateTable, {
        tableId: tableBId,
        name: "Hacked Table",
      })
    ).rejects.toThrow();

    // Owner A creates staff for Restaurant A
    const staffA = await asOwnerA.mutation(api.staff.createStaffDirect, {
      name: "Staff A",
      email: "staffA@restA.com",
      role: "staff",
      temporaryPassword: "password123",
    });
    expect(staffA.success).toBe(true);

    // Owner B lists staff: should NOT see Staff A
    const staffListB = await asOwnerB.query(api.staff.listStaff, {});
    const hasStaffA = staffListB.some((s) => s.email === "staffA@restA.com");
    expect(hasStaffA).toBe(false);
  });

  it("3. Staff Invitations: Invitation creation, redemption & email verification", async () => {
    const t = convexTest(schema, modules);

    const { restId, ownerId } = await t.run(async (ctx) => {
      const rid = await ctx.db.insert("restaurants", {
        name: "Spice Garden",
        isActive: true,
        createdAt: Date.now(),
      });
      const uid = await ctx.db.insert("users", {
        email: "owner@spice.com",
        name: "Spice Owner",
        role: "owner",
        isActive: true,
        restaurantId: rid,
      });
      return { restId: rid, ownerId: uid };
    });
    const asOwner = t.withIdentity({ subject: ownerId });

    // Create invitation
    const invite = await asOwner.mutation(api.staff.createInvitation, {
      name: "Bob Cook",
      email: "bob@spice.com",
      role: "staff",
      expiryHours: 48,
    });
    expect(invite.token).toBeDefined();
    expect(invite.token.length).toBe(48);

    // Public query resolves invitation details
    const details = await t.query(api.staff.getInvitationDetails, {
      token: invite.token,
    });
    expect(details.isValid).toBe(true);
    if (details.isValid) {
      expect(details.email).toBe("bob@spice.com");
      expect(details.role).toBe("staff");
      expect(details.restaurantName).toBe("Spice Garden");
    }

    // Invitee signs up (simulated user creation with authAccount)
    const bobUserId = await t.run(async (ctx) => {
      const uid = await ctx.db.insert("users", {
        email: "bob@spice.com",
        name: "Bob Cook",
      });
      await ctx.db.insert("authAccounts", {
        userId: uid,
        provider: "password",
        providerAccountId: "bob@spice.com",
      });
      return uid;
    });
    const asBob = t.withIdentity({ subject: bobUserId });

    // Finalize redemption
    const redeemResult = await asBob.mutation(
      api.staff.finalizeInvitationRedemption,
      { token: invite.token }
    );
    expect(redeemResult.success).toBe(true);
    expect(redeemResult.role).toBe("staff");

    // Bob user record is updated with staff role and correct restaurantId
    const bobUser = await t.run(async (ctx) => ctx.db.get("users", bobUserId));
    expect(bobUser?.role).toBe("staff");
    expect(bobUser?.isActive).toBe(true);
    expect(bobUser?.restaurantId).toBe(restId);

    // Wrong email trying to redeem should fail
    const eveUserId = await t.run(async (ctx) => {
      const uid = await ctx.db.insert("users", {
        email: "eve@spice.com",
      });
      await ctx.db.insert("authAccounts", {
        userId: uid,
        provider: "password",
        providerAccountId: "eve@spice.com",
      });
      return uid;
    });
    const asEve = t.withIdentity({ subject: eveUserId });

    await expect(
      asEve.mutation(api.staff.finalizeInvitationRedemption, {
        token: invite.token,
      })
    ).rejects.toThrow();
  });

  it("4. Role Permissions: Staff cannot record payment, close sessions, or view analytics; Manager can", async () => {
    const t = convexTest(schema, modules);

    const { restId, tableId, sessionId, billId } = await t.run(
      async (ctx) => {
        const rid = await ctx.db.insert("restaurants", {
          name: "Cafe Delight",
          isActive: true,
          createdAt: Date.now(),
        });
        const tid = await ctx.db.insert("restaurant_tables", {
          tableNumber: 1,
          name: "Table 1",
          token: "table-token-cafe-1",
          status: "occupied",
          isActive: true,
          restaurantId: rid,
        });
        const sid = await ctx.db.insert("table_sessions", {
          tableId: tid,
          status: "active",
          peopleCount: 2,
          sessionNumber: "SES-1001",
          startTime: new Date().toISOString(),
          phoneNumber: "9876543210",
          restaurantId: rid,
        });
        const bid = await ctx.db.insert("bills", {
          sessionId: sid,
          totalAmount: 40000, // ₹400 in paise
          paidAmount: 0,
          status: "unpaid",
          restaurantId: rid,
        });
        return { restId: rid, tableId: tid, sessionId: sid, billId: bid };
      }
    );

    // Create Staff user
    const staffId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "waiter@cafe.com",
        role: "staff",
        isActive: true,
        restaurantId: restId,
      });
    });
    const asStaff = t.withIdentity({ subject: staffId });

    // Staff CANNOT record payment
    await expect(
      asStaff.mutation(api.payments.recordPayment, {
        sessionId,
        amount: 40000,
        method: "cash",
      })
    ).rejects.toThrow();

    // Staff CANNOT close session
    await expect(
      asStaff.mutation(api.sessions.closeSession, { sessionId })
    ).rejects.toThrow();

    // Staff CANNOT view analytics
    await expect(
      asStaff.query(api.analytics.getAnalytics, { days: 7 })
    ).rejects.toThrow();

    // Create Manager user
    const managerId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "manager@cafe.com",
        role: "manager",
        isActive: true,
        restaurantId: restId,
      });
    });
    const asManager = t.withIdentity({ subject: managerId });

    // Manager CAN view analytics (Feature 4 permission matrix)
    const analytics = await asManager.query(api.analytics.getAnalytics, {
      days: 7,
    });
    expect(analytics).toBeDefined();

    // Manager CAN record payment
    const paymentId = await asManager.mutation(api.payments.recordPayment, {
      sessionId,
      amount: 40000,
      method: "upi",
    });
    expect(paymentId).toBeDefined();

    // Manager CAN close session once balance is 0
    await asManager.mutation(api.sessions.closeSession, { sessionId });

    const sessionDoc = await t.run(async (ctx) =>
      ctx.db.get("table_sessions", sessionId)
    );
    expect(sessionDoc?.status).toBe("closed");
  });

  it("5. Customer Name Entry: QR session creation works without phone; addCustomerName stores name per guest", async () => {
    const t = convexTest(schema, modules);

    const { tableToken } = await t.run(async (ctx) => {
      const rid = await ctx.db.insert("restaurants", {
        name: "Dine In",
        isActive: true,
        createdAt: Date.now(),
      });
      const token = "table-qr-unique-token-99999";
      await ctx.db.insert("restaurant_tables", {
        tableNumber: 3,
        name: "Table 3",
        token,
        status: "available",
        isActive: true,
        restaurantId: rid,
      });
      return { tableToken: token };
    });

    // Start session WITHOUT phone — must succeed (phone is now optional)
    const sessionResult = await t.mutation(api.sessions.createOrJoinSession, {
      tableToken,
      peopleCount: 2,
    });

    expect(sessionResult.isNew).toBe(true);
    expect(sessionResult.sessionId).toBeDefined();

    // addCustomerName rejects blank name
    await expect(
      t.mutation(api.sessions.addCustomerName, {
        sessionId: sessionResult.sessionId,
        customerName: "   ",
      })
    ).rejects.toThrow(/valid name/i);

    // addCustomerName accepts valid name
    const nameResult = await t.mutation(api.sessions.addCustomerName, {
      sessionId: sessionResult.sessionId,
      customerName: "Aarav",
    });
    expect(nameResult.name).toBe("Aarav");

    // Session document stores the customer name
    const sessionDoc = await t.run(async (ctx) =>
      ctx.db.get("table_sessions", sessionResult.sessionId)
    );
    expect(sessionDoc?.customerNames).toContain("Aarav");

    // A second guest can add their own name
    await t.mutation(api.sessions.addCustomerName, {
      sessionId: sessionResult.sessionId,
      customerName: "Priya",
    });
    const sessionDoc2 = await t.run(async (ctx) =>
      ctx.db.get("table_sessions", sessionResult.sessionId)
    );
    expect(sessionDoc2?.customerNames).toContain("Priya");
    expect(sessionDoc2?.customerNames?.length).toBe(2);

    // Duplicate name is not added twice
    await t.mutation(api.sessions.addCustomerName, {
      sessionId: sessionResult.sessionId,
      customerName: "Aarav",
    });
    const sessionDoc3 = await t.run(async (ctx) =>
      ctx.db.get("table_sessions", sessionResult.sessionId)
    );
    expect(sessionDoc3?.customerNames?.filter((n: string) => n === "Aarav").length).toBe(1);
  });

  it("6. Call Waiter Deduplication: Prevents rapid duplicate requests", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.run(async (ctx) => {
      const rid = await ctx.db.insert("restaurants", {
        name: "Quick Bistro",
        isActive: true,
        createdAt: Date.now(),
      });
      const tid = await ctx.db.insert("restaurant_tables", {
        tableNumber: 7,
        name: "Table 7",
        token: "tok-7",
        status: "occupied",
        isActive: true,
        restaurantId: rid,
      });
      const sid = await ctx.db.insert("table_sessions", {
        tableId: tid,
        status: "active",
        peopleCount: 1,
        sessionNumber: "SES-7",
        startTime: new Date().toISOString(),
        phoneNumber: "9988776655",
        restaurantId: rid,
      });
      return { sessionId: sid };
    });

    // Customer sends Call Waiter request
    const req1 = await t.mutation(api.requests.createWaiterRequest, {
      sessionId,
      requestType: "waiter",
    });
    expect(req1).toBeDefined();

    // Immediate second click of same request returns same request (deduplicated)
    const req2 = await t.mutation(api.requests.createWaiterRequest, {
      sessionId,
      requestType: "waiter",
    });
    expect(req2).toBe(req1);
  });

  it("7. getAuthorizedRestaurantId: Throws for unlinked users, never auto-links or auto-creates", async () => {
    const t = convexTest(schema, modules);

    // Create a restaurant that exists in the DB
    await t.run(async (ctx) => {
      await ctx.db.insert("restaurants", {
        name: "Existing Restaurant",
        isActive: true,
        createdAt: Date.now(),
      });
    });

    // Create a user WITHOUT a restaurantId
    const unlinkedUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "unlinked@example.com",
        name: "Unlinked User",
        role: "staff",
        isActive: true,
        // No restaurantId set!
      });
    });

    const asUnlinked = t.withIdentity({ subject: unlinkedUserId });

    // Unlinked user CANNOT list tables (requires restaurantId)
    await expect(
      asUnlinked.query(api.tables.listTables, {})
    ).rejects.toThrow(/no restaurant is linked/i);

    // Unlinked user CANNOT list staff
    // (they'd need owner role + restaurantId — this test checks restaurantId rejection first)
    await expect(
      asUnlinked.query(api.analytics.getAnalytics, { days: 7 })
    ).rejects.toThrow();

    // Verify the existing restaurant was NOT modified (auto-link would change it)
    const allRestaurants = await t.run(async (ctx) => ctx.db.query("restaurants").collect());
    expect(allRestaurants.length).toBe(1); // Still only 1

    // Verify the user still has NO restaurantId after the failed calls
    const user = await t.run(async (ctx) => ctx.db.get("users", unlinkedUserId));
    expect(user?.restaurantId).toBeUndefined();
  });
});
