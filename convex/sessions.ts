import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import type { MutationCtx } from "./_generated/server.js";
import type { Id } from "./_generated/dataModel.d.ts";
import {
  requireManagerOrOwner,
  requireStaffOrAbove,
  getAuthorizedRestaurantId,
} from "./authHelpers.js";
import { calculateBillCharges } from "./billingCalculations.js";

async function getNextSequence(
  ctx: MutationCtx,
  name: string,
  prefix: string,
  restaurantId?: Id<"restaurants">,
  width = 4
): Promise<string> {
  let seq = null;
  if (restaurantId) {
    seq = await ctx.db
      .query("sequences")
      .withIndex("by_restaurant_name", (q) =>
        q.eq("restaurantId", restaurantId).eq("name", name)
      )
      .first();
  }
  if (!seq) {
    seq = await ctx.db
      .query("sequences")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
  }

  const next = seq ? seq.value + 1 : 1;
  if (seq) {
    await ctx.db.patch("sequences", seq._id, { value: next, restaurantId });
  } else {
    await ctx.db.insert("sequences", { name, value: next, restaurantId });
  }
  return `${prefix}${String(next).padStart(width, "0")}`;
}

async function incrementDailyCustomers(
  ctx: MutationCtx,
  count: number,
  restaurantId?: Id<"restaurants">
) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  let existing = null;
  if (restaurantId) {
    existing = await ctx.db
      .query("daily_customer_counts")
      .withIndex("by_restaurant_date", (q) =>
        q.eq("restaurantId", restaurantId).eq("date", today)
      )
      .first();
  }
  if (!existing) {
    existing = await ctx.db
      .query("daily_customer_counts")
      .withIndex("by_date", (q) => q.eq("date", today))
      .first();
  }

  if (existing) {
    await ctx.db.patch("daily_customer_counts", existing._id, {
      count: existing.count + count,
      restaurantId,
    });
  } else {
    await ctx.db.insert("daily_customer_counts", {
      date: today,
      count,
      restaurantId,
    });
  }
}

// ─── Queries ───────────────────────────────────────────────────────

// Returns minimal public info about the active session at a table.
// Intentionally omits customerNames, phoneNumber, and internal IDs to prevent
// session hijacking and PII leakage by unauthenticated callers.
export const getActiveSessionForTable = query({
  args: { tableId: v.id("restaurant_tables") },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("table_sessions")
      .withIndex("by_table_active", (q) =>
        q.eq("tableId", args.tableId).eq("status", "active")
      )
      .first();
    if (!session) return null;
    // Return only the fields the customer-facing UI needs (occupied screen).
    return {
      _id: session._id,
      sessionNumber: session.sessionNumber,
      isOccupied: true,
    };
  },
});

export const getSessionById = query({
  args: { sessionId: v.id("table_sessions") },
  handler: async (ctx, args) => {
    return ctx.db.get("table_sessions", args.sessionId);
  },
});

export const getSessionWithDetails = query({
  args: { sessionId: v.id("table_sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get("table_sessions", args.sessionId);
    if (!session) return null;
    const table = await ctx.db.get("restaurant_tables", session.tableId);
    const bill = await ctx.db
      .query("bills")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();

    let restaurant = null;
    if (session.restaurantId) {
      restaurant = await ctx.db.get("restaurants", session.restaurantId);
    } else if (table?.restaurantId) {
      restaurant = await ctx.db.get("restaurants", table.restaurantId);
    }

    return { session, table, bill, restaurant };
  },
});

export const listActiveSessions = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireStaffOrAbove(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, user);

    const sessions = await ctx.db
      .query("table_sessions")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect();

    const activeSessions = sessions.filter((s) => s.status === "active");

    const results = await Promise.all(
      activeSessions.map(async (s) => {
        const table = await ctx.db.get("restaurant_tables", s.tableId);
        const bill = await ctx.db
          .query("bills")
          .withIndex("by_session", (q) => q.eq("sessionId", s._id))
          .first();
        return { session: s, table, bill };
      })
    );
    return results;
  },
});

// ─── Mutations ─────────────────────────────────────────────────────

