import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { formatINR } from "@/lib/restaurant.ts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { QrCode, Copy, Check, Smartphone, Wallet } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  sessionId: Id<"table_sessions">;
  restaurantId: Id<"restaurants">;
}

export default function PayBillModal({ open, onClose, sessionId, restaurantId }: Props) {
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const restaurantInfo = useQuery(api.restaurants.getRestaurantPublicInfo, { restaurantId });
  const billData = useQuery(api.payments.getBillForSession, { sessionId });
  const requestVerification = useMutation(api.payments.requestPaymentVerification);

  const upiId = restaurantInfo?.upiId;
  const upiQrUrl = restaurantInfo?.upiQrUrl;
  const restaurantName = restaurantInfo?.name ?? "Restaurant";
  const remaining = billData?.remaining ?? 0;

  const handleCopyUpi = async () => {
    if (!upiId) return;
    try {
      await navigator.clipboard.writeText(upiId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const handleOpenUpiApp = () => {
    if (!upiId) return;
    const amount = (remaining / 100).toFixed(2);
    const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(restaurantName)}&am=${amount}&cu=INR`;
    window.location.href = upiUrl;
  };

  const handleIHavePaid = async () => {
    if (submitting || submitted) return;
    setSubmitting(true);
    try {
      await requestVerification({ sessionId });
      setSubmitted(true);
      toast.success("Payment submitted for verification! Staff will confirm shortly.");
    } catch (e) {
      if (e instanceof ConvexError) {
        // "already pending" is idempotent — treat it as success
        if (e.data?.code === "CONFLICT" || e.data?.message?.includes("already")) {
          setSubmitted(true);
          toast.info("Your payment verification request is already being processed.");
        } else {
          toast.error(e.data.message ?? "Failed to submit payment");
        }
      } else {
        toast.error("Failed to submit payment notification");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const bill = billData?.bill;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#16161a] border-[#27272b] text-zinc-100 max-w-sm w-full">
        <DialogHeader className="border-b border-[#27272b] pb-3">
          <DialogTitle className="flex items-center gap-2 text-white">
            <Wallet className="size-4 text-orange-400" />
            Pay via UPI
          </DialogTitle>
          <p className="text-xs text-zinc-400">{restaurantName}</p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Amount due */}
          <div className="bg-[#101014] rounded-xl border border-[#222228] p-4 space-y-2 text-sm">
            {bill && (
              <>
                <div className="flex justify-between text-zinc-300">
                  <span>Food Subtotal</span>
                  <span className="font-mono">{formatINR(bill.subtotal ?? bill.totalAmount)}</span>
                </div>
                {bill.serviceChargeEnabled && (bill.serviceChargeAmount ?? 0) > 0 && (
                  <div className="flex justify-between text-xs text-zinc-400">
                    <span>Service Charge ({bill.serviceChargePercentage}%)</span>
                    <span className="font-mono">+{formatINR(bill.serviceChargeAmount!)}</span>
                  </div>
                )}
                {bill.gstEnabled && (bill.gstAmount ?? 0) > 0 && (
                  <div className="flex justify-between text-xs text-zinc-400">
                    <span>GST ({bill.gstPercentage}%)</span>
                    <span className="font-mono">+{formatINR(bill.gstAmount!)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-[#27272b] pt-2 font-bold text-base">
                  <span className="text-white">Total Payable</span>
                  <span className="text-orange-400 font-mono">{formatINR(bill.totalAmount)}</span>
                </div>
                {bill.paidAmount > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-green-400">Paid</span>
                    <span className="text-green-400 font-mono">{formatINR(bill.paidAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-[#27272b] pt-1.5 font-bold">
                  <span className="text-white">Balance Due</span>
                  <span className="text-red-400 font-mono text-base">{formatINR(remaining)}</span>
                </div>
              </>
            )}
            {!bill && (
              <div className="text-center text-zinc-500 py-2">Loading bill…</div>
            )}
          </div>

          {/* UPI section */}
          {(upiId || upiQrUrl) ? (
            <div className="space-y-3">
              {/* QR Code */}
              {upiQrUrl && (
                <div className="flex flex-col items-center gap-2">
                  <div className="bg-white p-2 rounded-xl border border-[#27272b] inline-block">
                    <img
                      src={upiQrUrl}
                      alt="UPI QR Code"
                      className="size-40 object-contain"
                    />
                  </div>
                  <p className="text-xs text-zinc-400">Scan with any UPI app</p>
                </div>
              )}

              {/* UPI ID */}
              {upiId && (
                <div className="bg-[#101014] rounded-xl border border-[#222228] p-3 space-y-1">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">UPI ID</p>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-sm font-bold text-white break-all">{upiId}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyUpi}
                      className="h-7 px-2 shrink-0 text-zinc-400 hover:text-white"
                      title="Copy UPI ID"
                    >
                      {copied ? <Check className="size-3.5 text-green-400" /> : <Copy className="size-3.5" />}
                    </Button>
                  </div>
                </div>
              )}

              {/* Open UPI App button (mobile only feel) */}
              {upiId && remaining > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenUpiApp}
                  className="w-full gap-2 border-[#27272b] text-zinc-300 hover:text-white hover:border-orange-500/50"
                >
                  <Smartphone className="size-4 text-orange-400" />
                  Open UPI App
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-[#27272b] p-4 text-center space-y-1">
              <QrCode className="size-8 text-zinc-600 mx-auto" />
              <p className="text-sm text-zinc-400">UPI payment not configured</p>
              <p className="text-xs text-zinc-500">Please ask staff to record your payment.</p>
            </div>
          )}

          {/* I Have Paid button */}
          {!submitted ? (
            <Button
              onClick={handleIHavePaid}
              disabled={submitting || remaining <= 0}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold gap-2 shadow-md shadow-orange-500/20"
              size="lg"
            >
              {submitting ? "Submitting…" : "I Have Paid — Notify Staff"}
            </Button>
          ) : (
            <div className="rounded-xl bg-green-900/20 border border-green-500/30 p-4 text-center space-y-1">
              <Check className="size-6 text-green-400 mx-auto" />
              <p className="text-sm font-bold text-green-300">Payment notification sent!</p>
              <p className="text-xs text-green-400">Staff will verify and close your session shortly.</p>
            </div>
          )}

          {remaining <= 0 && (
            <div className="rounded-xl bg-green-900/20 border border-green-500/30 p-3 text-center">
              <p className="text-sm font-bold text-green-300">✅ Bill fully paid!</p>
            </div>
          )}

          <p className="text-[11px] text-zinc-500 text-center">
            After paying, tap the button above so staff can verify and close your session.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
