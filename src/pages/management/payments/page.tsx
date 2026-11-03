import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  formatINR,
  timeAgo,
  formatTableCustomerLabel,
  getSafeErrorMessage,
} from "@/lib/restaurant.ts";
import { toast } from "sonner";
import {
  CreditCard,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Lock,
  Printer,
  QrCode,
  Banknote,
} from "lucide-react";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty.tsx";

type InlineConfirmation = "record" | "pay_full" | null;

interface RecordedSuccessInfo {
  amount: number;
  method: string;
}

interface ClosedSessionInfo {
  tableNumber: number | string;
  amount: number;
  method: string;
}

export default function PaymentsPage() {
  const activeSessions = useQuery(api.sessions.listActiveSessions, {});
  const [selectedSessionId, setSelectedSessionId] = useState<Id<"table_sessions"> | null>(null);
  const [paymentForm, setPaymentForm] = useState<{
    amount: string;
    method: "upi" | "card" | "cash";
  }>({
    amount: "",
    method: "upi", // UPI selected by default per requirement
  });

  const [paying, setPaying] = useState(false);
  const [closing, setClosing] = useState(false);

  // Inline confirmation state: replaces the button in place (NO MODAL/POPUP)
  const [inlineConfirm, setInlineConfirm] = useState<InlineConfirmation>(null);

  // Success message after payment recorded (Workflow 1 Step 3)
  const [lastRecordedSuccess, setLastRecordedSuccess] = useState<RecordedSuccessInfo | null>(null);

  // Session closed state display (Workflow 1 & 2 after closure)
  const [sessionClosedInfo, setSessionClosedInfo] = useState<ClosedSessionInfo | null>(null);

  // Derive active session: user selection if valid, otherwise first active table session
  const selectedSession =
    selectedSessionId && activeSessions?.some((s) => s.session._id === selectedSessionId)
      ? selectedSessionId
      : (activeSessions?.[0]?.session._id ?? null);

  const billData = useQuery(
    api.payments.getPaymentsForManagement,
    selectedSession ? { sessionId: selectedSession } : "skip"
  );
  const recordPayment = useMutation(api.payments.recordPayment);
  const closeSession = useMutation(api.sessions.closeSession);
  const payFullAndCloseSession = useMutation(api.payments.payFullAndCloseSession);

  // Switch session helper
  const handleSelectSession = (sessionId: Id<"table_sessions">) => {
    setSelectedSessionId(sessionId);
    setPaymentForm((f) => ({ ...f, amount: "" }));
    setInlineConfirm(null);
    setLastRecordedSuccess(null);
    setSessionClosedInfo(null);
  };

  // ─── WORKFLOW 1: RECORD PAYMENT ──────────────────────────────────────────

  // Step 2: Trigger inline confirmation for Record Payment
  const handleInitiateRecord = () => {
    if (!selectedSession || !paymentForm.amount) {
      toast.error("Amount is required");
      return;
    }
    const paise = Math.round(Number(paymentForm.amount) * 100);
    if (paise <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }
    if (billData && paise > billData.remaining) {
      toast.error(`Payment ₹${(paise / 100).toFixed(2)} exceeds remaining balance ₹${(billData.remaining / 100).toFixed(2)}`);
      return;
    }
    setInlineConfirm("record");
  };

  // Step 2: Confirm Payment ✓ (Calls existing secure Convex mutation)
  const handleConfirmRecordPayment = async () => {
    if (!selectedSession || !paymentForm.amount) return;
    const paise = Math.round(Number(paymentForm.amount) * 100);
    setPaying(true);
    try {
      await recordPayment({
        sessionId: selectedSession,
        amount: paise,
        method: paymentForm.method,
      });

      // Step 3: Success feedback
      setLastRecordedSuccess({
        amount: paise,
        method: paymentForm.method,
      });
      toast.success("Payment recorded successfully!");
      setPaymentForm((f) => ({ ...f, amount: "" }));
      setInlineConfirm(null);
    } catch (e) {
      // If failed: display actual safe error and restore original action
      toast.error(getSafeErrorMessage(e, "Failed to record payment"));
      setInlineConfirm(null);
    } finally {
      setPaying(false);
    }
  };

  // Step 3: Direct Close Session when balance is ₹0 (NO SECOND CONFIRMATION)
  const handleDirectCloseSession = async () => {
    if (!selectedSession || !billData) return;
    setClosing(true);
    try {
      await closeSession({ sessionId: selectedSession });
      toast.success("Session closed — table is now free!");
      setSessionClosedInfo({
        tableNumber: billData.table?.tableNumber ?? "?",
        amount: 0,
        method: "",
      });
      setLastRecordedSuccess(null);
      setInlineConfirm(null);
    } catch (e) {
      toast.error(getSafeErrorMessage(e, "Failed to close session"));
    } finally {
      setClosing(false);
    }
  };

  // ─── WORKFLOW 2: PAY FULL & CLOSE SESSION ─────────────────────────────────

  // Step 2: Trigger inline confirmation for Pay Full & Close Session
  const handleInitiatePayFullAndClose = () => {
    if (!selectedSession || !billData || billData.remaining <= 0) return;
    setInlineConfirm("pay_full");
  };

  // Step 3: Confirm & Close ✓ (Atomic payment recording and session closure)
  const handleConfirmPayFullAndClose = async () => {
    if (!selectedSession || !billData) return;
    const remainingPaise = billData.remaining;
    if (remainingPaise < 0) {
      toast.error("Invalid negative bill balance");
      return;
    }

    setPaying(true);
    setClosing(true);
    try {
      let finalTableNumber: number | string = billData.table?.tableNumber ?? "?";
      let finalAmount = remainingPaise;
      let finalMethod = paymentForm.method;

      try {
        // Try the atomic backend mutation first
        const result = await payFullAndCloseSession({
          sessionId: selectedSession,
          method: paymentForm.method,
        });
        finalTableNumber = result.tableNumber;
        finalAmount = result.amount;
        finalMethod = result.method;
      } catch (mutationErr: unknown) {
        const errMsg = mutationErr instanceof Error ? mutationErr.message : String(mutationErr);
        // If the dev deployment has not yet synced payFullAndCloseSession, seamlessly fall back to deployed public mutations:
        if (
          errMsg.includes("Could not find public function for 'payments:payFullAndCloseSession'") ||
          errMsg.includes("payFullAndCloseSession")
        ) {
          // 1. Record the exact remaining balance (e.g. ₹594.50, NOT the previously paid amount!)
          if (remainingPaise > 0) {
            await recordPayment({
              sessionId: selectedSession,
              amount: remainingPaise,
              method: paymentForm.method,
            });
          }
          // 2. Close the session (enforces remaining = 0, no unserved orders, no unverified requests)
          await closeSession({ sessionId: selectedSession });
        } else {
          throw mutationErr;
        }
      }

      toast.success("Payment recorded & session closed!");
      setSessionClosedInfo({
        tableNumber: finalTableNumber,
        amount: finalAmount,
        method: finalMethod,
      });
      setInlineConfirm(null);
      setLastRecordedSuccess(null);
      setPaymentForm((f) => ({ ...f, amount: "" }));
    } catch (e) {
      // If failed: do not show false success, display actual safe error and restore action
      toast.error(getSafeErrorMessage(e, "Failed to complete payment and close session"));
      setInlineConfirm(null);
    } finally {
      setPaying(false);
      setClosing(false);
    }
  };

  const selectedLabels = billData
    ? formatTableCustomerLabel(
        billData.table?.tableNumber,
        billData.session?.customerNames,
        billData.session?.peopleCount
      )
    : { headline: "", subtext: "" };

  return (
    <div className="p-4 md:p-6 space-y-6">
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

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 no-print">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
          <p className="text-sm text-muted-foreground">
            Manage table bills, record payments via UPI, Card, or Cash, and close completed sessions.
          </p>
        </div>
      </div>

      {/* Active Sessions Selector */}
      <div className="space-y-3 no-print">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Active Sessions {activeSessions ? `(${activeSessions.length})` : ""}
          </h2>
        </div>

        {activeSessions === undefined ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : activeSessions.length === 0 ? (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon"><CreditCard /></EmptyMedia>
              <EmptyTitle>No active sessions</EmptyTitle>
              <EmptyDescription>All tables are currently empty</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {activeSessions.map(({ session, table, bill }) => {
              const remaining = bill ? bill.totalAmount - bill.paidAmount : 0;
              const isSelected = selectedSession === session._id;
              const { headline, subtext } = formatTableCustomerLabel(
                table?.tableNumber,
                session.customerNames,
                session.peopleCount
              );

              return (
                <button
                  key={session._id}
                  type="button"
                  onClick={() => handleSelectSession(session._id)}
                  className={`w-full text-left bg-card border rounded-xl p-3.5 transition-all relative ${
                    isSelected
                      ? "border-primary ring-2 ring-primary/20 bg-primary/5 shadow-sm"
                      : "hover:border-primary/40 hover:bg-muted/30"
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-foreground truncate">{headline}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        Session: {session.sessionNumber} · {subtext}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-sm">{formatINR(bill?.totalAmount ?? 0)}</p>
                      <span
                        className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          remaining === 0
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                            : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                        }`}
                      >
                        {remaining === 0 ? "PAID" : `₹${(remaining / 100).toFixed(0)} left`}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected Session Detail: Wider Two-Column Design */}
      {selectedSession && (
        <div className="pt-2">
          {billData === undefined ? (
            <div className="grid lg:grid-cols-12 gap-6">
              <Skeleton className="lg:col-span-7 h-96 rounded-xl" />
              <Skeleton className="lg:col-span-5 h-96 rounded-xl" />
            </div>
          ) : billData === null ? (
            <div className="bg-card border rounded-xl p-8 text-center space-y-2">
              <Lock className="size-8 text-muted-foreground mx-auto" />
              <p className="font-medium">Payment History Hidden</p>
              <p className="text-sm text-muted-foreground">
                This session's payment history is no longer visible (1-hour limit expired).
              </p>
            </div>
          ) : (
            <div className="grid lg:grid-cols-12 gap-6 items-start">
              {/* Left Section — Bill Summary */}
              <div className="lg:col-span-7 bg-card border rounded-xl p-5 md:p-6 space-y-5">
                {/* Header with Table Number and Customer Name */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b pb-4">
                  <div>
                    <h2 className="font-bold text-xl text-foreground">
                      {selectedLabels.headline}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Session: {billData.session?.sessionNumber} · {selectedLabels.subtext}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.print()}
                      className="h-8 text-xs gap-1.5"
                      title="Print bill receipt"
                    >
                      <Printer className="size-3.5" />
                      Print Bill
                    </Button>
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-semibold uppercase ${
                        billData.bill.status === "paid"
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                          : billData.bill.status === "partial"
                          ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                          : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                      }`}
                    >
                      {billData.bill.status}
                    </span>
                  </div>
                </div>

                {/* Line Items */}
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Food Subtotal</span>
                    <span className="font-medium text-foreground">
                      {formatINR(billData.bill.subtotal ?? billData.bill.totalAmount)}
                    </span>
                  </div>

                  {billData.bill.serviceChargeEnabled && (billData.bill.serviceChargeAmount ?? 0) > 0 && (
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground">
                        Service Charge ({billData.bill.serviceChargePercentage}%)
                        <span className="text-[10px] block opacity-75">
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

                  <div className="flex justify-between items-center border-t pt-3 font-semibold text-base">
                    <span className="text-foreground">Total Payable</span>
                    <span className="text-primary font-bold text-lg">
                      {formatINR(billData.bill.totalAmount)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Paid Amount</span>
                    <span className="font-semibold text-green-600 dark:text-green-400">
                      {formatINR(billData.bill.paidAmount)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center border-t pt-3">
                    <span className="font-semibold text-foreground">Remaining Balance</span>
                    <span
                      className={`font-bold text-lg ${
                        billData.remaining === 0
                          ? "text-green-600 dark:text-green-400"
                          : "text-destructive"
                      }`}
                    >
                      {formatINR(billData.remaining)}
                    </span>
                  </div>

                  {billData.paymentModes.length > 0 && (
                    <div className="flex justify-between items-center text-xs pt-2 border-t">
                      <span className="text-muted-foreground">Payment Mode(s)</span>
                      <span className="font-semibold uppercase text-primary">
                        {billData.paymentModes.join(" + ")}
                      </span>
                    </div>
                  )}
                </div>

                {/* Payment History */}
                {billData.payments.length > 0 && (
                  <div className="border-t pt-4 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Payment History
                    </p>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {billData.payments.map((p) => (
                        <div
                          key={p._id}
                          className="flex justify-between items-center text-xs p-2.5 rounded-lg bg-muted/40 border"
                        >
                          <span className="text-muted-foreground capitalize flex items-center gap-1.5">
                            {p.method === "upi" ? (
                              <QrCode className="size-3.5 text-primary" />
                            ) : p.method === "card" ? (
                              <CreditCard className="size-3.5 text-primary" />
                            ) : (
                              <Banknote className="size-3.5 text-primary" />
                            )}
                            <span className="font-medium text-foreground">{p.method}</span>
                            <span>·</span>
                            <span>{timeAgo(p.createdAt)}</span>
                            {p.reference && (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                ({p.reference})
                              </span>
                            )}
                          </span>
                          <span className="font-bold text-foreground">
                            {formatINR(p.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Section — Record Payment & Closure (INLINE WORKFLOWS) */}
              <div className="lg:col-span-5 bg-card border rounded-xl p-5 md:p-6 space-y-5 no-print">
                {sessionClosedInfo ? (
                  /* Post-Closure Success State (WORKFLOW 1 & 2 Completed) */
                  <div className="bg-green-50 dark:bg-green-950/30 border border-green-300 dark:border-green-800 rounded-xl p-6 text-center space-y-4">
                    <div className="size-14 rounded-full bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-300 flex items-center justify-center mx-auto">
                      <CheckCircle className="size-7" />
                    </div>
                    <div className="space-y-1">
                      {sessionClosedInfo.amount > 0 ? (
                        <>
                          <h3 className="font-bold text-lg text-green-800 dark:text-green-200">
                            Payment recorded &amp; session closed!
                          </h3>
                          <p className="text-xs font-semibold uppercase text-green-700 dark:text-green-300">
                            {formatINR(sessionClosedInfo.amount)} via {sessionClosedInfo.method.toUpperCase()}
                          </p>
                        </>
                      ) : (
                        <h3 className="font-bold text-lg text-green-800 dark:text-green-200">
                          Session Closed
                        </h3>
                      )}
                      <p className="text-sm font-medium text-green-700/90 dark:text-green-300/90 pt-1">
                        Table {sessionClosedInfo.tableNumber} is now available for new guests.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSessionClosedInfo(null);
                        setSelectedSessionId(null);
                      }}
                      className="border-green-600/40 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30 text-xs"
                    >
                      Select Another Table
                    </Button>
                  </div>
                ) : billData.remaining > 0 ? (
                  /* WORKFLOW 1 & 2 (Active Balance Remaining) */
                  <>
                    <div>
                      <h3 className="font-bold text-lg text-foreground">Record Payment</h3>
                      <p className="text-xs text-muted-foreground">
                        Select payment method and enter amount to record.
                      </p>
                    </div>

                    {/* Step 3 Banner: If a previous payment was recorded in this session */}
                    {lastRecordedSuccess && (
                      <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl p-3 flex items-center gap-3 text-green-800 dark:text-green-200">
                        <CheckCircle className="size-5 text-green-600 dark:text-green-400 shrink-0" />
                        <div className="text-xs">
                          <p className="font-bold">Payment recorded successfully!</p>
                          <p className="text-muted-foreground dark:text-green-300/80">
                            {formatINR(lastRecordedSuccess.amount)} recorded via {lastRecordedSuccess.method.toUpperCase()}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Wide Amount Input */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Payment Amount
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold text-base">
                          ₹
                        </span>
                        <Input
                          placeholder={`0.00 (max ${(billData.remaining / 100).toFixed(2)})`}
                          type="number"
                          value={paymentForm.amount}
                          disabled={paying || closing || inlineConfirm !== null}
                          onChange={(e) => {
                            setPaymentForm((f) => ({ ...f, amount: e.target.value }));
                            if (inlineConfirm === "record") setInlineConfirm(null);
                          }}
                          className="pl-8 text-base h-11 w-full font-medium"
                        />
                      </div>
                      <div className="flex justify-between items-center text-xs text-muted-foreground pt-1">
                        <span>Balance: {formatINR(billData.remaining)}</span>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={paying || closing || inlineConfirm !== null}
                          onClick={() => {
                            setPaymentForm((f) => ({
                              ...f,
                              amount: String(billData.remaining / 100),
                            }));
                            if (inlineConfirm === "record") setInlineConfirm(null);
                          }}
                          className="h-7 text-xs font-medium"
                        >
                          Full Amount ({formatINR(billData.remaining)})
                        </Button>
                      </div>
                    </div>

                    {/* Payment Method Selector (Default: UPI) */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Payment Method
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: "upi", label: "UPI", icon: QrCode },
                          { id: "card", label: "Card", icon: CreditCard },
                          { id: "cash", label: "Cash", icon: Banknote },
                        ].map(({ id, label, icon: Icon }) => {
                          const isSelected = paymentForm.method === id;
                          return (
                            <button
                              key={id}
                              type="button"
                              disabled={paying || closing || inlineConfirm !== null}
                              onClick={() => {
                                setPaymentForm((f) => ({
                                  ...f,
                                  method: id as "upi" | "card" | "cash",
                                }));
                                if (inlineConfirm) setInlineConfirm(null);
                              }}
                              className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-sm transition-all ${
                                isSelected
                                  ? "border-primary bg-primary/10 text-primary font-bold ring-2 ring-primary/30"
                                  : "border-border bg-background hover:bg-muted/40 text-muted-foreground"
                              } ${paying || closing || inlineConfirm !== null ? "opacity-75 cursor-not-allowed" : ""}`}
                            >
                              <Icon className="size-5" />
                              <span>{label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* WORKFLOW 1: Record Payment Button OR Inline Confirmation */}
                    {inlineConfirm === "record" ? (
                      /* Step 2: Inline Confirmation for Record Payment */
                      <div className="border border-orange-500/50 bg-orange-950/20 dark:bg-orange-950/30 rounded-xl p-4 space-y-3">
                        <div className="flex items-center gap-2.5 text-foreground">
                          <AlertCircle className="size-5 text-orange-500 shrink-0" />
                          <p className="font-semibold text-sm">
                            Confirm recording {formatINR(Math.round(Number(paymentForm.amount) * 100))} via{" "}
                            <span className="text-primary font-bold uppercase">{paymentForm.method}</span>?
                          </p>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={paying}
                            onClick={() => setInlineConfirm(null)}
                            className="flex-1 text-xs"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={paying}
                            onClick={handleConfirmRecordPayment}
                            className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs"
                          >
                            {paying ? "Recording..." : "Confirm Payment ✓"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      /* Step 1: Default Orange Record Payment Button */
                      <Button
                        onClick={handleInitiateRecord}
                        disabled={paying || closing || !paymentForm.amount}
                        size="lg"
                        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-11 text-sm"
                      >
                        {paymentForm.amount
                          ? `Record Payment (${formatINR(Math.round(Number(paymentForm.amount) * 100))})`
                          : "Record Payment"}
                      </Button>
                    )}

                    <div className="relative my-2">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-border" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">or</span>
                      </div>
                    </div>

                    {/* WORKFLOW 2: Pay Full & Close Session Button OR Inline Confirmation */}
                    {inlineConfirm === "pay_full" ? (
                      /* Step 2: Inline Confirmation for Pay Full & Close Session */
                      <div className="border border-orange-500/50 bg-orange-950/20 dark:bg-orange-950/30 rounded-xl p-4 space-y-3">
                        <div className="flex items-start gap-2.5 text-foreground">
                          <AlertTriangle className="size-5 text-orange-500 shrink-0 mt-0.5" />
                          <p className="font-semibold text-sm leading-snug">
                            Confirm payment of {formatINR(billData.remaining)} via{" "}
                            <span className="text-primary font-bold uppercase">{paymentForm.method}</span> and close this session?
                          </p>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={paying || closing}
                            onClick={() => setInlineConfirm(null)}
                            className="flex-1 text-xs"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={paying || closing}
                            onClick={handleConfirmPayFullAndClose}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold text-xs"
                          >
                            {paying || closing ? "Processing..." : "Confirm & Close ✓"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      /* Step 1: Default Green Pay Full & Close Session Button */
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        disabled={paying || closing}
                        onClick={handleInitiatePayFullAndClose}
                        className="w-full gap-2 border-green-600/60 text-green-600 dark:text-green-400 hover:bg-green-600/10 font-semibold h-11"
                      >
                        <CheckCircle className="size-4" />
                        Pay Full {formatINR(billData.remaining)} &amp; Close Session
                      </Button>
                    )}
                  </>
                ) : (
                  /* WORKFLOW 1 Step 3: Bill Fully Paid (Remaining = ₹0) */
                  <div className="bg-green-50/50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl p-6 text-center space-y-4">
                    {lastRecordedSuccess && (
                      <div className="bg-green-100/70 dark:bg-green-900/40 border border-green-300 dark:border-green-700 rounded-lg p-3 text-xs text-green-800 dark:text-green-200 text-left flex items-center gap-2">
                        <CheckCircle className="size-4 text-green-600 dark:text-green-400 shrink-0" />
                        <span>
                          <strong>Payment recorded successfully!</strong> {formatINR(lastRecordedSuccess.amount)} via{" "}
                          {lastRecordedSuccess.method.toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="size-12 rounded-full bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-300 flex items-center justify-center mx-auto">
                      <CheckCircle className="size-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-green-800 dark:text-green-200">
                        Bill Fully Paid
                      </h3>
                      <p className="text-sm text-green-700/80 dark:text-green-300/80 mt-1">
                        All charges for this table have been settled in full.
                      </p>
                    </div>
                    {/* Direct Close Session button (NO SECOND CONFIRMATION per Step 3) */}
                    <Button
                      onClick={handleDirectCloseSession}
                      disabled={closing}
                      className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold h-11"
                      size="lg"
                    >
                      {closing ? "Closing..." : "Close Session & Free Table"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
