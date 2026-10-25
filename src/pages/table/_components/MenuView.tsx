import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Search, ShoppingCart, ArrowRight, X, Utensils, Sparkles, Leaf } from "lucide-react";
import { formatINR } from "@/lib/restaurant.ts";
import { MenuItemCard } from "./MenuItemCard.tsx";
import { CartSidebar } from "./CartSidebar.tsx";

interface Props {
  sessionId: Id<"table_sessions">;
  restaurantId?: Id<"restaurants">;
  onOpenCart?: () => void;
}

export default function MenuView({ sessionId, restaurantId, onOpenCart }: Props) {
  const menu = useQuery(api.menu.getMenuWithCategories, restaurantId ? { restaurantId } : {});
  const cart = useQuery(api.cart.getCart, { sessionId });

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [vegOnly, setVegOnly] = useState(false);

  // Cart summary calculations
  const cartItems = cart?.items ?? [];
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart?.total ?? 0;

  // Filtered menu
  const filteredMenu = useMemo(() => {
    if (!menu) return [];

    const query = searchQuery.trim().toLowerCase();

    return menu
      .filter((cat) => selectedCategoryId === "all" || cat._id === selectedCategoryId)
      .map((cat) => {
        const filteredItems = cat.items.filter((item) => {
          if (vegOnly && !item.isVeg) return false;
          if (!query) return true;
          const matchName = item.name.toLowerCase().includes(query);
          const matchDesc = item.description?.toLowerCase().includes(query) ?? false;
          return matchName || matchDesc;
        });
        return {
          ...cat,
          items: filteredItems,
        };
      })
      .filter((cat) => cat.items.length > 0);
  }, [menu, searchQuery, selectedCategoryId, vegOnly]);

  const totalVisibleItems = filteredMenu.reduce((sum, cat) => sum + cat.items.length, 0);

  if (menu === undefined) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-full bg-[#1e1e24]" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-2xl bg-[#1a1a20]" />
            ))}
          </div>
          <div className="hidden lg:block lg:col-span-4">
            <Skeleton className="h-96 w-full rounded-2xl bg-[#1a1a20]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-28 lg:pb-12 text-zinc-100">
      {/* Top Search & Filter Bar */}
      <div className="space-y-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search dishes, starters, desserts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#16161a] border border-[#27272b] focus:border-orange-500 rounded-xl pl-10 pr-9 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                title="Clear search"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* Veg Only Toggle */}
          <button
            onClick={() => setVegOnly((prev) => !prev)}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              vegOnly
                ? "bg-green-950/40 border-green-500/60 text-green-400 shadow-sm shadow-green-500/20"
                : "bg-[#16161a] border-[#27272b] text-zinc-400 hover:text-zinc-200 hover:border-[#383840]"
            }`}
          >
            <Leaf className={`size-3.5 ${vegOnly ? "text-green-400 fill-green-400" : "text-zinc-400"}`} />
            <span>Pure Veg Only</span>
          </button>
        </div>

        {/* Category Pills Navigation */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          <button
            onClick={() => setSelectedCategoryId("all")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
              selectedCategoryId === "all"
                ? "bg-orange-500 text-white shadow-md shadow-orange-500/25"
                : "bg-[#16161a] border border-[#27272b] text-zinc-400 hover:text-zinc-200 hover:border-[#383840]"
            }`}
          >
            All Items
          </button>

          {menu.map((category) => {
            const isSelected = selectedCategoryId === category._id;
            return (
              <button
                key={category._id}
                onClick={() => setSelectedCategoryId(category._id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-2 cursor-pointer ${
                  isSelected
                    ? "bg-orange-500 text-white shadow-md shadow-orange-500/25"
                    : "bg-[#16161a] border border-[#27272b] text-zinc-400 hover:text-zinc-200 hover:border-[#383840]"
                }`}
              >
                <span>{category.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isSelected ? "bg-black/30 text-white" : "bg-[#232328] text-zinc-400"
                  }`}
                >
                  {category.items.length}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Layout: Menu Items on Left, Persistent Cart Sidebar on Right (Desktop) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Food Items by Category */}
        <div className="lg:col-span-8 space-y-8">
          {totalVisibleItems === 0 ? (
            <div className="bg-[#16161a] border border-[#27272b] rounded-2xl p-12 text-center space-y-3">
              <Utensils className="size-10 text-zinc-500 mx-auto" />
              <h3 className="text-base font-semibold text-white">No dishes found</h3>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                No menu items match your search or filter criteria. Try clearing your filters to see more dishes.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategoryId("all");
                  setVegOnly(false);
                }}
                className="mt-2 border-[#2e2e34] text-zinc-300 hover:text-white hover:bg-[#202025]"
              >
                Reset Filters
              </Button>
            </div>
          ) : (
            filteredMenu.map((category) => (
              <section key={category._id} id={`category-${category._id}`} className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-[#27272b]">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-orange-400" />
                    <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                      {category.name}
                    </h2>
                  </div>
                  <span className="text-xs text-zinc-400 font-medium">
                    {category.items.length} {category.items.length === 1 ? "item" : "items"}
                  </span>
                </div>

                <div className="space-y-3">
                  {category.items.map((item) => (
                    <MenuItemCard
                      key={item._id}
                      item={item}
                      sessionId={sessionId}
                      cartItems={cartItems}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        {/* Right: Desktop Persistent Cart Sidebar */}
        <div className="hidden lg:block lg:col-span-4 sticky top-24">
          <CartSidebar
            sessionId={sessionId}
            restaurantId={restaurantId}
            onOpenCart={onOpenCart ?? (() => {})}
          />
        </div>
      </div>

      {/* Mobile Floating Cart Summary Bar */}
      {cartCount > 0 && onOpenCart && (
        <div className="fixed bottom-4 left-4 right-4 z-40 lg:hidden">
          <div className="bg-[#18181c]/95 backdrop-blur-md border border-orange-500/40 rounded-2xl p-3 shadow-2xl flex items-center justify-between gap-3 text-white">
            <div className="flex items-center gap-3 pl-1">
              <div className="relative bg-orange-500/20 text-orange-400 p-2.5 rounded-xl border border-orange-500/30">
                <ShoppingCart className="size-5" />
                <span className="absolute -top-1.5 -right-1.5 bg-orange-500 text-white text-[11px] font-black rounded-full size-5 flex items-center justify-center shadow-sm">
                  {cartCount}
                </span>
              </div>
              <div>
                <p className="text-[11px] text-zinc-400 uppercase tracking-wider font-semibold">
                  {cartCount} {cartCount === 1 ? "item" : "items"} added
                </p>
                <p className="text-base font-extrabold text-orange-400 leading-tight">
                  {formatINR(cartTotal)}
                </p>
              </div>
            </div>

            <Button
              onClick={onOpenCart}
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold h-11 px-4 rounded-xl shadow-lg shadow-orange-500/25 flex items-center gap-2 active:scale-95 transition-transform"
            >
              <span className="text-xs sm:text-sm">View Cart & Checkout</span>
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
