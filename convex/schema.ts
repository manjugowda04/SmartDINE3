import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  // ─── Restaurants ────────────────────────────────────────────────────────────
  restaurants: defineTable({
    name: v.string(),
    address: v.optional(v.string()),
    contactNumber: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    logoUrl: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    // Tax & Service Charges Configuration
    gstEnabled: v.optional(v.boolean()),
    gstPercentage: v.optional(v.number()), // percentage e.g. 5 for 5%
    serviceChargeEnabled: v.optional(v.boolean()),
    serviceChargePercentage: v.optional(v.number()), // percentage e.g. 10 for 10%
    serviceChargeBasis: v.optional(
      v.union(v.literal("subtotal"), v.literal("subtotal_with_gst"))
    ),
  }),

  // ─── Users ──────────────────────────────────────────────────────────────────
  users: defineTable({
    // Convex Auth fields
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),

    // Easy Dining fields
    tokenIdentifier: v.optional(v.string()),
    role: v.optional(
      v.union(v.literal("owner"), v.literal("manager"), v.literal("staff"))
    ),
    isActive: v.optional(v.boolean()),
    // Multi-restaurant: which restaurant this user belongs to
    restaurantId: v.optional(v.id("restaurants")),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_token", ["tokenIdentifier"])
    .index("by_role", ["role"])
    .index("by_restaurant", ["restaurantId"]),

  // ─── Staff Invitations ──────────────────────────────────────────────────────
  staff_invitations: defineTable({
    name: v.string(),
    email: v.string(),
    role: v.union(v.literal("manager"), v.literal("staff")),
    tokenHash: v.string(),
    expiresAt: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("redeemed"),
      v.literal("revoked")
    ),
    invitedBy: v.id("users"),
    createdAt: v.number(),
    claimedAt: v.optional(v.number()),
    claimExpiresAt: v.optional(v.number()),
    redeemedAt: v.optional(v.number()),
    redeemedBy: v.optional(v.id("users")),
    // Which restaurant this invitation belongs to
    restaurantId: v.optional(v.id("restaurants")),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_email", ["email"])
    .index("by_status", ["status"])
    .index("by_restaurant", ["restaurantId"]),

  // ─── Bootstrap (kept for backward compat, no new inserts) ──────────────────
  owner_bootstrap: defineTable({
    key: v.literal("initial_owner"),
    ownerId: v.id("users"),
    createdAt: v.number(),
  }).index("by_key", ["key"]),

  // ─── Master Codes ─────────────────────────────────────────────────────────
  developer_master_codes: defineTable({
    codeHash: v.string(), // SHA-256 hash of developer-issued master code
    isRedeemed: v.boolean(),
    redeemedAt: v.optional(v.number()),
    redeemedByRestaurantId: v.optional(v.id("restaurants")),
    createdAt: v.number(),
  }).index("by_code_hash", ["codeHash"]),

  registration_attempts: defineTable({
    ipOrEmail: v.string(),
    attemptTime: v.number(),
    success: v.boolean(),
  }).index("by_target_time", ["ipOrEmail", "attemptTime"]),

  // ─── Sequences ──────────────────────────────────────────────────────────────
  sequences: defineTable({
    name: v.string(),
    value: v.number(),
    restaurantId: v.optional(v.id("restaurants")),
  })
    .index("by_name", ["name"])
    .index("by_restaurant_name", ["restaurantId", "name"]),

  // ─── Tables ─────────────────────────────────────────────────────────────────
  restaurant_tables: defineTable({
    tableNumber: v.number(),
    name: v.string(),
    token: v.string(), // secure random token for QR URL
    status: v.union(
      v.literal("available"),
      v.literal("occupied"),
      v.literal("bill_pending")
    ),
    isActive: v.boolean(),
    capacity: v.optional(v.number()),
    restaurantId: v.optional(v.id("restaurants")),
  })
    .index("by_token", ["token"])
    .index("by_table_number", ["tableNumber"])
    .index("by_status", ["status"])
    .index("by_restaurant", ["restaurantId"]),

  // ─── Sessions ───────────────────────────────────────────────────────────────
  table_sessions: defineTable({
    tableId: v.id("restaurant_tables"),
    status: v.union(v.literal("active"), v.literal("closed")),
    peopleCount: v.number(),
    sessionNumber: v.string(), // e.g. SES-104
    startTime: v.string(), // ISO 8601
    endTime: v.optional(v.string()),
    closedBy: v.optional(v.id("users")),
    // Customer phone number (optional)
    phoneNumber: v.optional(v.string()),
    restaurantId: v.optional(v.id("restaurants")),
    customerNames: v.optional(v.array(v.string())),
  })
    .index("by_table_active", ["tableId", "status"])
    .index("by_status", ["status"])
    .index("by_restaurant", ["restaurantId"]),

  // ─── Menu ───────────────────────────────────────────────────────────────────
  categories: defineTable({
    name: v.string(),
    sortOrder: v.number(),
    isActive: v.boolean(),
    restaurantId: v.optional(v.id("restaurants")),
  })
    .index("by_sort_order", ["sortOrder"])
    .index("by_restaurant", ["restaurantId"]),

  menu_items: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    categoryId: v.id("categories"),
    price: v.number(), // stored in paise (1 INR = 100 paise)
    isVeg: v.boolean(),
    isAvailable: v.boolean(),
    ingredients: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    restaurantId: v.optional(v.id("restaurants")),
  })
    .index("by_category", ["categoryId"])
    .index("by_available", ["isAvailable"])
    .index("by_restaurant", ["restaurantId"]),

  menu_addons: defineTable({
    menuItemId: v.id("menu_items"),
    name: v.string(),
    price: v.number(), // in paise
    isAvailable: v.boolean(),
  }).index("by_menu_item", ["menuItemId"]),

  // ─── Cart ───────────────────────────────────────────────────────────────────
  cart_items: defineTable({
    sessionId: v.id("table_sessions"),
    menuItemId: v.id("menu_items"),
    menuItemName: v.string(),
    basePrice: v.number(), // price in paise at time of adding
    quantity: v.number(),
    specialInstructions: v.optional(v.string()),
    restaurantId: v.optional(v.id("restaurants")),
  }).index("by_session", ["sessionId"]),

  cart_item_addons: defineTable({
    cartItemId: v.id("cart_items"),
    addonId: v.id("menu_addons"),
    addonName: v.string(),
    addonPrice: v.number(), // in paise
  }).index("by_cart_item", ["cartItemId"]),

  // ─── Orders ─────────────────────────────────────────────────────────────────
  orders: defineTable({
    sessionId: v.id("table_sessions"),
    tableId: v.id("restaurant_tables"),
    orderNumber: v.string(), // e.g. ORD-1025
    customerName: v.optional(v.string()), // Customer who placed this order
    status: v.union(
      v.literal("placed"),
      v.literal("accepted"),
      v.literal("preparing"),
      v.literal("ready"),
      v.literal("served"),
      v.literal("cancelled"),
      v.literal("rejected")
    ),
    subtotal: v.number(), // in paise
    total: v.number(), // in paise
    placedAt: v.string(), // ISO 8601
    cancelledAt: v.optional(v.string()),
    cancellationDeadline: v.string(), // placedAt + 3 minutes, ISO 8601
    updatedBy: v.optional(v.id("users")),
    rejectionReason: v.optional(v.string()),
    restaurantId: v.optional(v.id("restaurants")),
    // Customer phone (denormalized for reports)
    customerPhone: v.optional(v.string()),
  })
    .index("by_session", ["sessionId"])
    .index("by_table", ["tableId"])
    .index("by_status", ["status"])
    .index("by_restaurant", ["restaurantId"]),

  order_items: defineTable({
    orderId: v.id("orders"),
    menuItemId: v.id("menu_items"),
    menuItemName: v.string(),
    basePrice: v.number(), // in paise
    quantity: v.number(),
    specialInstructions: v.optional(v.string()),
    lineTotal: v.number(), // (basePrice * quantity) + addons total
  }).index("by_order", ["orderId"]),

  order_item_addons: defineTable({
    orderItemId: v.id("order_items"),
    addonId: v.id("menu_addons"),
    addonName: v.string(),
    addonPrice: v.number(), // in paise per unit
  }).index("by_order_item", ["orderItemId"]),

  // ─── Bills ──────────────────────────────────────────────────────────────────
  bills: defineTable({
    sessionId: v.id("table_sessions"),
    subtotal: v.optional(v.number()), // in paise — sum of all non-cancelled, non-rejected orders
    gstEnabled: v.optional(v.boolean()),
    gstPercentage: v.optional(v.number()),
    gstAmount: v.optional(v.number()), // in paise
    serviceChargeEnabled: v.optional(v.boolean()),
    serviceChargePercentage: v.optional(v.number()),
    serviceChargeAmount: v.optional(v.number()), // in paise
    serviceChargeBasis: v.optional(v.string()),
    totalAmount: v.number(), // in paise — subtotal + gstAmount + serviceChargeAmount
    paidAmount: v.number(), // in paise
    status: v.union(
      v.literal("unpaid"),
      v.literal("partial"),
      v.literal("paid")
    ),
    completedAt: v.optional(v.string()), // ISO 8601
    completedBy: v.optional(v.id("users")),
    restaurantId: v.optional(v.id("restaurants")),
  })
    .index("by_session", ["sessionId"])
    .index("by_restaurant", ["restaurantId"]),

  // ─── Payments ───────────────────────────────────────────────────────────────
  payments: defineTable({
    sessionId: v.id("table_sessions"),
    billId: v.id("bills"),
    amount: v.number(), // in paise
    method: v.union(
      v.literal("upi"),
      v.literal("card"),
      v.literal("cash")
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("paid"),
      v.literal("failed"),
      v.literal("refunded")
    ),
    reference: v.optional(v.string()),
    createdAt: v.string(), // ISO 8601
    completedAt: v.optional(v.string()),
    recordedBy: v.optional(v.id("users")),
    restaurantId: v.optional(v.id("restaurants")),
  })
    .index("by_session", ["sessionId"])
    .index("by_bill", ["billId"])
    .index("by_restaurant", ["restaurantId"]),

  // ─── Waiter Requests ────────────────────────────────────────────────────────
  waiter_requests: defineTable({
    sessionId: v.id("table_sessions"),
    tableId: v.id("restaurant_tables"),
    requestType: v.union(
      v.literal("waiter"),
      v.literal("water"),
      v.literal("cutlery"),
      v.literal("assistance"),
      v.literal("bill")
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("completed")
    ),
    createdAt: v.string(), // ISO 8601
    updatedAt: v.string(), // ISO 8601
    completedBy: v.optional(v.id("users")),
    restaurantId: v.optional(v.id("restaurants")),
  })
    .index("by_session", ["sessionId"])
    .index("by_table", ["tableId"])
    .index("by_status", ["status"])
    .index("by_restaurant", ["restaurantId"]),

  // ─── Feedback ───────────────────────────────────────────────────────────────
  customer_feedback: defineTable({
    sessionId: v.id("table_sessions"),
    tableId: v.id("restaurant_tables"),
    rating: v.number(),
    comment: v.optional(v.string()),
    createdAt: v.string(),
    restaurantId: v.optional(v.id("restaurants")),
  })
    .index("by_created_at", ["createdAt"])
    .index("by_restaurant", ["restaurantId"]),

  // ─── Daily Counts ───────────────────────────────────────────────────────────
  daily_customer_counts: defineTable({
    date: v.string(), // YYYY-MM-DD
    count: v.number(),
    restaurantId: v.optional(v.id("restaurants")),
  })
    .index("by_date", ["date"])
    .index("by_restaurant_date", ["restaurantId", "date"]),

  // ─── Audit Logs ─────────────────────────────────────────────────────────────
  audit_logs: defineTable({
    userId: v.optional(v.id("users")),
    action: v.string(),
    resourceType: v.string(),
    resourceId: v.optional(v.string()),
    details: v.optional(v.string()),
    createdAt: v.string(), // ISO 8601
    restaurantId: v.optional(v.id("restaurants")),
  })
    .index("by_created_at", ["createdAt"])
    .index("by_restaurant", ["restaurantId"]),
});