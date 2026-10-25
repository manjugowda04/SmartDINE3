import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Spinner } from "@/components/ui/spinner.tsx";
import { UtensilsCrossed } from "lucide-react";
import MenuView from "./MenuView.tsx";
import CartView from "./CartView.tsx";
import OrdersView from "./OrdersView.tsx";

// Service tab removed — Request Service is now a floating button inside OrdersView

type Tab = "menu" | "cart" | "orders";

interface Props {
  sessionId: Id<"table_sessions">;
  tableNumber: number;
  restaurantName?: string;
  restaurantId?: Id<"restaurants">;
  customerName?: string;
}

export default function SessionDining({
  sessionId,
  tableNumber,
  restaurantName,
  restaurantId,
  customerName,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("menu");
  const session = useQuery(api.sessions.getSessionById, { sessionId });
  const cart = useQuery(api.cart.getCart, { sessionId });

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0c0c0e]">
        <Spinner className="size-8 text-orange-500" />
      </div>
    );
  }

  if (!session || session.status === "closed") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0c0c0e] px-4 text-center gap-4 text-zinc-100">
        <UtensilsCrossed className="size-12 text-zinc-600" />
        <h1 className="text-2xl font-bold">Session Ended</h1>
        <p className="text-zinc-400">
          Your dining session has been closed. Thank you for dining with us!
        </p>
      </div>
    );
  }

  const effectiveRestaurantId = restaurantId ?? session.restaurantId;
  const cartCount = cart?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "menu", label: "Menu" },
    { id: "cart", label: "Cart", badge: cartCount > 0 ? cartCount : undefined },
    { id: "orders", label: "Orders" },
    // Service tab removed — now a floating button inside OrdersView
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#0c0c0e] text-zinc-100 selection:bg-orange-500/30 selection:text-orange-200">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#121215]/95 backdrop-blur-md border-b border-[#27272b] px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="bg-orange-500 rounded-xl p-2 shadow-md shadow-orange-500/20">
            <UtensilsCrossed className="size-4 text-white" />
          </div>
          <div>
            <p className="font-extrabold text-sm sm:text-base leading-none text-white tracking-tight">
              {restaurantName ?? "SmartDine"}
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">
              Table {tableNumber} · <span className="font-mono text-zinc-300">{session.sessionNumber}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {customerName && (
            <span className="text-xs font-medium text-orange-300 bg-orange-500/10 border border-orange-500/20 px-2.5 py-1 rounded-full">
              Hi, {customerName} 👋
            </span>
          )}
          <div className="text-xs font-medium text-zinc-400 bg-[#1c1c22] border border-[#2b2b34] px-2.5 py-1 rounded-full">
            {session.peopleCount} {session.peopleCount === 1 ? "guest" : "guests"}
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="sticky top-[57px] z-20 bg-[#16161a] border-b border-[#27272b]">
        <div className="flex max-w-7xl mx-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 text-sm font-semibold transition-all relative flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === tab.id
                  ? "text-orange-400 border-b-2 border-orange-500 bg-orange-500/5"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className="bg-orange-500 text-white rounded-full text-[10px] font-bold px-1.5 py-0.5 shadow-xs">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        {activeTab === "menu" && (
          <MenuView
            sessionId={sessionId}
            restaurantId={effectiveRestaurantId}
            onOpenCart={() => setActiveTab("cart")}
          />
        )}
        {activeTab === "cart" && (
          <CartView
            sessionId={sessionId}
            tableNumber={tableNumber}
            restaurantId={effectiveRestaurantId}
            customerName={customerName}
            onOrderPlaced={() => setActiveTab("orders")}
          />
        )}
        {activeTab === "orders" && (
          <OrdersView sessionId={sessionId} />
        )}
      </main>
    </div>
  );
}