export const createOrJoinSession = mutation({
  args: {
    tableToken: v.string(),
    peopleCount: v.optional(v.number()), // optional party size
    phoneNumber: v.optional(v.string()), // customer mobile number
    customerName: v.optional(v.string()), // customer display name
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    sessionId: Id<"table_sessions">;
    isNew: boolean;
    tableId: Id<"restaurant_tables">;
    tableNumber: number;
    sessionNumber: string;
    restaurantId?: Id<"restaurants">;
  }> => {
    const table = await ctx.db
      .query("restaurant_tables")
      .withIndex("by_token", (q) => q.eq("token", args.tableToken))
      .unique();
    if (!table) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Invalid QR code — table not found.",
      });
    }
    if (!table.isActive) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "This table is currently inactive.",
      });
    }

    // Strict rule: Only one active session per table at a time.
    // If a session is already active or table is occupied, refuse with TABLE_OCCUPIED.
    const existingSession = await ctx.db
      .query("table_sessions")
      .withIndex("by_table_active", (q) =>
        q.eq("tableId", table._id).eq("status", "active")
      )
      .first();

    if (existingSession || table.status === "occupied" || table.status === "bill_pending") {
      throw new ConvexError({
        code: "TABLE_OCCUPIED",
        message: "This table is currently in use. Please wait until the current session is closed.",
      });
    }

    // People count validation (default to 1 if not provided)
    const peopleCount = args.peopleCount && args.peopleCount >= 1 && args.peopleCount <= 30
      ? args.peopleCount
      : 1;

    const cleanPhone = args.phoneNumber
      ? args.phoneNumber.replace(/[^\d+]/g, "")
      : "";

    const restaurantId = table.restaurantId;
    const sessionNumber = await getNextSequence(
      ctx,
      "session_number",
      "SES-",
      restaurantId
    );

    const trimmedName = args.customerName?.trim();
    const customerNames = trimmedName ? [trimmedName] : undefined;

    const sessionId = await ctx.db.insert("table_sessions", {
      tableId: table._id,
      status: "active",
      peopleCount,
      sessionNumber,
      startTime: new Date().toISOString(),
      phoneNumber: cleanPhone || undefined,
      restaurantId,
      customerNames,
    });

    // Update table status to occupied
    await ctx.db.patch("restaurant_tables", table._id, { status: "occupied" });

    // Initialize bill with restaurant tax and service charge settings
    const restaurant = restaurantId ? await ctx.db.get("restaurants", restaurantId) : null;
    const initialBreakdown = calculateBillCharges(0, restaurant ?? {});

    await ctx.db.insert("bills", {
      sessionId,
      subtotal: 0,
      gstEnabled: initialBreakdown.gstEnabled,
      gstPercentage: initialBreakdown.gstPercentage,
      gstAmount: 0,
      serviceChargeEnabled: initialBreakdown.serviceChargeEnabled,
      serviceChargePercentage: initialBreakdown.serviceChargePercentage,
      serviceChargeAmount: 0,
      serviceChargeBasis: initialBreakdown.serviceChargeBasis,
      totalAmount: 0,
      paidAmount: 0,
      status: "unpaid",
      restaurantId,
    });

    // Increment daily customer count
    await incrementDailyCustomers(ctx, peopleCount, restaurantId);

    return {
      sessionId,
      isNew: true,
      tableId: table._id,
      tableNumber: table.tableNumber,
      sessionNumber,
      restaurantId,
    };
  },
});

/**
 * Add or update a customer's display name for this session.
 * Names are appended to the session's customerNames list (per-guest, shared table).
 * Customer-facing: no auth required — validated by sessionId ownership.
 */
export const addCustomerName = mutation({
  args: {
    sessionId: v.id("table_sessions"),
    customerName: v.string(),
  },
  handler: async (ctx, args) => {
    const trimmed = args.customerName.trim();
    if (!trimmed || trimmed.length < 1 || trimmed.length > 80) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Please enter a valid name (1–80 characters).",
      });
    }

    const session = await ctx.db.get("table_sessions", args.sessionId);
    if (!session || session.status !== "active") {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Session is not active.",
      });
    }

    const existingNames = session.customerNames ?? [];
    if (!existingNames.includes(trimmed)) {
      await ctx.db.patch("table_sessions", args.sessionId, {
        customerNames: [...existingNames, trimmed],
      });
    }
    return { name: trimmed };
  },
});

export const closeSession = mutation({
  args: {
    sessionId: v.id("table_sessions"),
  },
  handler: async (ctx, args) => {
    // FEATURE 4: Role-based restriction: Only Manager or Owner can close sessions
    const user = await requireManagerOrOwner(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, user);

    const session = await ctx.db.get("table_sessions", args.sessionId);
    if (!session) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Session not found." });
    }

    // Multi-restaurant isolation check
    if (session.restaurantId && session.restaurantId !== restaurantId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You cannot close a session from another restaurant.",
      });
    }

    if (session.status !== "active") {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Session is already closed.",
      });
    }

    // Verify bill balance is 0
    const bill = await ctx.db
      .query("bills")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!bill) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Bill not found." });
    }
    const remaining = bill.totalAmount - bill.paidAmount;
    if (remaining !== 0) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: `Cannot close session — remaining balance: ₹${(remaining / 100).toFixed(2)}`,
      });
    }

    // Check for pending payments
    const pendingPayments = await ctx.db
      .query("payments")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    const hasPending = pendingPayments.some((p) => p.status === "pending");
    if (hasPending) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "There are pending payments — please wait for them to complete.",
      });
    }

    // Check for unserved orders (placed, accepted, preparing)
    const sessionOrders = await ctx.db
      .query("orders")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    const hasUnfulfilledOrders = sessionOrders.some((o) =>
      ["placed", "accepted", "preparing"].includes(o.status)
    );
    if (hasUnfulfilledOrders) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message:
          "Cannot close session while orders are still being prepared or waiting to be served.",
      });
    }

    const now = new Date().toISOString();

    // Close session atomically
    await ctx.db.patch("table_sessions", args.sessionId, {
      status: "closed",
      endTime: now,
      closedBy: user._id,
    });

    // Free the table
    await ctx.db.patch("restaurant_tables", session.tableId, { status: "available" });

    // Mark bill completed
    await ctx.db.patch("bills", bill._id, {
      completedAt: now,
      completedBy: user._id,
    });

    // Audit log
    await ctx.db.insert("audit_logs", {
      userId: user._id,
      action: "close_session",
      resourceType: "table_sessions",
      resourceId: args.sessionId,
      details: `Session ${session.sessionNumber} closed`,
      createdAt: now,
      restaurantId,
    });
  },
});
