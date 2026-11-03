import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { formatINR } from "@/lib/restaurant.ts";
import { calculateBillCharges } from "@/convex/billingCalculations.js";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { UtensilsCrossed, CheckCircle2, X, Loader2, User } from "lucide-react";

interface CheckoutModalProps {
  open: boolean;
  onClose: () => void;
  sessionId: Id<"table_sessions">;
  tableNumber: number;
  restaurantName?: string;
  restaurantId?: Id<"restaurants">;
  customerName?: string;
  onSuccess: (orderNumber: string) => void;
}

export function CheckoutModal({
  open,
  onClose,
  sessionId,
  tableNumber,
  restaurantName,
  restaurantId,
  customerName,
  onSuccess,
}: CheckoutModalProps) {
  const [submitting, setSubmitting] = useState(false);

  const cart = useQuery(api.cart.getCart, { sessionId });
  const session = useQuery(api.sessions.getSessionById, { sessionId });
  const restaurant = useQuery(
    api.restaurants.getRestaurantPublicInfo,
    restaurantId ? { restaurantId } : "skip"
  );
  const placeOrder = useMutation(api.orders.placeOrder);

  const cartItems = cart?.items ?? [];
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const breakdown = calculateBillCharges(cart?.total ?? 0, {
    gstEnabled: restaurant?.gstEnabled,
    gstPercentage: restaurant?.gstPercentage,
    serviceChargeEnabled: restaurant?.serviceChargeEnabled,
    serviceChargePercentage: restaurant?.serviceChargePercentage,
    serviceChargeBasis: restaurant?.serviceChargeBasis,
  });

  const handleConfirmOrder = async () => {
    if (submitting) return; // Prevent double submission
    if (cartItems.length === 0) {
      toast.error("Your cart is empty.");
      onClose();
      return;
    }

    setSubmitting(true);
    try {
      const result = await placeOrder({
        sessionId,
        customerName: customerName?.trim() || undefined,
      });

      toast.success(`Order ${result.orderNumber} placed successfully!`, {
        description: "The kitchen has received your order.",
      });

      onClose();
      onSuccess(result.orderNumber);
    } catch (err: unknown) {
      if (err instanceof ConvexError) {
        toast.error(err.data.message);
      } else if (err instanceof Error) {
        toast.error(err.message);
      } else {
        toast.error("Failed to place order. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !submitting && !val && onClose()}>
      <DialogContent className="bg-[#16161a] border-[#27272b] text-zinc-100 max-w-lg max-h-[90vh] flex flex-col p-0 overflow-hidden shadow-2xl">
        {/* Header */}
        <DialogHeader className="p-5 pb-4 border-b border-[#24242a] bg-[#141418]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="bg-orange-500/20 text-orange-400 p-2 rounded-xl border border-orange-500/30">
                <UtensilsCrossed className="size-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-white">
                  Confirm Your Order
                </DialogTitle>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {restaurantName ?? "SmartDine"} · Table {tableNumber} ·{" "}
                  <span className="font-mono text-zinc-300">
                    {session?.sessionNumber ?? "—"}
                  </span>
                </p>
              </div>
            </div>
            {customerName && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-orange-500/10 border border-orange-500/20 text-orange-400">
                <User className="size-3" />
                <span>{customerName}</span>
              </span>
            )}
          </div>
        </DialogHeader>

        {/* Scrollable Order Items & Breakdown */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs sm:text-sm">
          {/* Items summary */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs uppercase tracking-wider font-bold text-zinc-400">
                Order Items ({itemCount})
              </h4>
            </div>
            <div className="divide-y divide-[#24242a] rounded-xl border border-[#24242a] bg-[#121215] px-3.5 py-1">
              {cartItems.map((item) => {
                const itemAddonTotal = item.addons.reduce(
                  (sum, a) => sum + a.addonPrice,
                  0
                );
                const unitPrice = item.basePrice + itemAddonTotal;

                return (
                  <div key={item._id} className="py-2.5 space-y-1">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold text-white">
                          {item.quantity}× {item.menuItemName}
                        </span>
                        <span className="text-[11px] text-zinc-400 ml-2">
                          (@ {formatINR(unitPrice)})
                        </span>
                        {item.addons.length > 0 && (
                          <div className="pl-3 mt-0.5 space-y-0.5">
                            {item.addons.map((a) => (
                              <p
                                key={a._id}
                                className="text-[11px] text-orange-400/90"
                              >
                                + {a.addonName} ({formatINR(a.addonPrice)})
                              </p>
                            ))}
                          </div>
                        )}
                        {item.specialInstructions && (
                          <p className="text-[11px] text-orange-300/80 italic pl-3 mt-0.5">
                            Note: "{item.specialInstructions}"
                          </p>
                        )}
                      </div>
                      <span className="font-mono font-bold text-white shrink-0">
                        {formatINR(item.lineTotal)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Charges and Bill Breakdown */}
          <div className="bg-[#121215] border border-[#24242a] rounded-xl p-3.5 space-y-2 text-xs">
            <div className="flex justify-between text-zinc-300">
              <span>Food Subtotal</span>
              <span className="font-mono font-semibold">
                {formatINR(breakdown.subtotal)}
              </span>
            </div>

            {breakdown.serviceChargeEnabled && breakdown.serviceChargeAmount > 0 && (
              <div className="flex justify-between text-zinc-300">
                <span>
                  Service Charge ({breakdown.serviceChargePercentage}%)
                  <span className="text-[10px] block text-zinc-500">
                    {breakdown.serviceChargeBasis === "subtotal_with_gst"
                      ? "on subtotal + GST"
                      : "on food subtotal"}
                  </span>
                </span>
                <span className="font-mono text-orange-400">
                  +{formatINR(breakdown.serviceChargeAmount)}
                </span>
              </div>
            )}

            {breakdown.gstEnabled && breakdown.gstAmount > 0 && (
              <div className="flex justify-between text-zinc-300">
                <span>GST ({breakdown.gstPercentage}%)</span>
                <span className="font-mono text-orange-400">
                  +{formatINR(breakdown.gstAmount)}
                </span>
              </div>
            )}

            <div className="pt-2 border-t border-[#24242a] flex justify-between items-baseline text-sm font-bold">
              <span className="text-white">Total Payable</span>
              <span className="text-lg font-black text-orange-400 font-mono">
                {formatINR(breakdown.totalAmount)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer with Cancel and Confirm Order */}
        <DialogFooter className="p-4 border-t border-[#24242a] bg-[#141418] flex sm:flex-row gap-2 justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={submitting}
            className="text-xs text-zinc-400 hover:text-white hover:bg-[#202026] h-10 px-4 rounded-xl cursor-pointer"
          >
            <X className="size-4 mr-1.5" />
            Cancel
          </Button>

          <Button
            type="button"
            onClick={handleConfirmOrder}
            disabled={submitting || cartItems.length === 0}
            className="bg-orange-500 hover:bg-orange-600 text-white font-bold h-10 px-5 rounded-xl shadow-lg shadow-orange-500/25 active:scale-98 transition-all flex items-center gap-2 cursor-pointer"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <span>Confirming Order...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="size-4" />
                <span>Confirm Order · {formatINR(breakdown.totalAmount)}</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
