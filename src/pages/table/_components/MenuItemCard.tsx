import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id, Doc } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { formatINR } from "@/lib/restaurant.ts";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { Plus, Minus, UtensilsCrossed } from "lucide-react";

interface Props {
  item: Doc<"menu_items"> & { addons: Doc<"menu_addons">[] };
  sessionId: Id<"table_sessions">;
  cartItems: Array<
    Doc<"cart_items"> & {
      addons: Doc<"cart_item_addons">[];
      lineTotal: number;
    }
  >;
}

export function MenuItemCard({ item, sessionId, cartItems }: Props) {
  const [selectedAddonIds, setSelectedAddonIds] = useState<Id<"menu_addons">[]>([]);
  const addToCart = useMutation(api.cart.addToCart);
  const updateQty = useMutation(api.cart.updateCartItemQuantity);
  const removeItem = useMutation(api.cart.removeFromCart);
  const [loading, setLoading] = useState(false);

  // Match cart item with the exact same menuItemId and selected addons
  const matchingCartItem = cartItems.find((ci) => {
    if (ci.menuItemId !== item._id) return false;
    const ciAddonIds = ci.addons.map((a) => a.addonId).sort();
    const currentAddonIds = [...selectedAddonIds].sort();
    if (ciAddonIds.length !== currentAddonIds.length) return false;
    return ciAddonIds.every((id, idx) => id === currentAddonIds[idx]);
  });

  const quantity = matchingCartItem ? matchingCartItem.quantity : 0;

  const toggleAddon = (addonId: Id<"menu_addons">) => {
    setSelectedAddonIds((prev) =>
      prev.includes(addonId) ? prev.filter((id) => id !== addonId) : [...prev, addonId]
    );
  };

  const selectedAddonsTotal = item.addons
    .filter((a) => selectedAddonIds.includes(a._id))
    .reduce((sum, a) => sum + a.price, 0);

  const unitPrice = item.price + selectedAddonsTotal;
  const displayQty = quantity > 0 ? quantity : 1;
  const lineCalculationTotal = unitPrice * displayQty;

  const handleAdd = async () => {
    setLoading(true);
    try {
      await addToCart({
        sessionId,
        menuItemId: item._id,
        quantity: 1,
        selectedAddonIds: selectedAddonIds.length > 0 ? selectedAddonIds : undefined,
      });
      toast.success(`${item.name} added to cart!`, { duration: 1500 });
    } catch (e) {
      if (e instanceof ConvexError) toast.error(e.data.message);
      else toast.error("Failed to add item to cart");
    } finally {
      setLoading(false);
    }
  };

  const handleIncrement = async () => {
    if (!matchingCartItem) return;
    if (matchingCartItem.quantity >= 20) {
      toast.error("Maximum 20 per item");
      return;
    }
    try {
      await updateQty({
        cartItemId: matchingCartItem._id,
        sessionId,
        quantity: matchingCartItem.quantity + 1,
      });
    } catch (e) {
      toast.error("Failed to update quantity");
    }
  };

  const handleDecrement = async () => {
    if (!matchingCartItem) return;
    try {
      if (matchingCartItem.quantity > 1) {
        await updateQty({
          cartItemId: matchingCartItem._id,
          sessionId,
          quantity: matchingCartItem.quantity - 1,
        });
      } else {
        await removeItem({
          cartItemId: matchingCartItem._id,
          sessionId,
        });
      }
    } catch (e) {
      toast.error("Failed to remove item");
    }
  };

  return (
    <div className="bg-[#16161a] border border-[#27272b] hover:border-[#383840] rounded-2xl p-4 transition-all shadow-sm">
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Left: Food thumbnail */}
        <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden shrink-0 bg-[#222226] border border-[#2e2e34]">
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-500">
              <UtensilsCrossed className="size-8" />
            </div>
          )}
        </div>

        {/* Middle: Item Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                {/* Veg / Non-Veg Indicator Icon */}
                <span
                  className={`inline-flex items-center justify-center size-4 rounded-xs border p-0.5 shrink-0 ${
                    item.isVeg
                      ? "border-green-600 bg-green-950/20"
                      : "border-red-600 bg-red-950/20"
                  }`}
                  title={item.isVeg ? "Vegetarian" : "Non-Vegetarian"}
                >
                  <span
                    className={`size-2 rounded-full ${
                      item.isVeg ? "bg-green-600" : "bg-red-600"
                    }`}
                  />
                </span>
                <h3 className="font-bold text-base sm:text-lg text-white leading-tight">
                  {item.name}
                </h3>
              </div>

              {item.description && (
                <p className="text-xs text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                  {item.description}
                </p>
              )}
            </div>
          </div>

          {/* Base Price */}
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-orange-500 font-extrabold text-base sm:text-lg">
              {formatINR(item.price)}
            </span>
          </div>

          {/* Inline Add-ons */}
          {item.addons.length > 0 && (
            <div className="mt-3 pt-2.5 border-t border-[#26262a] space-y-1.5">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-zinc-400">
                Customize & Add-ons
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {item.addons.map((addon) => {
                  const isChecked = selectedAddonIds.includes(addon._id);
                  return (
                    <label
                      key={addon._id}
                      className={`flex items-center justify-between py-1 px-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                        isChecked
                          ? "bg-orange-500/10 border-orange-500/40 text-orange-200"
                          : "bg-[#202024]/60 border-[#2a2a30] text-zinc-300 hover:bg-[#25252a]"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleAddon(addon._id)}
                          className="accent-orange-500 size-3.5 rounded shrink-0 cursor-pointer"
                        />
                        <span className="truncate">{addon.name}</span>
                      </div>
                      <span className="font-medium text-orange-400 shrink-0 ml-2">
                        +{formatINR(addon.price)}
                      </span>
                    </label>
                  );
                })}
              </div>

              {/* Compact Formula Display when add-ons selected */}
              {selectedAddonsTotal > 0 && (
                <div className="text-[11px] text-zinc-400 font-mono bg-[#202025] px-2.5 py-1 rounded-md inline-flex items-center gap-1.5 border border-[#2b2b32] mt-1">
                  <span>
                    ({formatINR(item.price)} + {formatINR(selectedAddonsTotal)}) × {displayQty}
                  </span>
                  <span className="text-orange-400 font-bold">= {formatINR(lineCalculationTotal)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Quantity controls or Add button */}
        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-3 shrink-0 pt-2 sm:pt-0">
          {quantity === 0 ? (
            <Button
              onClick={handleAdd}
              disabled={loading}
              className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-5 h-9 rounded-xl shadow-md shadow-orange-500/20 active:scale-95 transition-transform"
            >
              <Plus className="size-4 mr-1" />
              {loading ? "Adding..." : "Add"}
            </Button>
          ) : (
            <div className="flex items-center gap-1.5 bg-[#202025] border border-orange-500/40 rounded-xl p-1 shadow-sm">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleDecrement}
                className="size-7 text-white hover:text-orange-400 hover:bg-orange-500/10 rounded-lg"
                title="Decrease quantity"
              >
                <Minus className="size-3.5" />
              </Button>
              <span className="w-6 text-center font-bold text-sm text-orange-400 font-mono">
                {quantity}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleIncrement}
                className="size-7 text-white hover:text-orange-400 hover:bg-orange-500/10 rounded-lg"
                title="Increase quantity"
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
