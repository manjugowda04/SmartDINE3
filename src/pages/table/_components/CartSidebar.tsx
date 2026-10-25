import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id, Doc } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { formatINR } from "@/lib/restaurant.ts";
import { toast } from "sonner";
import { ShoppingCart, Trash2, Plus, Minus, ArrowRight, UtensilsCrossed } from "lucide-react";
import { calculateBillCharges } from "@/convex/billingCalculations.js";

interface Props {
  sessionId: Id<"table_sessions">;
  restaurantId?: Id<"restaurants">;
  onOpenCart: () => void;
  className?: string;
}

export function CartSidebar({ sessionId, restaurantId, onOpenCart, className = "" }: Props) {
  const cart = useQuery(api.cart.getCart, { sessionId });
  const restaurant = useQuery(
    api.restaurants.getRestaurantPublicInfo,
    restaurantId ? { restaurantId } : "skip"
  );

  const updateQty = useMutation(api.cart.updateCartItemQuantity);
  const removeItem = useMutation(api.cart.removeFromCart);
  const clearCart = useMutation(api.cart.clearCart);

  const cartItems = cart?.items ?? [];
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  // Compute breakdown using real restaurant tax and service charge settings
  const breakdown = calculateBillCharges(cart?.total ?? 0, {
    gstEnabled: restaurant?.gstEnabled,
    gstPercentage: restaurant?.gstPercentage,
    serviceChargeEnabled: restaurant?.serviceChargeEnabled,
    serviceChargePercentage: restaurant?.serviceChargePercentage,
    serviceChargeBasis: restaurant?.serviceChargeBasis,
  });

  const handleClear = async () => {
    try {
      await clearCart({ sessionId });
      toast.success("Cart cleared");
    } catch {
      toast.error("Failed to clear cart");
    }
  };

  const handleIncrement = async (item: (typeof cartItems)[0]) => {
    if (item.quantity >= 20) {
      toast.error("Maximum 20 items per dish");
      return;
    }
    try {
      await updateQty({
        cartItemId: item._id,
        sessionId,
        quantity: item.quantity + 1,
      });
    } catch {
      toast.error("Failed to update quantity");
    }
  };

  const handleDecrement = async (item: (typeof cartItems)[0]) => {
    try {
      if (item.quantity > 1) {
        await updateQty({
          cartItemId: item._id,
          sessionId,
          quantity: item.quantity - 1,
        });
      } else {
        await removeItem({
          cartItemId: item._id,
          sessionId,
        });
      }
    } catch {
      toast.error("Failed to remove item");
    }
  };

  return (
    <aside
      className={`bg-[#16161a] border border-[#27272b] rounded-2xl p-4 shadow-xl flex flex-col h-fit sticky top-24 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#27272b] pb-3">
        <div className="flex items-center gap-2">
          <div className="bg-orange-500/15 p-2 rounded-xl text-orange-500">
            <ShoppingCart className="size-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">Your Order</h3>
            <p className="text-[11px] text-zinc-400">
              {itemCount} {itemCount === 1 ? "item" : "items"} added
            </p>
          </div>
        </div>
        {cartItems.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="text-xs text-zinc-400 hover:text-red-400 hover:bg-red-950/20 h-7 px-2"
            title="Clear all items in cart"
          >
            Clear
          </Button>
        )}
      </div>

      {/* Cart items list */}
      <div className="my-3 space-y-3 overflow-y-auto max-h-[340px] pr-1">
        {cartItems.length === 0 ? (
          <div className="py-8 text-center space-y-2 text-zinc-500">
            <UtensilsCrossed className="size-8 mx-auto opacity-40" />
            <p className="text-xs">Your cart is empty</p>
            <p className="text-[11px] text-zinc-600">Select dishes from the menu to start ordering</p>
          </div>
        ) : (
          cartItems.map((item) => (
            <div
              key={item._id}
              className="bg-[#1e1e23] border border-[#2b2b32] rounded-xl p-2.5 space-y-2 transition-colors hover:border-[#383842]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-xs text-white truncate">{item.menuItemName}</p>
                  {item.addons.length > 0 && (
                    <p className="text-[10px] text-zinc-400 mt-0.5 line-clamp-1">
                      + {item.addons.map((a) => a.addonName).join(", ")}
                    </p>
                  )}
                </div>
                <span className="font-bold text-xs text-orange-400 shrink-0">
                  {formatINR(item.lineTotal)}
                </span>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-[#292930]">
                <span className="text-[11px] text-zinc-400">Qty</span>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDecrement(item)}
                    className="size-6 text-zinc-300 hover:text-orange-400 hover:bg-orange-500/10 rounded-md"
                  >
                    <Minus className="size-3" />
                  </Button>
                  <span className="w-5 text-center text-xs font-bold text-white font-mono">
                    {item.quantity}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleIncrement(item)}
                    disabled={item.quantity >= 20}
                    className="size-6 text-zinc-300 hover:text-orange-400 hover:bg-orange-500/10 rounded-md"
                  >
                    <Plus className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeItem({ cartItemId: item._id, sessionId })}
                    className="size-6 text-zinc-500 hover:text-red-400 hover:bg-red-950/20 rounded-md ml-1"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Bill Breakdown Summary */}
      {cartItems.length > 0 && (
        <div className="border-t border-[#27272b] pt-3 space-y-2 text-xs">
          <div className="flex justify-between text-zinc-400">
            <span>Food Subtotal</span>
            <span className="font-medium text-white">{formatINR(breakdown.subtotal)}</span>
          </div>

          {breakdown.serviceChargeEnabled && breakdown.serviceChargeAmount > 0 && (
            <div className="flex justify-between text-zinc-400">
              <span>
                Service Charge ({breakdown.serviceChargePercentage}%)
                <span className="text-[10px] block opacity-70">
                  {breakdown.serviceChargeBasis === "subtotal_with_gst"
                    ? "on subtotal + GST"
                    : "on food subtotal"}
                </span>
              </span>
              <span className="font-medium text-orange-400">
                +{formatINR(breakdown.serviceChargeAmount)}
              </span>
            </div>
          )}

          {breakdown.gstEnabled && breakdown.gstAmount > 0 && (
            <div className="flex justify-between text-zinc-400">
              <span>GST ({breakdown.gstPercentage}%)</span>
              <span className="font-medium text-orange-400">+{formatINR(breakdown.gstAmount)}</span>
            </div>
          )}

          <div className="flex justify-between border-t border-[#27272b] pt-2 text-sm font-bold text-white">
            <span>Total Payable</span>
            <span className="text-orange-500 text-base">{formatINR(breakdown.totalAmount)}</span>
          </div>

          <Button
            onClick={onOpenCart}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold h-11 text-sm rounded-xl shadow-lg shadow-orange-500/20 active:scale-95 transition-transform flex items-center justify-center gap-2 mt-2"
          >
            <span>View Cart & Checkout</span>
            <ArrowRight className="size-4" />
          </Button>
        </div>
      )}
    </aside>
  );
}
