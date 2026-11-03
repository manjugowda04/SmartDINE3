import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import type { Id } from "./_generated/dataModel.d.ts";
import { requireManagerOrOwner, getAuthorizedRestaurantId } from "./authHelpers.js";

const PAYMENT_HISTORY_VISIBILITY_MS = 60 * 60 * 1000; // 1 hour

// ─── Queries ───────────────────────────────────────────────────────

export const getBillForSession = query({
  args: { sessionId: v.id("table_sessions") },
  handler: async (ctx, args) => {
    const bill = await ctx.db
      .query("bills")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!bill) return null;
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_bill", (q) => q.eq("billId", bill._id))
      .collect();
    const session = await ctx.db.get("table_sessions", args.sessionId);
    const table = session ? await ctx.db.get("restaurant_tables", session.tableId) : null;
    const remaining = bill.totalAmount - bill.paidAmount;
    const normalizedBill = {
      ...bill,
      subtotal: bill.subtotal ?? bill.totalAmount,
      gstEnabled: !!bill.gstEnabled,
      gstPercentage: bill.gstPercentage ?? 0,
      gstAmount: bill.gstAmount ?? 0,
      serviceChargeEnabled: !!bill.serviceChargeEnabled,
      serviceChargePercentage: bill.serviceChargePercentage ?? 0,
      serviceChargeAmount: bill.serviceChargeAmount ?? 0,
      serviceChargeBasis: bill.serviceChargeBasis || "subtotal",
    };
    return {
      bill: normalizedBill,
      payments,
      session,
      table,
      remaining,
    };
  },
});

export const getPaymentsForManagement = query({
  args: { sessionId: v.id("table_sessions") },
  handler: async (ctx, args) => {
    const user = await requireManagerOrOwner(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, user);

    const session = await ctx.db.get("table_sessions", args.sessionId);
    if (!session) return null;

    if (session.restaurantId && session.restaurantId !== restaurantId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Session belongs to another restaurant.",
      });
    }

    const bill = await ctx.db
      .query("bills")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!bill) return null;

    const table = await ctx.db.get("restaurant_tables", session.tableId);

    const allPayments = await ctx.db
      .query("payments")
      .withIndex("by_bill", (q) => q.eq("billId", bill._id))
      .collect();

    // Enforce 1-hour visibility rule for completed sessions
    let visiblePayments = allPayments;
    if (session.status === "closed" && bill.completedAt) {
      const completedTime = new Date(bill.completedAt).getTime();
      const now = Date.now();
      if (now - completedTime > PAYMENT_HISTORY_VISIBILITY_MS) {
        return null;
      }
    }

    const remaining = bill.totalAmount - bill.paidAmount;
    const paymentModes = [
      ...new Set(visiblePayments.filter((p) => p.status === "paid").map((p) => p.method)),
    ];

    const normalizedBill = {
      ...bill,
      subtotal: bill.subtotal ?? bill.totalAmount,
      gstEnabled: !!bill.gstEnabled,
      gstPercentage: bill.gstPercentage ?? 0,
      gstAmount: bill.gstAmount ?? 0,
      serviceChargeEnabled: !!bill.serviceChargeEnabled,
      serviceChargePercentage: bill.serviceChargePercentage ?? 0,
      serviceChargeAmount: bill.serviceChargeAmount ?? 0,
      serviceChargeBasis: bill.serviceChargeBasis || "subtotal",
    };

    return {
      bill: normalizedBill,
      payments: visiblePayments,
      session,
      table,
      remaining,
      paymentModes,
    };
  },
});

// ─── Mutations ─────────────────────────────────────────────────────

export const recordPayment = mutation({
  args: {
    sessionId: v.id("table_sessions"),
    amount: v.number(), // in paise
    method: v.union(v.literal("upi"), v.literal("card"), v.literal("cash")),
    reference: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"payments">> => {
    const user = await requireManagerOrOwner(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, user);

    const session = await ctx.db.get("table_sessions", args.sessionId);
    if (!session || session.status !== "active") {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Session is not active" });
    }

    if (session.restaurantId && session.restaurantId !== restaurantId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Cannot record payment for another restaurant.",
      });
    }

    const bill = await ctx.db
      .query("bills")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!bill) throw new ConvexError({ code: "NOT_FOUND", message: "Bill not found" });

    const remaining = bill.totalAmount - bill.paidAmount;
    if (args.amount <= 0) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Payment amount must be greater than 0" });
    }
    if (args.amount > remaining) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: `Payment ₹${(args.amount / 100).toFixed(2)} exceeds remaining balance ₹${(remaining / 100).toFixed(2)}`,
      });
    }

    // Check duplicate reference if provided
    if (args.reference && args.reference.trim().length > 0) {
      const existingRef = await ctx.db
        .query("payments")
        .withIndex("by_bill", (q) => q.eq("billId", bill._id))
        .collect();
      const duplicate = existingRef.some(
        (p) => p.reference && p.reference.trim() === args.reference?.trim() && p.status === "paid"
      );
      if (duplicate) {
        throw new ConvexError({
          code: "CONFLICT",
          message: `Payment with reference "${args.reference}" has already been recorded.`,
        });
      }
    }

    const now = new Date().toISOString();

    const paymentId = await ctx.db.insert("payments", {
      sessionId: args.sessionId,
      billId: bill._id,
      amount: args.amount,
      method: args.method,
      status: "paid",
      reference: args.reference?.trim() || undefined,
      createdAt: now,
      completedAt: now,
      recordedBy: user._id,
      restaurantId,
    });

    // Update bill paid amount
    const newPaid = bill.paidAmount + args.amount;
    const newRemaining = bill.totalAmount - newPaid;
    const newStatus = newRemaining <= 0 ? "paid" : newPaid > 0 ? "partial" : "unpaid";

    await ctx.db.patch("bills", bill._id, {
      paidAmount: newPaid,
      status: newStatus,
    });

    // Update table status to bill_pending when payment complete
    if (newStatus === "paid") {
      await ctx.db.patch("restaurant_tables", session.tableId, { status: "bill_pending" });
    }

    return paymentId;
  },
});

