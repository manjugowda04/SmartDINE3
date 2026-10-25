import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
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
import { Textarea } from "@/components/ui/textarea.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { formatINR } from "@/lib/restaurant.ts";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { Leaf, Drumstick, Minus, Plus } from "lucide-react";

interface Props {
  menuItemId: Id<"menu_items">;
  sessionId: Id<"table_sessions">;
  onClose: () => void;
  onAdded: () => void;
}

export default function AddToCartDialog({ menuItemId, sessionId, onClose, onAdded }: Props) {
  const item = useQuery(api.menu.getMenuItemWithAddons, { menuItemId });
  const addToCart = useMutation(api.cart.addToCart);
  const [quantity, setQuantity] = useState(1);
  const [selectedAddons, setSelectedAddons] = useState<Id<"menu_addons">[]>([]);
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(false);

  const toggleAddon = (addonId: Id<"menu_addons">) => {
    setSelectedAddons((prev) =>
      prev.includes(addonId) ? prev.filter((id) => id !== addonId) : [...prev, addonId]
    );
  };

  const total =
    item
      ? (item.price + item.addons
          .filter((a) => selectedAddons.includes(a._id))
          .reduce((s, a) => s + a.price, 0)) * quantity
      : 0;

  const handleAdd = async () => {
    setLoading(true);
    try {
      await addToCart({
        sessionId,
        menuItemId,
        quantity,
        selectedAddonIds: selectedAddons,
        specialInstructions: instructions || undefined,
      });
      toast.success(`${item?.name} added to cart!`);
      onAdded();
    } catch (e) {
      if (e instanceof ConvexError) toast.error(e.data.message);
      else toast.error("Failed to add to cart");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        {item === undefined ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : item === null ? (
          <p className="text-center text-muted-foreground py-4">Item not found</p>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {item.isVeg ? (
                  <Leaf className="size-4 text-green-600 flex-shrink-0" />
                ) : (
                  <Drumstick className="size-4 text-red-500 flex-shrink-0" />
                )}
                {item.name}
              </DialogTitle>
            </DialogHeader>

            {item.imageUrl && (
              <img src={item.imageUrl} alt={item.name} className="w-full h-40 object-cover rounded-lg" />
            )}

            {item.description && (
              <p className="text-sm text-muted-foreground">{item.description}</p>
            )}

            <div className="text-lg font-bold">{formatINR(item.price)}</div>

            {/* Quantity */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">Quantity</span>
              <div className="flex items-center gap-2 ml-auto">
                <Button variant="secondary" size="icon" className="size-8"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}>
                  <Minus className="size-3" />
                </Button>
                <span className="w-8 text-center font-bold">{quantity}</span>
                <Button variant="secondary" size="icon" className="size-8"
                  onClick={() => setQuantity((q) => Math.min(20, q + 1))}
                  disabled={quantity >= 20}>
                  <Plus className="size-3" />
                </Button>
              </div>
            </div>

            {/* Add-ons */}
            {item.addons.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Add-ons</p>
                <div className="space-y-2 rounded-lg border p-3">
                  {item.addons.filter((a) => a.isAvailable).map((addon) => (
                    <label key={addon._id} className="flex items-center justify-between cursor-pointer">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={addon._id}
                          checked={selectedAddons.includes(addon._id)}
                          onCheckedChange={() => toggleAddon(addon._id)}
                        />
                        <span className="text-sm">{addon.name}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {addon.price > 0 ? `+${formatINR(addon.price)}` : "Free"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Special Instructions */}
            <div className="space-y-2">
              <p className="text-sm font-semibold">Special Instructions</p>
              <Textarea
                placeholder="e.g. Less spicy, no onion, extra sauce..."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={2}
                className="text-sm"
              />
            </div>

            <DialogFooter>
              <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
              <Button onClick={handleAdd} disabled={loading} className="flex-1">
                {loading ? "Adding..." : `Add to Cart · ${formatINR(total)}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
