import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { formatINR } from "@/lib/restaurant.ts";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { ShoppingCart, Trash2, Minus, Plus, UtensilsCrossed } from "lucide-react";
import { motion } from "motion/react";
import { calculateBillCharges } from "@/convex/billingCalculations.js";

interface Props {
  sessionId: Id<"table_sessions">;
  tableNumber: number;
  restaurantId?: Id<"restaurants">;
  customerName?: string;
  onOrderPlaced: () => void;
}

export default function CartView({ sessionId, tableNumber, restaurantId, customerName, onOrderPlaced }: Props) {
  const cart = useQuery(api.cart.getCart, { sessionId });
  const restaurant = useQuery(
    api.restaurants.getRestaurantPublicInfo,
    restaurantId ? { restaurantId } : "skip"
  );

  const removeItem = useMutation(api.cart.removeFromCart);
  const updateQty = useMutation(api.cart.updateCartItemQuantity);
  const placeOrder = useMutation(api.orders.placeOrder);
  const clearCart = useMutation(api.cart.clearCart);

  const [placing, setPlacing] = useState(false);

  if (cart === undefined) {
    return (
      <div className="max-w-2xl mx-auto p-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-2xl bg-[#1e1e24]" />
        ))}
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 text-center bg-[#16161a] border border-[#27272b] rounded-2xl space-y-4">
        <div className="size-16 rounded-2xl bg-[#202026] text-zinc-500 mx-auto flex items-center justify-center">
          <ShoppingCart className="size-8" />
        </div>
        <h2 className="text-lg font-bold text-white">Your cart is empty</h2>
        <p className="text-xs text-zinc-400">
          Explore our menu and add your favorite dishes to get started.
        </p>
      </div>
    );
  }

  const handleRemove = async (cartItemId: Id<"cart_items">) => {
    try {
      await removeItem({ cartItemId, sessionId });
      toast.success("Item removed from cart");
    } catch {
      toast.error("Failed to remove item");
    }
  };

  const handleQty = async (cartItemId: Id<"cart_items">, qty: number) => {
    try {
      await updateQty({ cartItemId, sessionId, quantity: qty });
    } catch {
      toast.error("Failed to update quantity");
    }
  };

  const handleClear = async () => {
    try {
      await clearCart({ sessionId });
      toast.success("Cart cleared");
    } catch {
      toast.error("Failed to clear cart");
    }
  };

  const handlePlaceOrder = async () => {
    setPlacing(true);
    try {
      const result = await placeOrder({
        sessionId,
        customerName: customerName?.trim() || undefined,
      });
      toast.success(`Order ${result.orderNumber} placed!`);
      onOrderPlaced();
    } catch (e) {
      if (e instanceof ConvexError) toast.error(e.data.message);
      else toast.error("Failed to place order");
    } finally {
      setPlacing(false);
    }
  };

  // Authoritative bill calculation
  const breakdown = calculateBillCharges(cart.total, {
    gstEnabled: restaurant?.gstEnabled,
    gstPercentage: restaurant?.gstPercentage,
    serviceChargeEnabled: restaurant?.serviceChargeEnabled,
    serviceChargePercentage: restaurant?.serviceChargePercentage,
    serviceChargeBasis: restaurant?.serviceChargeBasis,
  });

  return (
    <div className="max-w-2xl mx-auto flex flex-col min-h-[calc(100vh-120px)] p-4 text-zinc-100">
      {/* Header with Clear Cart */}
      <div className="flex items-center justify-between pb-3 border-b border-[#27272b] mb-4">
        <div className="flex items-center gap-2">
          <ShoppingCart className="size-5 text-orange-400" />
          <h2 className="font-bold text-lg text-white">Your Order</h2>
          <span className="text-xs text-zinc-400 bg-[#222228] px-2 py-0.5 rounded-full">
            {cart.items.reduce((s, i) => s + i.quantity, 0)} items
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="text-xs text-zinc-400 hover:text-red-400 hover:bg-red-500/10 h-8"
        >
          Clear Cart
        </Button>
      </div>

      {/* Cart Items List */}
      <div className="flex-1 space-y-3 pb-6">
        {cart.items.map((item) => (
          <motion.div
            key={item._id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#16161a] border border-[#27272b] rounded-2xl p-4 transition-all"
          >
            <div className="flex justify-between items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm sm:text-base text-white">{item.menuItemName}</p>
                {item.addons.length > 0 && (
                  <p className="text-xs text-orange-400/90 mt-1">
                    + {item.addons.map((a) => a.addonName).join(", ")}
                  </p>
                )}
                <p className="text-xs text-zinc-400 mt-1">
                  Unit price: {formatINR(item.basePrice + item.addons.reduce((sum, a) => sum + a.addonPrice, 0))}
                </p>
              </div>

              <div className="flex flex-col items-end gap-2.5 shrink-0">
                <span className="text-base font-extrabold text-orange-400 font-mono">
                  {formatINR(item.lineTotal)}
                </span>

                <div className="flex items-center gap-1.5 bg-[#202026] border border-[#2c2c34] rounded-xl p-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-white hover:text-orange-400 hover:bg-orange-500/10 rounded-lg"
                    onClick={() =>
                      item.quantity > 1
                        ? handleQty(item._id, item.quantity - 1)
                        : handleRemove(item._id)
                    }
                  >
                    <Minus className="size-3" />
                  </Button>
                  <span className="w-6 text-center text-sm font-bold font-mono text-white">
                    {item.quantity}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-white hover:text-orange-400 hover:bg-orange-500/10 rounded-lg"
                    onClick={() => handleQty(item._id, item.quantity + 1)}
                    disabled={item.quantity >= 20}
                  >
                    <Plus className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg ml-0.5"
                    onClick={() => handleRemove(item._id)}
                    title="Remove item"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Bill Breakdown & Checkout Card */}
      <div className="bg-[#16161a] border border-[#27272b] rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
        <h3 className="text-xs uppercase tracking-wider font-bold text-zinc-400 pb-1 border-b border-[#25252a]">
          Bill Summary
        </h3>

        <div className="space-y-2 text-xs sm:text-sm">
          <div className="flex justify-between text-zinc-300">
            <span>Food Subtotal</span>
            <span className="font-mono">{formatINR(breakdown.subtotal)}</span>
          </div>

          {breakdown.serviceChargeEnabled && (
            <div className="flex justify-between text-zinc-300">
              <span className="flex items-center gap-1">
                <span>Service Charge</span>
                <span className="text-[11px] text-zinc-500">
                  ({breakdown.serviceChargePercentage}%)
                </span>
              </span>
              <span className="font-mono">{formatINR(breakdown.serviceChargeAmount)}</span>
            </div>
          )}

          {breakdown.gstEnabled && (
            <div className="flex justify-between text-zinc-300">
              <span className="flex items-center gap-1">
                <span>GST</span>
                <span className="text-[11px] text-zinc-500">
                  ({breakdown.gstPercentage}%)
                </span>
              </span>
              <span className="font-mono">{formatINR(breakdown.gstAmount)}</span>
            </div>
          )}

          <div className="pt-2 border-t border-[#27272b] flex justify-between items-baseline">
            <div>
              <span className="text-sm sm:text-base font-bold text-white">Total Payable</span>
              <p className="text-[11px] text-zinc-400">Inclusive of all taxes & charges</p>
            </div>
            <span className="text-xl sm:text-2xl font-black text-orange-400 font-mono">
              {formatINR(breakdown.totalAmount)}
            </span>
          </div>
        </div>

        <Button
          onClick={handlePlaceOrder}
          disabled={placing || cart.items.length === 0}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold h-12 rounded-xl text-sm sm:text-base shadow-lg shadow-orange-500/25 active:scale-98 transition-all cursor-pointer"
          size="lg"
        >
          {placing ? (
            "Placing Order..."
          ) : (
            `Place Order · ${formatINR(breakdown.totalAmount)}`
          )}
        </Button>

        <p className="text-[11px] text-center text-zinc-500">
          Table {tableNumber} · You can add more dishes anytime or view existing orders.
        </p>
      </div>
    </div>
  );
}
