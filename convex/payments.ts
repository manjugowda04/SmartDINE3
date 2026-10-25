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
