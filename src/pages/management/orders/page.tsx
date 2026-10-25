import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { formatINR, orderStatusColor, timeAgo, formatTime } from "@/lib/restaurant.ts";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import {
  ClipboardList,
  CheckCircle,
  Bell,
  Star,
  X,
  User,
  Clock,
  Eye,
  UtensilsCrossed,
  CalendarDays,
} from "lucide-react";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";

// ─── Types ────────────────────────────────────────────────────────────────────

type MainTab = "active" | "all";
type ActiveFilter = "all" | "placed" | "accepted" | "ready";
type AllFilter = "all" | "served" | "rejected";

// ─── Status badge helper ───────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const labelMap: Record<string, string> = {
    placed: "New",
    accepted: "Accepted",
    preparing: "Preparing",
    ready: "Ready",
    served: "Completed",
    cancelled: "Cancelled",
    rejected: "Rejected",
  };

  const colorMap: Record<string, string> = {
    placed: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
    accepted: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30",
    preparing: "bg-orange-500/15 text-orange-400 border border-orange-500/30",
    ready: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    served: "bg-green-500/15 text-green-400 border border-green-500/30",
    cancelled: "bg-red-500/15 text-red-400 border border-red-500/30",
    rejected: "bg-red-500/15 text-red-400 border border-red-500/30",
  };

  return (
    <span
      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
        colorMap[status] ?? "bg-zinc-700 text-zinc-300"
      }`}
    >
      {labelMap[status] ?? status}
    </span>
  );
}

// ─── Order Detail Dialog ───────────────────────────────────────────────────────

type AnyOrder = NonNullable<
  ReturnType<typeof useQuery<typeof api.orders.listActiveOrders>>
>[number];

function OrderDetailDialog({
  order,
  onClose,
}: {
  order: AnyOrder | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!order} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-[#16161a] border-[#27272b] text-zinc-100 max-w-lg">
        <DialogHeader className="border-b border-[#27272b] pb-3">
          <div className="flex items-center justify-between gap-2 pr-6">
            <DialogTitle className="text-lg font-mono font-bold text-white">
              {order?.orderNumber}
            </DialogTitle>
            {order && <StatusBadge status={order.status} />}
          </div>
          <div className="pt-2 flex items-center gap-2">
            <span className="text-xs text-zinc-400">Customer:</span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-orange-500/15 border border-orange-500/30 text-orange-400">
              <User className="size-3.5" />
              <span>{order?.customerName ?? "Guest"}</span>
            </span>
          </div>
        </DialogHeader>

        {order && (
          <div className="space-y-4 py-2 text-sm">
            <div className="grid grid-cols-2 gap-2 text-xs bg-[#101014] p-3 rounded-xl border border-[#222228]">
              <div>
                <span className="text-zinc-500">Table: </span>
                <strong className="text-white">
                  Table {order.table?.tableNumber ?? "?"}
                </strong>
              </div>
              <div>
                <span className="text-zinc-500">Session: </span>
                <strong className="font-mono text-zinc-300">
                  {order.sessionNumber ?? order.session?.sessionNumber ?? "—"}
                </strong>
              </div>
              <div>
                <span className="text-zinc-500">Placed: </span>
                <span className="text-zinc-300">{timeAgo(order.placedAt)}</span>
              </div>
              <div>
                <span className="text-zinc-500">Total: </span>
                <strong className="text-orange-400 font-mono">
                  {formatINR(order.total)}
                </strong>
              </div>
            </div>

            {order.rejectionReason && (
              <div className="p-2.5 rounded-xl bg-red-950/30 border border-red-500/30 text-xs text-red-300">
                Rejection Reason: {order.rejectionReason}
              </div>
            )}

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                Ordered Items
              </h4>
              <div className="space-y-2 border border-[#222228] rounded-xl p-3 bg-[#101014]">
                {order.items?.map((item) => (
                  <div key={item._id} className="text-xs space-y-0.5">
                    <div className="flex justify-between font-semibold text-white">
                      <span>
                        {item.quantity}× {item.menuItemName}
                      </span>
                      <span className="font-mono">{formatINR(item.lineTotal)}</span>
                    </div>
                    {item.addons?.map((a) => (
                      <p key={a._id} className="text-orange-400/90 pl-3">
                        + {a.addonName} ({formatINR(a.addonPrice)})
                      </p>
                    ))}
                    {item.specialInstructions && (
                      <p className="text-orange-300/80 pl-3 italic">
                        Note: "{item.specialInstructions}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="border-t border-[#27272b] pt-3">
          <Button
            variant="secondary"
            onClick={onClose}
            className="bg-[#222228] hover:bg-[#2d2d34] text-white border-none"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reject Reason Dialog ─────────────────────────────────────────────────────

function RejectDialog({
  orderId,
  onConfirm,
  onClose,
}: {
  orderId: Id<"orders"> | null;
  onConfirm: (id: Id<"orders">, reason: string | undefined) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");

  return (
    <Dialog open={!!orderId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-[#16161a] border-[#27272b] text-zinc-100">
        <DialogHeader>
          <DialogTitle className="text-white">Reject Order</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-zinc-400">
            Provide an optional reason for rejecting this order so the customer can be
            notified.
          </p>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Item out of stock or kitchen closed..."
            rows={3}
            className="bg-[#101014] border-[#282830] text-white placeholder-zinc-500 focus:border-orange-500"
          />
        </div>
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={onClose}
            className="bg-[#222228] hover:bg-[#2d2d34] text-white border-none"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={async () => {
              if (orderId) {
                await onConfirm(orderId, reason.trim() || undefined);
                onClose();
              }
            }}
          >
            Confirm Rejection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Active Order Card ─────────────────────────────────────────────────────────

function ActiveOrderCard({
  order,
  onStatus,
  onReject,
  onViewDetail,
}: {
  order: AnyOrder;
  onStatus: (id: Id<"orders">, status: "accepted" | "ready" | "served") => Promise<void>;
  onReject: (id: Id<"orders">) => void;
  onViewDetail: (order: AnyOrder) => void;
}) {
  const tableNum = order.table?.tableNumber ?? "?";
  const sessionNum = order.sessionNumber ?? order.session?.sessionNumber ?? "—";

  return (
    <div className="bg-[#16161a] border border-[#27272b] hover:border-[#383840] rounded-2xl overflow-hidden shadow-lg transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-[#242429] bg-[#141418]">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono font-extrabold text-base sm:text-lg text-white">
            {order.orderNumber}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-orange-500/15 border border-orange-500/30 text-orange-400">
            <User className="size-3.5" />
            {order.customerName}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#202026] border border-[#2c2c34] text-zinc-300">
            <span>Table {tableNum}</span>
            <span className="text-zinc-500">•</span>
            <span className="font-mono text-zinc-400">{sessionNum}</span>
          </span>
          <StatusBadge status={order.status} />
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-zinc-400 flex items-center gap-1">
            <Clock className="size-3.5 text-zinc-500" />
            {timeAgo(order.placedAt)}
          </span>
          <span className="font-extrabold text-lg sm:text-xl text-orange-400 font-mono">
            {formatINR(order.total)}
          </span>
        </div>
      </div>

      {/* Items */}
      <div className="px-4 sm:px-5 py-3.5 space-y-2">
        <div className="divide-y divide-[#222228]">
          {order.items.map((item) => (
            <div key={item._id} className="py-2 first:pt-0 last:pb-0">
              <div className="flex justify-between items-baseline text-sm">
                <span className="font-bold text-white">
                  {item.quantity}× {item.menuItemName}
                </span>
                <span className="font-mono text-zinc-300 text-xs sm:text-sm">
                  {formatINR(item.lineTotal)}
                </span>
              </div>
              {item.addons.length > 0 && (
                <div className="mt-1 pl-4 flex flex-wrap gap-1.5">
                  {item.addons.map((a) => (
                    <span
                      key={a._id}
                      className="text-xs text-orange-400/90 bg-orange-500/10 px-2 py-0.5 rounded-md"
                    >
                      + {a.addonName} ({formatINR(a.addonPrice)})
                    </span>
                  ))}
                </div>
              )}
              {item.specialInstructions && (
                <p className="text-xs text-orange-300 pl-4 mt-1 italic">
                  Note: "{item.specialInstructions}"
                </p>
              )}
            </div>
          ))}
        </div>
        {order.rejectionReason && (
          <div className="mt-2 p-2.5 rounded-xl bg-red-950/30 border border-red-500/30 text-xs text-red-300">
            Rejection Reason: {order.rejectionReason}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 sm:px-5 py-3 border-t border-[#242429] bg-[#121215] flex flex-wrap items-center justify-between gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onViewDetail(order)}
          className="text-xs text-zinc-400 hover:text-white hover:bg-[#202026] gap-1.5 h-8 cursor-pointer"
        >
          <Eye className="size-3.5" />
          View Details
        </Button>

        <div className="flex flex-wrap items-center gap-2">
          {/* New (placed): Accept or Reject */}
          {order.status === "placed" && (
            <>
              <Button
                size="sm"
                onClick={() => onStatus(order._id, "accepted")}
                className="bg-green-600 hover:bg-green-700 text-white font-bold gap-1.5 h-8 px-3 rounded-lg text-xs cursor-pointer shadow-sm"
              >
                <CheckCircle className="size-3.5" /> Accept
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onReject(order._id)}
                className="font-bold gap-1.5 h-8 px-3 rounded-lg text-xs cursor-pointer"
              >
                <X className="size-3.5" /> Reject
              </Button>
            </>
          )}

          {/* Accepted: Mark Ready (no reject allowed) */}
          {order.status === "accepted" && (
            <Button
              size="sm"
              onClick={() => onStatus(order._id, "ready")}
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold gap-1.5 h-8 px-3 rounded-lg text-xs cursor-pointer shadow-md shadow-orange-500/20"
            >
              <Bell className="size-3.5" /> Mark Ready
            </Button>
          )}

          {/* Legacy preparing status: Mark Ready */}
          {order.status === "preparing" && (
            <Button
              size="sm"
              onClick={() => onStatus(order._id, "ready")}
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold gap-1.5 h-8 px-3 rounded-lg text-xs cursor-pointer shadow-md shadow-orange-500/20"
            >
              <Bell className="size-3.5" /> Mark Ready
            </Button>
          )}

          {/* Ready: Mark Served */}
          {order.status === "ready" && (
            <Button
              size="sm"
              onClick={() => onStatus(order._id, "served")}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold gap-1.5 h-8 px-3 rounded-lg text-xs cursor-pointer shadow-md"
            >
              <Star className="size-3.5" /> Mark Served
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── All Orders Table Row ──────────────────────────────────────────────────────

type AllOrder = NonNullable<
  ReturnType<typeof useQuery<typeof api.orders.listAllOrdersForManagement>>
>[number];

function AllOrdersRow({
  order,
  onViewDetail,
}: {
  order: AllOrder;
  onViewDetail: (order: AllOrder) => void;
}) {
  const tableNum = order.table?.tableNumber ?? "?";

  const displayStatus =
    order.status === "served" ? "Completed" : order.status === "rejected" ? "Rejected" : order.status;
  const rowStatusClass =
    order.status === "served"
      ? "text-green-400"
      : order.status === "rejected"
      ? "text-red-400"
      : "text-zinc-400";

  return (
    <tr className="border-b border-[#222228] hover:bg-[#1a1a1f] transition-colors group">
      <td className="px-4 py-3 font-mono text-sm font-bold text-white whitespace-nowrap">
        {order.orderNumber}
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-400">
          <User className="size-3.5" />
          {order.customerName}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-zinc-300 whitespace-nowrap">
        Table {tableNum}
      </td>
      <td className="px-4 py-3">
        <div className="space-y-0.5">
          {order.items.slice(0, 3).map((item) => (
            <div key={item._id} className="text-xs text-zinc-300">
              {item.quantity}× {item.menuItemName}
            </div>
          ))}
          {order.items.length > 3 && (
            <div className="text-xs text-zinc-500">+{order.items.length - 3} more</div>
          )}
        </div>
      </td>
      <td className="px-4 py-3 font-mono font-bold text-orange-400 text-sm whitespace-nowrap">
        {formatINR(order.total)}
      </td>
      <td className="px-4 py-3">
        <span
          className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
            order.status === "served"
              ? "bg-green-500/15 text-green-400 border border-green-500/30"
              : order.status === "rejected"
              ? "bg-red-500/15 text-red-400 border border-red-500/30"
              : "bg-zinc-700/50 text-zinc-300 border border-zinc-600/30"
          }`}
        >
          {displayStatus}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-zinc-400 whitespace-nowrap">
        <div className="flex flex-col gap-0.5">
          <span>{formatTime(order.placedAt)}</span>
          <span className="text-zinc-500">{timeAgo(order.placedAt)}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onViewDetail(order)}
          className="text-xs text-zinc-400 hover:text-white hover:bg-[#202026] gap-1.5 h-7 cursor-pointer"
        >
          <Eye className="size-3.5" />
          View
        </Button>
      </td>
    </tr>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const [mainTab, setMainTab] = useState<MainTab>("active");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [allFilter, setAllFilter] = useState<AllFilter>("all");
  const [rejectOrderId, setRejectOrderId] = useState<Id<"orders"> | null>(null);
  const [detailOrder, setDetailOrder] = useState<AnyOrder | null>(null);

  const activeOrders = useQuery(api.orders.listActiveOrders, {});
  const allOrders = useQuery(api.orders.listAllOrdersForManagement, {});
  const updateStatus = useMutation(api.orders.updateOrderStatus);

  // ── Action handler ─────────────────────────────────────────────────

  const handleStatus = async (
    orderId: Id<"orders">,
    status: "accepted" | "ready" | "served" | "rejected",
    reason?: string
  ) => {
    try {
      await updateStatus({ orderId, status, rejectionReason: reason });
      const label =
        status === "accepted"
          ? "Accepted"
          : status === "ready"
          ? "Marked as Ready"
          : status === "served"
          ? "Marked as Served"
          : "Rejected";
      toast.success(`Order ${label}`);
      if (detailOrder?._id === orderId) {
        setDetailOrder((prev) => (prev ? { ...prev, status } : null));
      }
    } catch (e) {
      if (e instanceof ConvexError) toast.error(e.data.message);
      else toast.error("Failed to update order");
    }
  };

  // ── Derived counts ─────────────────────────────────────────────────

  const newCount = activeOrders?.filter((o) => o.status === "placed").length ?? 0;
  const acceptedCount =
    activeOrders?.filter((o) => o.status === "accepted" || o.status === "preparing").length ?? 0;
  const readyCount = activeOrders?.filter((o) => o.status === "ready").length ?? 0;
  const activeTotal = (activeOrders?.length ?? 0);

  const completedCount = allOrders?.filter((o) => o.status === "served").length ?? 0;
  const rejectedCount = allOrders?.filter((o) => o.status === "rejected").length ?? 0;
  const allTotal = allOrders?.length ?? 0;

  // ── Filtered lists ─────────────────────────────────────────────────

  const filteredActive =
    activeOrders?.filter((o) => {
      if (activeFilter === "all") return true;
      if (activeFilter === "placed") return o.status === "placed";
      if (activeFilter === "accepted") return o.status === "accepted" || o.status === "preparing";
      if (activeFilter === "ready") return o.status === "ready";
      return true;
    }) ?? [];

  const filteredAll =
    allOrders?.filter((o) => {
      if (allFilter === "all") return true;
      if (allFilter === "served") return o.status === "served";
      if (allFilter === "rejected") return o.status === "rejected" || o.status === "cancelled";
      return true;
    }) ?? [];

  const activeLoading = activeOrders === undefined;
  const allLoading = allOrders === undefined;

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto text-zinc-100">
      {/* ── Page Header ───────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#27272b]">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            Orders Management
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time live kitchen &amp; dining room order tracking
          </p>
        </div>
        {activeOrders && (
          <div className="inline-flex items-center gap-2 bg-[#16161a] border border-[#27272b] px-3.5 py-1.5 rounded-full text-xs font-semibold self-start sm:self-auto">
            <span className="size-2 rounded-full bg-orange-500 animate-pulse" />
            <span className="text-zinc-300">
              {activeTotal} active {activeTotal === 1 ? "order" : "orders"}
            </span>
          </div>
        )}
      </div>

      {/* ── Main Tabs: Active Orders | All Orders ─────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setMainTab("active")}
          className={`flex flex-col items-center justify-center gap-1 py-4 px-6 rounded-2xl border font-bold transition-all cursor-pointer ${
            mainTab === "active"
              ? "bg-orange-500 border-orange-400 text-white shadow-lg shadow-orange-500/20"
              : "bg-[#16161a] border-[#27272b] text-zinc-400 hover:border-[#383840] hover:text-white"
          }`}
        >
          <div className="flex items-center gap-2 text-base sm:text-lg">
            <UtensilsCrossed className="size-5" />
            <span>Active Orders</span>
          </div>
          <span
            className={`text-2xl font-black ${
              mainTab === "active" ? "text-white" : "text-orange-400"
            }`}
          >
            {activeOrders === undefined ? "…" : activeTotal}
          </span>
          <span className="text-xs font-normal opacity-70">live orders</span>
        </button>

        <button
          onClick={() => setMainTab("all")}
          className={`flex flex-col items-center justify-center gap-1 py-4 px-6 rounded-2xl border font-bold transition-all cursor-pointer ${
            mainTab === "all"
              ? "bg-orange-500 border-orange-400 text-white shadow-lg shadow-orange-500/20"
              : "bg-[#16161a] border-[#27272b] text-zinc-400 hover:border-[#383840] hover:text-white"
          }`}
        >
          <div className="flex items-center gap-2 text-base sm:text-lg">
            <CalendarDays className="size-5" />
            <span>All Orders</span>
          </div>
          <span
            className={`text-2xl font-black ${
              mainTab === "all" ? "text-white" : "text-orange-400"
            }`}
          >
            {allOrders === undefined ? "…" : allTotal}
          </span>
          <span className="text-xs font-normal opacity-70">total orders</span>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          ACTIVE ORDERS SECTION
          ══════════════════════════════════════════════════════════════ */}
      {mainTab === "active" && (
        <div className="space-y-4">
          {/* Sub-filters */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {(
              [
                { id: "all" as ActiveFilter, label: "All Active", count: activeTotal },
                { id: "placed" as ActiveFilter, label: "New", count: newCount },
                { id: "accepted" as ActiveFilter, label: "Accepted", count: acceptedCount },
                { id: "ready" as ActiveFilter, label: "Ready", count: readyCount },
              ] as { id: ActiveFilter; label: string; count: number }[]
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer ${
                  activeFilter === tab.id
                    ? "bg-orange-500 text-white shadow-md shadow-orange-500/20"
                    : "bg-[#16161a] border border-[#27272b] text-zinc-400 hover:text-white hover:border-[#383840]"
                }`}
              >
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                      activeFilter === tab.id
                        ? "bg-black/30 text-white"
                        : "bg-[#25252c] text-zinc-300"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Cards */}
          {activeLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-44 w-full rounded-2xl bg-[#16161a]" />
              ))}
            </div>
          ) : filteredActive.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ClipboardList className="text-zinc-500" />
                </EmptyMedia>
                <EmptyTitle className="text-white">No active orders</EmptyTitle>
                <EmptyDescription className="text-zinc-400">
                  {activeFilter === "all"
                    ? "There are no active orders at the moment."
                    : `No orders with status "${activeFilter}" right now.`}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-4">
              {filteredActive.map((order) => (
                <ActiveOrderCard
                  key={order._id}
                  order={order}
                  onStatus={(id, status) => handleStatus(id, status)}
                  onReject={(id) => setRejectOrderId(id)}
                  onViewDetail={(o) => setDetailOrder(o)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          ALL ORDERS SECTION
          ══════════════════════════════════════════════════════════════ */}
      {mainTab === "all" && (
        <div className="space-y-4">
          {/* Sub-filters */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {(
              [
                { id: "all" as AllFilter, label: "All Orders", count: allTotal },
                { id: "served" as AllFilter, label: "Completed", count: completedCount },
                { id: "rejected" as AllFilter, label: "Rejected", count: rejectedCount },
              ] as { id: AllFilter; label: string; count: number }[]
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setAllFilter(tab.id)}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer ${
                  allFilter === tab.id
                    ? "bg-orange-500 text-white shadow-md shadow-orange-500/20"
                    : "bg-[#16161a] border border-[#27272b] text-zinc-400 hover:text-white hover:border-[#383840]"
                }`}
              >
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                      allFilter === tab.id
                        ? "bg-black/30 text-white"
                        : tab.id === "served"
                        ? "bg-green-900/50 text-green-300"
                        : tab.id === "rejected"
                        ? "bg-red-900/50 text-red-300"
                        : "bg-[#25252c] text-zinc-300"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Table */}
          {allLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl bg-[#16161a]" />
              ))}
            </div>
          ) : filteredAll.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ClipboardList className="text-zinc-500" />
                </EmptyMedia>
                <EmptyTitle className="text-white">No orders found</EmptyTitle>
                <EmptyDescription className="text-zinc-400">
                  {allFilter === "served"
                    ? "No completed orders yet."
                    : allFilter === "rejected"
                    ? "No rejected orders in history."
                    : "No orders have been placed yet."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="rounded-2xl border border-[#27272b] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#141418] border-b border-[#27272b]">
                      {[
                        "Order #",
                        "Customer",
                        "Table",
                        "Items",
                        "Total",
                        "Status",
                        "Time",
                        "",
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500 whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-[#16161a]">
                    {filteredAll.map((order) => (
                      <AllOrdersRow
                        key={order._id}
                        order={order}
                        onViewDetail={(o) => setDetailOrder(o as AnyOrder)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Dialogs ────────────────────────────────────────────────── */}
      <OrderDetailDialog order={detailOrder} onClose={() => setDetailOrder(null)} />

      <RejectDialog
        orderId={rejectOrderId}
        onConfirm={async (id, reason) => {
          await handleStatus(id, "rejected", reason);
        }}
        onClose={() => setRejectOrderId(null)}
      />
    </div>
  );
}
