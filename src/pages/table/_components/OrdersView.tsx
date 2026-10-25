import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { formatINR, orderStatusColor, isCancellable, secondsUntilDeadline, timeAgo } from "@/lib/restaurant.ts";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import {
  ClipboardList,
  Clock,
  Receipt,
  BellRing,
  UserRound,
  FileText,
  HelpCircle,
  ChevronUp,
} from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";

interface Props {
  sessionId: Id<"table_sessions">;
}

function CancelTimer({
  deadline,
  orderId,
  sessionId,
}: {
  deadline: string;
  orderId: Id<"orders">;
  sessionId: Id<"table_sessions">;
  status: string;
}) {
  const [secs, setSecs] = useState(() => secondsUntilDeadline(deadline));
  const cancelOrder = useMutation(api.orders.cancelOrder);

  useEffect(() => {
    if (secs <= 0) return;
    const interval = setInterval(() => {
      setSecs(secondsUntilDeadline(deadline));
    }, 1000);
    return () => clearInterval(interval);
  }, [deadline, secs]);

  const handleCancel = async () => {
    try {
      await cancelOrder({ orderId, sessionId });
      toast.success("Order cancelled");
    } catch (e) {
      if (e instanceof ConvexError) toast.error(e.data.message);
      else toast.error("Cannot cancel this order");
    }
  };

  if (secs <= 0) return null;

  const mins = Math.floor(secs / 60);
  const s = secs % 60;
  return (
    <Button
      variant="secondary"
      size="sm"
      className="text-xs h-7 gap-1"
      onClick={handleCancel}
    >
      <Clock className="size-3" />
      Cancel ({mins}:{String(s).padStart(2, "0")})
    </Button>
  );
}

