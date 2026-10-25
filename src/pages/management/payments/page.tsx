import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { formatINR, timeAgo } from "@/lib/restaurant.ts";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { CreditCard, CheckCircle, AlertTriangle, Lock, Printer } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";

export default function PaymentsPage() {
  const activeSessions = useQuery(api.sessions.listActiveSessions, {});
  const [selectedSession, setSelectedSession] = useState<Id<"table_sessions"> | null>(null);
  const [paymentForm, setPaymentForm] = useState({ amount: "", method: "cash" as "upi" | "card" | "cash" });
  const [paying, setPaying] = useState(false);
  const [closing, setClosing] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const billData = useQuery(
    api.payments.getPaymentsForManagement,
    selectedSession ? { sessionId: selectedSession } : "skip"
  );
  const recordPayment = useMutation(api.payments.recordPayment);
  const closeSession = useMutation(api.sessions.closeSession);

  const handleRecordPayment = async () => {
    if (!selectedSession || !paymentForm.amount) {
      toast.error("Amount is required");
      return;
    }
    const paise = Math.round(Number(paymentForm.amount) * 100);
    if (paise <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }
    setPaying(true);
    try {
      await recordPayment({ sessionId: selectedSession, amount: paise, method: paymentForm.method });
      toast.success(`Payment of ${formatINR(paise)} recorded!`);
      setPaymentForm((f) => ({ ...f, amount: "" }));
    } catch (e) {
      if (e instanceof ConvexError) toast.error(e.data.message);
      else toast.error("Failed to record payment");
    } finally {
      setPaying(false);
    }
  };

  const handleCloseSession = async () => {
    if (!selectedSession) return;
    setClosing(true);
    try {
      await closeSession({ sessionId: selectedSession });
      toast.success("Session closed — table is now free!");
      setSelectedSession(null);
      setShowCloseConfirm(false);
    } catch (e) {
      if (e instanceof ConvexError) toast.error(e.data.message);
      else toast.error("Failed to close session");
    } finally {
      setClosing(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Print receipt styles */}
      <style>{`
        @media print {
          aside, nav, button, .no-print, input, select, header {
            display: none !important;
          }
          body, main {
            background: white !important;
            color: black !important;
            padding: 0 !important;
            margin: 0 !important;
          }
        }
      `}</style>

      <h1 className="text-2xl font-bold no-print">Payments</h1>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Session list */}
        <div className="space-y-3 no-print">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Active Sessions</h2>
          {activeSessions === undefined ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : activeSessions.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><CreditCard /></EmptyMedia>
                <EmptyTitle>No active sessions</EmptyTitle>
                <EmptyDescription>All tables are currently empty</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            activeSessions.map(({ session, table, bill }) => {
              const remaining = bill ? bill.totalAmount - bill.paidAmount : 0;
              return (
                <button
                  key={session._id}
                  onClick={() => setSelectedSession(session._id)}
                  className={`w-full text-left bg-card border rounded-xl p-4 transition-all hover:border-primary/50 ${selectedSession === session._id ? "border-primary ring-1 ring-primary" : ""}`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold">Table {table?.tableNumber ?? "?"}</p>
                      <p className="text-xs text-muted-foreground">{session.sessionNumber} · {session.peopleCount} guests</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatINR(bill?.totalAmount ?? 0)}</p>
                      <p className={`text-xs font-medium ${remaining === 0 ? "text-green-600" : "text-orange-500"}`}>
                        {remaining === 0 ? "PAID" : `₹${(remaining / 100).toFixed(0)} remaining`}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Right: Payment detail */}
        {selectedSession && (
          <div className="space-y-4">
            {billData === undefined ? (
              <Skeleton className="h-64" />
            ) : billData === null ? (
              <div className="bg-card border rounded-xl p-6 text-center space-y-2">
                <Lock className="size-8 text-muted-foreground mx-auto" />
                <p className="font-medium">Payment History Hidden</p>
                <p className="text-sm text-muted-foreground">This session's payment history is no longer visible (1-hour limit expired)</p>
              </div>
            ) : (
              <>
                <div className="bg-card border rounded-xl p-4 space-y-3">
                  <div className="flex justify-between items-center border-b pb-3">
                    <div>
                      <p className="font-bold text-lg">Table {billData.table?.tableNumber}</p>
                      <p className="text-xs text-muted-foreground">{billData.session?.sessionNumber}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.print()}
                        className="h-7 text-xs gap-1"
                        title="Print bill receipt"
                      >
                        <Printer className="size-3" />
                        Print Bill
                      </Button>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        billData.bill.status === "paid"
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                          : billData.bill.status === "partial"
                          ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                          : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                      }`}>
                        {billData.bill.status.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Food Subtotal</span>
                      <span className="font-medium">{formatINR(billData.bill.subtotal ?? billData.bill.totalAmount)}</span>
                    </div>

                    {billData.bill.serviceChargeEnabled && (billData.bill.serviceChargeAmount ?? 0) > 0 && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">
                          Service Charge ({billData.bill.serviceChargePercentage}%)
                          <span className="text-[10px] block opacity-70">
                            {billData.bill.serviceChargeBasis === "subtotal_with_gst"
                              ? "on subtotal + GST"
                              : "on food subtotal"}
                          </span>
                        </span>
                        <span className="font-medium text-primary">
                          +{formatINR(billData.bill.serviceChargeAmount!)}
                        </span>
                      </div>
                    )}

                    {billData.bill.gstEnabled && (billData.bill.gstAmount ?? 0) > 0 && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">
                          GST ({billData.bill.gstPercentage}%)
                        </span>
                        <span className="font-medium text-primary">
                          +{formatINR(billData.bill.gstAmount!)}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between border-t pt-2 font-semibold">
                      <span>Total Payable</span>
                      <span className="text-base text-primary">{formatINR(billData.bill.totalAmount)}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Paid</span>
                      <span className="font-semibold text-green-600">{formatINR(billData.bill.paidAmount)}</span>
                    </div>

                    <div className="flex justify-between border-t pt-2">
                      <span className="font-medium">Remaining</span>
                      <span className={`font-bold text-base ${billData.remaining === 0 ? "text-green-600" : "text-destructive"}`}>
                        {formatINR(billData.remaining)}
                      </span>
                    </div>

                    {billData.paymentModes.length > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Payment Mode</span>
                        <span className="font-medium uppercase">{billData.paymentModes.join(" + ")}</span>
                      </div>
                    )}
                  </div>

                  {/* Payment history */}
                  {billData.payments.length > 0 && (
                    <div className="border-t pt-3 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase">Payments</p>
                      {billData.payments.map((p) => (
                        <div key={p._id} className="flex justify-between text-sm">
                          <span className="text-muted-foreground capitalize">{p.method} · {timeAgo(p.createdAt)}</span>
                          <span className="font-medium">{formatINR(p.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Record payment form */}
                {billData.remaining > 0 && (
                  <div className="bg-card border rounded-xl p-4 space-y-3 no-print">
                    <p className="font-semibold text-sm">Record Payment</p>
                    <div className="flex gap-2">
                      <Input
                        placeholder={`Amount in ₹ (max ${(billData.remaining / 100).toFixed(2)})`}
                        type="number"
                        value={paymentForm.amount}
                        onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                        className="flex-1"
                      />
                      <select
                        className="h-10 px-3 rounded-md border border-input bg-background text-sm"
                        value={paymentForm.method}
                        onChange={(e) => setPaymentForm((f) => ({ ...f, method: e.target.value as "upi" | "card" | "cash" }))}
                      >
                        <option value="cash">Cash</option>
                        <option value="upi">UPI</option>
                        <option value="card">Card</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setPaymentForm((f) => ({ ...f, amount: String(billData.remaining / 100) }))}
                        className="text-xs"
                      >
                        Full Amount
                      </Button>
                      <Button onClick={handleRecordPayment} disabled={paying} size="sm" className="flex-1">
                        {paying ? "Recording..." : "Record Payment"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Close session button */}
                {billData.remaining === 0 && (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="size-5 text-green-600" />
                      <p className="font-semibold text-green-700 dark:text-green-300">Bill Fully Paid</p>
                    </div>
                    <p className="text-sm text-green-600 dark:text-green-400">
                      Ready to close session and free the table.
                    </p>
                    <Button
                      onClick={() => setShowCloseConfirm(true)}
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                      size="lg"
                    >
                      ✅ BILL COMPLETED / CLOSE SESSION
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Close session confirm */}
      <Dialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-yellow-500" />
              Close Session?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently close the dining session and mark the table as available.
            The same QR code can be used for a new session.
          </p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowCloseConfirm(false)}>Cancel</Button>
            <Button onClick={handleCloseSession} disabled={closing} className="bg-green-600 hover:bg-green-700 text-white">
              {closing ? "Closing..." : "Confirm Close Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
