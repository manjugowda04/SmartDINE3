import type { MutationCtx } from "./_generated/server.js";
import type { Id } from "./_generated/dataModel.d.ts";

export interface TaxSettings {
  gstEnabled?: boolean;
  gstPercentage?: number;
  serviceChargeEnabled?: boolean;
  serviceChargePercentage?: number;
  serviceChargeBasis?: "subtotal" | "subtotal_with_gst";
}

export interface BillBreakdown {
  subtotal: number; // in paise
  gstEnabled: boolean;
  gstPercentage: number;
  gstAmount: number; // in paise
  serviceChargeEnabled: boolean;
  serviceChargePercentage: number;
  serviceChargeAmount: number; // in paise
  serviceChargeBasis: "subtotal" | "subtotal_with_gst";
  totalAmount: number; // in paise: subtotal + gstAmount + serviceChargeAmount
}

/**
 * Calculates GST and Service Charge authoritative amounts in integer paise.
 * Consistent integer rounding (Math.round) ensures accounting accuracy.
 */
export function calculateBillCharges(
  subtotal: number,
  settings: TaxSettings
): BillBreakdown {
  const safeSubtotal = Math.max(0, Math.round(subtotal));

  const gstEnabled = !!settings.gstEnabled;
  const rawGstPercentage = settings.gstPercentage ?? 0;
  const gstPercentage = gstEnabled && rawGstPercentage > 0 ? rawGstPercentage : 0;

  const serviceChargeEnabled = !!settings.serviceChargeEnabled;
  const rawServicePercentage = settings.serviceChargePercentage ?? 0;
  const serviceChargePercentage =
    serviceChargeEnabled && rawServicePercentage > 0 ? rawServicePercentage : 0;

  const serviceChargeBasis: "subtotal" | "subtotal_with_gst" =
    settings.serviceChargeBasis === "subtotal_with_gst"
      ? "subtotal_with_gst"
      : "subtotal";

  // 1. GST calculation (applied to food subtotal)
  const gstAmount =
    gstEnabled && gstPercentage > 0
      ? Math.round((safeSubtotal * gstPercentage) / 100)
      : 0;

  // 2. Service Charge calculation
  let serviceChargeAmount = 0;
  if (serviceChargeEnabled && serviceChargePercentage > 0) {
    if (serviceChargeBasis === "subtotal_with_gst") {
      serviceChargeAmount = Math.round(
        ((safeSubtotal + gstAmount) * serviceChargePercentage) / 100
      );
    } else {
      serviceChargeAmount = Math.round(
        (safeSubtotal * serviceChargePercentage) / 100
      );
    }
  }

  // 3. Final total payable amount
  const totalAmount = safeSubtotal + gstAmount + serviceChargeAmount;

  return {
    subtotal: safeSubtotal,
    gstEnabled,
    gstPercentage,
    gstAmount,
    serviceChargeEnabled,
    serviceChargePercentage,
    serviceChargeAmount,
    serviceChargeBasis,
    totalAmount,
  };
}

/**
 * Recalculates and synchronizes the session's bill based on all non-cancelled,
 * non-rejected orders, applying the restaurant's tax & service charge settings.
 *
 * Preserves historical locked rates on paid or existing bills.
 */
export async function syncBillForSession(
  ctx: MutationCtx,
  sessionId: Id<"table_sessions">
): Promise<BillBreakdown | null> {
  const bill = await ctx.db
    .query("bills")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .first();

  if (!bill) return null;

  // If the bill is completed and already paid, keep historical total intact
  if (bill.completedAt && bill.status === "paid") {
    return {
      subtotal: bill.subtotal ?? bill.totalAmount,
      gstEnabled: !!bill.gstEnabled,
      gstPercentage: bill.gstPercentage ?? 0,
      gstAmount: bill.gstAmount ?? 0,
      serviceChargeEnabled: !!bill.serviceChargeEnabled,
      serviceChargePercentage: bill.serviceChargePercentage ?? 0,
      serviceChargeAmount: bill.serviceChargeAmount ?? 0,
      serviceChargeBasis: (bill.serviceChargeBasis as "subtotal" | "subtotal_with_gst") || "subtotal",
      totalAmount: bill.totalAmount,
    };
  }

  // Compute food subtotal from all valid orders
  const orders = await ctx.db
    .query("orders")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .collect();

  const activeOrders = orders.filter(
    (o) => o.status !== "cancelled" && o.status !== "rejected"
  );
  const foodSubtotal = activeOrders.reduce((sum, o) => sum + o.total, 0);

  // Fetch restaurant settings or use bill's established settings if bill already had payments
  let settings: TaxSettings = {};
  if (bill.paidAmount > 0 && bill.gstPercentage !== undefined) {
    // Lock rates for partially paid bills to prevent disrupting existing payments
    settings = {
      gstEnabled: bill.gstEnabled,
      gstPercentage: bill.gstPercentage,
      serviceChargeEnabled: bill.serviceChargeEnabled,
      serviceChargePercentage: bill.serviceChargePercentage,
      serviceChargeBasis: bill.serviceChargeBasis as "subtotal" | "subtotal_with_gst",
    };
  } else {
    // Fetch current restaurant settings
    const session = await ctx.db.get("table_sessions", sessionId);
    const restaurantId = session?.restaurantId || bill.restaurantId;
    if (restaurantId) {
      const restaurant = await ctx.db.get("restaurants", restaurantId);
      if (restaurant) {
        settings = {
          gstEnabled: restaurant.gstEnabled,
          gstPercentage: restaurant.gstPercentage,
          serviceChargeEnabled: restaurant.serviceChargeEnabled,
          serviceChargePercentage: restaurant.serviceChargePercentage,
          serviceChargeBasis: restaurant.serviceChargeBasis,
        };
      }
    }
  }

  const breakdown = calculateBillCharges(foodSubtotal, settings);
  const remaining = breakdown.totalAmount - bill.paidAmount;
  const newStatus =
    remaining <= 0 && breakdown.totalAmount > 0
      ? "paid"
      : bill.paidAmount > 0
      ? "partial"
      : "unpaid";

  await ctx.db.patch("bills", bill._id, {
    subtotal: breakdown.subtotal,
    gstEnabled: breakdown.gstEnabled,
    gstPercentage: breakdown.gstPercentage,
    gstAmount: breakdown.gstAmount,
    serviceChargeEnabled: breakdown.serviceChargeEnabled,
    serviceChargePercentage: breakdown.serviceChargePercentage,
    serviceChargeAmount: breakdown.serviceChargeAmount,
    serviceChargeBasis: breakdown.serviceChargeBasis,
    totalAmount: breakdown.totalAmount,
    status: newStatus,
  });

  return breakdown;
}