// ── Floating Request Service FAB ──
function RequestServiceFAB({ sessionId }: { sessionId: Id<"table_sessions"> }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const createRequest = useMutation(api.requests.createWaiterRequest);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleRequest = async (requestType: "waiter" | "bill" | "assistance") => {
    setLoading(requestType);
    try {
      await createRequest({ sessionId, requestType });
      const labels: Record<string, string> = {
        waiter: "Waiter called! Staff will be with you shortly.",
        bill: "Bill requested! Staff will bring your bill.",
        assistance: "Assistance requested! Staff will come to help.",
      };
      toast.success(labels[requestType]);
      setOpen(false);
    } catch (e) {
      if (e instanceof ConvexError) {
        // Duplicate request — still inform nicely
        toast.info("Your request is already being processed.");
      } else {
        toast.error("Failed to send request. Please try again.");
      }
      setOpen(false);
    } finally {
      setLoading(null);
    }
  };

  const options: {
    type: "waiter" | "bill" | "assistance";
    label: string;
    sublabel: string;
    icon: React.ReactNode;
  }[] = [
    {
      type: "waiter",
      label: "Call Waiter",
      sublabel: "Request a waiter at your table",
      icon: <UserRound className="size-4 text-orange-400" />,
    },
    {
      type: "bill",
      label: "Request Bill",
      sublabel: "Ask staff to bring your bill",
      icon: <FileText className="size-4 text-orange-400" />,
    },
    {
      type: "assistance",
      label: "Request Assistance",
      sublabel: "Get help from our team",
      icon: <HelpCircle className="size-4 text-orange-400" />,
    },
  ];

  return (
    <div ref={menuRef} className="fixed bottom-6 right-5 z-50 flex flex-col items-end gap-2">
      {/* Dropdown menu */}
      {open && (
        <div className="bg-[#18181c] border border-[#2e2e36] rounded-2xl shadow-2xl overflow-hidden w-64 animate-in slide-in-from-bottom-2 fade-in duration-150">
          <div className="px-4 py-3 border-b border-[#26262e]">
            <p className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Request Service</p>
          </div>
          <div className="py-1">
            {options.map((opt) => (
              <button
                key={opt.type}
                disabled={loading !== null}
                onClick={() => handleRequest(opt.type)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-orange-500/10 transition-colors disabled:opacity-50 cursor-pointer group"
              >
                <div className="bg-[#26262e] group-hover:bg-orange-500/10 rounded-xl p-2 transition-colors">
                  {opt.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {loading === opt.type ? "Sending…" : opt.label}
                  </p>
                  <p className="text-[11px] text-zinc-400 truncate">{opt.sublabel}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* FAB Button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-2xl border font-bold text-sm transition-all active:scale-95 cursor-pointer ${
          open
            ? "bg-[#1e1e24] border-orange-500/50 text-orange-300 shadow-orange-500/10"
            : "bg-orange-500 border-orange-400 text-white shadow-orange-500/30 hover:bg-orange-600"
        }`}
        title="Request Service"
      >
        {open ? (
          <>
            <ChevronUp className="size-4" />
            <span>Close</span>
          </>
        ) : (
          <>
            <BellRing className="size-4" />
            <span>Request Service</span>
          </>
        )}
      </button>
    </div>
  );
}

// ── Main OrdersView ──
export default function OrdersView({ sessionId }: Props) {
  const orders = useQuery(api.orders.getOrdersForSession, { sessionId });
  const billData = useQuery(api.payments.getBillForSession, { sessionId });

  if (orders === undefined) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2].map((i) => <Skeleton key={i} className="h-32 w-full rounded-2xl bg-[#1a1a20]" />)}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="relative min-h-[60vh]">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ClipboardList /></EmptyMedia>
            <EmptyTitle>No orders yet</EmptyTitle>
            <EmptyDescription>Place your first order from the menu</EmptyDescription>
          </EmptyHeader>
        </Empty>
        <RequestServiceFAB sessionId={sessionId} />
      </div>
    );
  }

  const statusLabels: Record<string, string> = {
    placed: "Order Placed",
    accepted: "Accepted",
    preparing: "Preparing",
    ready: "Ready for Pickup",
    served: "Served",
    cancelled: "Cancelled",
    rejected: "Rejected",
  };

  const statusSteps = ["placed", "accepted", "preparing", "ready", "served"];

  return (
    <div className="relative max-w-2xl mx-auto p-4 space-y-4 pb-24 text-zinc-100">
      {orders.map((order) => {
        const currentStep = statusSteps.indexOf(order.status);
        const canCancel = isCancellable(order.cancellationDeadline, order.status);

        return (
          <div key={order._id} className="bg-[#16161a] border border-[#27272b] rounded-2xl overflow-hidden">
            {/* Order Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#27272b] bg-[#18181c]">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-bold text-sm text-white">{order.orderNumber}</p>
                  <span className="text-xs text-orange-400 font-semibold">
                    • {order.customerName || "Guest"}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">{timeAgo(order.placedAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${orderStatusColor(order.status)}`}>
                  {statusLabels[order.status] ?? order.status}
                </span>
              </div>
            </div>

            {/* Status progress bar */}
            {!["cancelled", "rejected"].includes(order.status) && (
              <div className="px-4 py-2 border-b border-[#27272b]">
                <div className="flex items-center gap-1">
                  {statusSteps.map((step, idx) => (
                    <div key={step} className="flex-1 flex items-center">
                      <div className={`h-1.5 rounded-full flex-1 transition-colors ${
                        idx <= currentStep ? "bg-orange-500" : "bg-[#2e2e36]"
                      }`} />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-1">
                  {statusSteps.map((step) => (
                    <span key={step} className="text-[9px] text-zinc-500 capitalize">{step}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Items */}
            <div className="px-4 py-3 space-y-2">
              {order.items.map((item) => (
                <div key={item._id}>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-200">{item.quantity}× {item.menuItemName}</span>
                    <span className="font-medium text-orange-400 font-mono">{formatINR(item.lineTotal)}</span>
                  </div>
                  {item.addons.length > 0 && (
                    <p className="text-xs text-zinc-400 pl-4">
                      + {item.addons.map((a) => a.addonName).join(", ")}
                    </p>
                  )}
                  {item.specialInstructions && (
                    <p className="text-xs text-orange-400 pl-4 italic">"{item.specialInstructions}"</p>
                  )}
                </div>
              ))}
              {order.rejectionReason && (
                <p className="text-xs text-red-400">Reason: {order.rejectionReason}</p>
              )}
            </div>

            <div className="px-4 pb-3 flex items-center justify-between">
              <span className="font-bold text-white">{formatINR(order.total)}</span>
              {canCancel && (
                <CancelTimer
                  deadline={order.cancellationDeadline}
                  orderId={order._id}
                  sessionId={sessionId}
                  status={order.status}
                />
              )}
            </div>
          </div>
        );
      })}

      {/* Bill Summary */}
      {billData?.bill && (
        <div className="bg-[#16161a] border border-[#27272b] rounded-2xl p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#27272b] pb-2.5">
            <div className="flex items-center gap-2">
              <Receipt className="size-4 text-orange-400" />
              <h3 className="font-bold text-sm text-white">Bill Summary</h3>
            </div>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                billData.bill.status === "paid"
                  ? "bg-green-900/40 text-green-400 border border-green-500/30"
                  : billData.bill.status === "partial"
                  ? "bg-yellow-900/40 text-yellow-400 border border-yellow-500/30"
                  : "bg-red-900/40 text-red-400 border border-red-500/30"
              }`}
            >
              {billData.bill.status}
            </span>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-zinc-300">
              <span>Food Subtotal</span>
              <span className="font-medium font-mono">
                {formatINR(billData.bill.subtotal ?? billData.bill.totalAmount)}
              </span>
            </div>

            {billData.bill.serviceChargeEnabled && (billData.bill.serviceChargeAmount ?? 0) > 0 && (
              <div className="flex justify-between items-center text-xs text-zinc-300">
                <span>
                  Service Charge ({billData.bill.serviceChargePercentage}%)
                  <span className="text-[10px] block text-zinc-500">
                    {billData.bill.serviceChargeBasis === "subtotal_with_gst"
                      ? "on subtotal + GST"
                      : "on food subtotal"}
                  </span>
                </span>
                <span className="font-medium text-orange-400 font-mono">
                  +{formatINR(billData.bill.serviceChargeAmount!)}
                </span>
              </div>
            )}

            {billData.bill.gstEnabled && (billData.bill.gstAmount ?? 0) > 0 && (
              <div className="flex justify-between items-center text-xs text-zinc-300">
                <span>GST ({billData.bill.gstPercentage}%)</span>
                <span className="font-medium text-orange-400 font-mono">
                  +{formatINR(billData.bill.gstAmount!)}
                </span>
              </div>
            )}

            <div className="flex justify-between border-t border-[#27272b] pt-2 font-bold text-base">
              <span className="text-white">Total Payable</span>
              <span className="text-orange-400 font-mono">{formatINR(billData.bill.totalAmount)}</span>
            </div>

            {billData.bill.paidAmount > 0 && (
              <>
                <div className="flex justify-between text-xs text-green-400 font-medium">
                  <span>Paid Amount</span>
                  <span className="font-mono">{formatINR(billData.bill.paidAmount)}</span>
                </div>
                <div className="flex justify-between border-t border-[#27272b] pt-1.5 font-bold">
                  <span className="text-white">Balance Due</span>
                  <span className={`font-mono ${billData.remaining === 0 ? "text-green-400" : "text-red-400"}`}>
                    {formatINR(billData.remaining)}
                  </span>
                </div>
              </>
            )}
          </div>

          <p className="text-[11px] text-zinc-500 border-t border-[#27272b] pt-2 italic">
            Taxes and service charges are calculated according to restaurant policy.
            You can settle your bill directly with the service staff.
          </p>
        </div>
      )}

      {/* Floating Request Service FAB */}
      <RequestServiceFAB sessionId={sessionId} />
    </div>
  );
}