export const requestBill = mutation({
  args: { sessionId: v.id("table_sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get("table_sessions", args.sessionId);
    if (!session || session.status !== "active") {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Session is not active" });
    }
    const table = await ctx.db.get("restaurant_tables", session.tableId);
    if (!table) throw new ConvexError({ code: "NOT_FOUND", message: "Table not found" });

    // Deduplication: if an open "bill" request already exists for this session,
    // do not create a second one (prevents spam from repeated taps).
    const existing = await ctx.db
      .query("waiter_requests")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    const alreadyPending = existing.some(
      (r) => r.requestType === "bill" && r.status === "pending"
    );
    if (alreadyPending) return; // idempotent — silently ignore

    const now = new Date().toISOString();
    await ctx.db.insert("waiter_requests", {
      sessionId: args.sessionId,
      tableId: session.tableId,
      requestType: "bill",
      status: "pending",
      createdAt: now,
      updatedAt: now,
      restaurantId: session.restaurantId,
    });
    await ctx.db.patch("restaurant_tables", session.tableId, { status: "bill_pending" });
  },
});

export const requestPaymentVerification = mutation({
  args: { sessionId: v.id("table_sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get("table_sessions", args.sessionId);
    if (!session || session.status !== "active") {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Session is not active" });
    }
    const table = await ctx.db.get("restaurant_tables", session.tableId);
    if (!table) throw new ConvexError({ code: "NOT_FOUND", message: "Table not found" });

    const bill = await ctx.db
      .query("bills")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (!bill || bill.status === "paid" || (bill.totalAmount - bill.paidAmount) <= 0) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Bill has already been settled" });
    }

    // Deduplication: if an open payment_verification request already exists, do not duplicate
    const existing = await ctx.db
      .query("waiter_requests")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    const alreadyPending = existing.some(
      (r) =>
        r.requestType === "payment_verification" &&
        (r.status === "pending" || r.status === "in_progress")
    );
    if (alreadyPending) return;

    const now = new Date().toISOString();
    await ctx.db.insert("waiter_requests", {
      sessionId: args.sessionId,
      tableId: session.tableId,
      requestType: "payment_verification",
      status: "pending",
      createdAt: now,
      updatedAt: now,
      restaurantId: session.restaurantId,
    });

    await ctx.db.patch("restaurant_tables", session.tableId, { status: "bill_pending" });
  },
});

export const payFullAndCloseSession = mutation({
  args: {
    sessionId: v.id("table_sessions"),
    method: v.union(v.literal("upi"), v.literal("card"), v.literal("cash")),
  },
  handler: async (ctx, args) => {
    const user = await requireManagerOrOwner(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, user);

    const session = await ctx.db.get("table_sessions", args.sessionId);
    if (!session || session.status !== "active") {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Session is not active" });
    }

    if (session.restaurantId && session.restaurantId !== restaurantId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You cannot close a session from another restaurant.",
      });
    }

    const table = await ctx.db.get("restaurant_tables", session.tableId);
    if (!table) throw new ConvexError({ code: "NOT_FOUND", message: "Table not found." });

    const bill = await ctx.db
      .query("bills")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!bill) throw new ConvexError({ code: "NOT_FOUND", message: "Bill not found." });

    // 1. Verify no unserved active orders exist
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

    // 2. Verify no unverified payment requests exist
    const sessionRequests = await ctx.db
      .query("waiter_requests")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    const hasUnverifiedRequests = sessionRequests.some(
      (r) =>
        r.requestType === "payment_verification" &&
        (r.status === "pending" || r.status === "in_progress")
    );
    if (hasUnverifiedRequests) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Cannot close session while payment verification requests are pending.",
      });
    }

    // 3. Verify no pending payments exist
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

    // 4. Exact remaining balance
    const remaining = bill.totalAmount - bill.paidAmount;
    if (remaining < 0) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Invalid negative bill balance." });
    }

    const now = new Date().toISOString();

    // 5. Record final payment if balance remains
    if (remaining > 0) {
      await ctx.db.insert("payments", {
        sessionId: args.sessionId,
        billId: bill._id,
        amount: remaining,
        method: args.method,
        status: "paid",
        createdAt: now,
        completedAt: now,
        recordedBy: user._id,
        restaurantId,
      });

      await ctx.db.patch("bills", bill._id, {
        paidAmount: bill.totalAmount,
        status: "paid",
        completedAt: now,
        completedBy: user._id,
      });
    } else {
      await ctx.db.patch("bills", bill._id, {
        status: "paid",
        completedAt: now,
        completedBy: user._id,
      });
    }

    // 6. Close session
    await ctx.db.patch("table_sessions", args.sessionId, {
      status: "closed",
      endTime: now,
      closedBy: user._id,
    });

    // 7. Mark table available
    await ctx.db.patch("restaurant_tables", session.tableId, { status: "available" });

    // 8. Audit log
    await ctx.db.insert("audit_logs", {
      userId: user._id,
      action: "pay_full_and_close_session",
      resourceType: "table_sessions",
      resourceId: args.sessionId,
      details: `Session ${session.sessionNumber} paid in full (₹${(remaining / 100).toFixed(2)} via ${args.method}) and closed`,
      createdAt: now,
      restaurantId,
    });

    return {
      success: true,
      amount: remaining,
      method: args.method,
      sessionNumber: session.sessionNumber,
      tableNumber: table.tableNumber,
    };
  },
});
