import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { requireStaffOrAbove, getAuthorizedRestaurantId } from "./authHelpers.js";

// ─── Queries ───────────────────────────────────────────────────────

export const listWaiterRequests = query({
  args: {
    statusFilter: v.optional(
      v.union(v.literal("pending"), v.literal("in_progress"), v.literal("completed"))
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireStaffOrAbove(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, user);

    const requests = args.statusFilter
      ? await ctx.db
          .query("waiter_requests")
          .withIndex("by_status", (q) => q.eq("status", args.statusFilter!))
          .order("desc")
          .collect()
      : await ctx.db.query("waiter_requests").order("desc").take(100);

    const scopedRequests = requests.filter(
      (r) => r.restaurantId === restaurantId
    );

    return Promise.all(
      scopedRequests.map(async (r) => {
        const table = await ctx.db.get("restaurant_tables", r.tableId);
        return {
          ...r,
          table: table ? { tableNumber: table.tableNumber } : null,
        };
      })
    );
  },
});

export const listRequestsForSession = query({
  args: { sessionId: v.id("table_sessions") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("waiter_requests")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .collect();
  },
});

// ─── Mutations ─────────────────────────────────────────────────────

export const createWaiterRequest = mutation({
  args: {
    sessionId: v.id("table_sessions"),
    requestType: v.union(
      v.literal("waiter"),
      v.literal("water"),
      v.literal("cutlery"),
      v.literal("assistance"),
      v.literal("bill")
    ),
  },
  returns: v.id("waiter_requests"),
  handler: async (ctx, args) => {
    const session = await ctx.db.get("table_sessions", args.sessionId);
    if (!session || session.status !== "active") {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Session is not active" });
    }

    // Deduplication: Prevent duplicate pending requests of the same type within 60 seconds
    const existingRequests = await ctx.db
      .query("waiter_requests")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    const duplicatePending = existingRequests.find(
      (r) =>
        r.requestType === args.requestType &&
        (r.status === "pending" || r.status === "in_progress")
    );

    if (duplicatePending) {
      // Return existing pending request ID gracefully
      return duplicatePending._id;
    }

    const now = new Date().toISOString();
    return ctx.db.insert("waiter_requests", {
      sessionId: args.sessionId,
      tableId: session.tableId,
      requestType: args.requestType,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      restaurantId: session.restaurantId,
    });
  },
});

export const createCustomerFeedback = mutation({
  args: {
    sessionId: v.id("table_sessions"),
    rating: v.number(),
    comment: v.optional(v.string()),
  },
  returns: v.id("customer_feedback"),
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.rating) || args.rating < 1 || args.rating > 5) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Rating must be a whole number from 1 to 5.",
      });
    }

    const comment = args.comment?.trim();
    if (comment && comment.length > 1000) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Feedback must be 1000 characters or fewer.",
      });
    }

    const session = await ctx.db.get("table_sessions", args.sessionId);
    if (!session || session.status !== "active") {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Session is not active.",
      });
    }

    return ctx.db.insert("customer_feedback", {
      sessionId: args.sessionId,
      tableId: session.tableId,
      rating: args.rating,
      ...(comment ? { comment } : {}),
      createdAt: new Date().toISOString(),
      restaurantId: session.restaurantId,
    });
  },
});

export const listCustomerFeedback = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireStaffOrAbove(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, user);

    const feedback = await ctx.db
      .query("customer_feedback")
      .withIndex("by_created_at")
      .order("desc")
      .take(100);

    const scoped = feedback.filter(
      (f) => f.restaurantId === restaurantId
    );

    return Promise.all(
      scoped.map(async (entry) => {
        const table = await ctx.db.get("restaurant_tables", entry.tableId);
        return {
          _id: entry._id,
          rating: entry.rating,
          ...(entry.comment === undefined ? {} : { comment: entry.comment }),
          createdAt: entry.createdAt,
          tableNumber: table?.tableNumber ?? null,
        };
      })
    );
  },
});

export const updateRequestStatus = mutation({
  args: {
    requestId: v.id("waiter_requests"),
    status: v.union(v.literal("in_progress"), v.literal("completed")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireStaffOrAbove(ctx);
    const restaurantId = await getAuthorizedRestaurantId(ctx, user);

    const request = await ctx.db.get("waiter_requests", args.requestId);
    if (!request) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Request not found." });
    }

    if (request.restaurantId && request.restaurantId !== restaurantId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Request belongs to another restaurant.",
      });
    }

    const now = new Date().toISOString();
    await ctx.db.patch("waiter_requests", args.requestId, {
      status: args.status,
      updatedAt: now,
      completedBy: args.status === "completed" ? user._id : undefined,
    });

    return null;
  },
});
