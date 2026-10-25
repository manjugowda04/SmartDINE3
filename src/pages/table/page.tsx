"use client";
import { useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { UtensilsCrossed, User, ArrowRight, ShieldAlert } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import SessionDining from "./_components/SessionDining.tsx";
import { motion } from "motion/react";

export default function TablePage() {
  const { token } = useParams<{ token: string }>();

  // Session ID persisted in sessionStorage per table token
  const [sessionId, setSessionId] = useState<string | null>(
    () => sessionStorage.getItem(`smartdine_session_${token}`)
  );

  // Customer name persisted in sessionStorage for this table
  const [customerName, setCustomerName] = useState<string>(
    () => sessionStorage.getItem(`smartdine_customer_name_${token}`) ?? ""
  );
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState("");

  const [peopleCount, setPeopleCount] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const table = useQuery(api.tables.getTableByToken, token ? { token } : "skip");
  const createOrJoin = useMutation(api.sessions.createOrJoinSession);

  // Check for active session on load
  const activeSession = useQuery(
    api.sessions.getActiveSessionForTable,
    table?._id ? { tableId: table._id } : "skip"
  );

  if (!token) return <Navigate to="/" replace />;

  // Table loading
  if (table === undefined || (table && activeSession === undefined)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0c0c0e]">
        <Spinner className="size-8 text-orange-500" />
      </div>
    );
  }

  if (table === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0c0c0e] px-4 text-center gap-4 text-zinc-100">
        <UtensilsCrossed className="size-12 text-zinc-600" />
        <h1 className="text-2xl font-bold">Invalid QR Code</h1>
        <p className="text-zinc-400">This QR code is not recognized. Please ask your waiter for assistance.</p>
      </div>
    );
  }

  if (!table.isActive) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0c0c0e] px-4 text-center gap-4 text-zinc-100">
        <UtensilsCrossed className="size-12 text-zinc-600" />
        <h1 className="text-2xl font-bold">Table Unavailable</h1>
        <p className="text-zinc-400">This table is currently not in service. Please ask your waiter for assistance.</p>
      </div>
    );
  }

  // ── 1. If stored session matches active session, user is the current dining customer ──
  if (sessionId && activeSession && sessionId === activeSession._id) {
    if (customerName) {
      return (
        <SessionDining
          sessionId={sessionId as Id<"table_sessions">}
          tableNumber={table.tableNumber}
          restaurantName={table.restaurant?.name}
          restaurantId={table.restaurantId}
          customerName={customerName}
        />
      );
    }
  }

  // ── 2. Clear old closed session from sessionStorage if activeSession is null or different ──
  if (sessionId && (!activeSession || sessionId !== activeSession._id)) {
    sessionStorage.removeItem(`smartdine_session_${token}`);
    sessionStorage.removeItem(`smartdine_customer_name_${token}`);
    if (sessionId) setSessionId(null);
    if (customerName) setCustomerName("");
  }

  // ── 3. Table Occupied Screen: Another customer has an active session at this table ──
  // Prevents new customers or incognito windows from joining an occupied table.
  if (activeSession || table.status === "occupied" || table.status === "bill_pending") {
    return (
      <TableOccupiedScreen
        restaurantName={table.restaurant?.name ?? "Easy Dining"}
        restaurantLogoUrl={table.restaurant?.logoUrl}
        tableNumber={table.tableNumber}
        sessionNumber={activeSession?.sessionNumber}
      />
    );
  }

  // ── 4. Table is Available: Show the Welcome & Customer Name Entry Screen ──
  const handleStartDining = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setNameError("Please enter your name to start ordering.");
      return;
    }
    if (trimmed.length > 80) {
      setNameError("Name is too long (max 80 characters).");
      return;
    }
    setNameError("");
    setSubmitting(true);
    try {
      const result = await createOrJoin({
        tableToken: token,
        peopleCount,
        customerName: trimmed,
      });

      sessionStorage.setItem(`smartdine_session_${token}`, result.sessionId);
      sessionStorage.setItem(`smartdine_customer_name_${token}`, trimmed);
      setSessionId(result.sessionId);
      setCustomerName(trimmed);
      toast.success(`Welcome to ${table.restaurant?.name ?? "Easy Dining"}, ${trimmed}!`);
    } catch (e) {
      if (e instanceof ConvexError) {
        toast.error(e.data.message);
      } else {
        toast.error("Failed to start session. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0c0c0e] px-4 py-8 text-zinc-100">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#16161a] border border-[#27272b] rounded-3xl p-6 sm:p-8 max-w-sm sm:max-w-md w-full text-center space-y-6 shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-500/20 via-orange-500 to-orange-500/20" />

        {/* Logo */}
        {table.restaurant?.logoUrl ? (
          <img
            src={table.restaurant.logoUrl}
            alt={table.restaurant.name}
            className="size-16 rounded-2xl object-cover mx-auto border border-[#27272b] shadow-sm"
          />
        ) : (
          <div className="bg-orange-500 rounded-2xl p-4 size-16 mx-auto flex items-center justify-center shadow-lg shadow-orange-500/20">
            <UtensilsCrossed className="size-8 text-white" />
          </div>
        )}

        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-orange-500/10 border border-orange-500/25 text-orange-400">
            Table {table.tableNumber}
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-2 tracking-tight">
            Welcome to {table.restaurant?.name ?? "Easy Dining"}
          </h1>
          <p className="text-zinc-400 text-xs sm:text-sm mt-1.5">
            Please enter your name to start ordering
          </p>
        </div>

        {/* Name Input */}
        <div className="space-y-1.5 text-left">
          <label htmlFor="customer-name" className="text-xs font-semibold uppercase text-zinc-400 flex items-center gap-1.5">
            <User className="size-3.5" />
            Your Name *
          </label>
          <Input
            id="customer-name"
            type="text"
            autoFocus
            placeholder="e.g. Manju, Jay..."
            value={nameInput}
            onChange={(e) => { setNameInput(e.target.value); setNameError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleStartDining(); }}
            className="bg-[#0c0c0e] border-[#27272b] focus:border-orange-500 text-white placeholder-zinc-500 text-base h-12 rounded-xl"
          />
          {nameError && (
            <p className="text-xs text-red-400 font-medium">{nameError}</p>
          )}
        </div>

        {/* Party Size */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase text-zinc-400 block text-left">
            Party Size (Guests)
          </label>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setPeopleCount((p) => Math.max(1, p - 1))}
              disabled={peopleCount <= 1}
              className="size-10 rounded-full bg-[#202026] border border-[#2e2e36] text-white text-lg font-bold flex items-center justify-center disabled:opacity-40 hover:bg-[#29292f] active:scale-95 transition-all cursor-pointer"
            >
              −
            </button>
            <span className="text-2xl font-extrabold text-white w-10 text-center font-mono">{peopleCount}</span>
            <button
              type="button"
              onClick={() => setPeopleCount((p) => Math.min(30, p + 1))}
              disabled={peopleCount >= 30}
              className="size-10 rounded-full bg-[#202026] border border-[#2e2e36] text-white text-lg font-bold flex items-center justify-center disabled:opacity-40 hover:bg-[#29292f] active:scale-95 transition-all cursor-pointer"
            >
              +
            </button>
          </div>
        </div>

        <Button
          onClick={handleStartDining}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold h-12 rounded-xl shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 cursor-pointer text-sm sm:text-base active:scale-98 transition-all"
          size="lg"
          disabled={submitting}
        >
          {submitting ? "Starting Session..." : (
            <>
              <span>Proceed to Menu</span>
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </motion.div>
    </div>
  );
}

// ── Dedicated Table Occupied Screen ──
function TableOccupiedScreen({
  restaurantName,
  restaurantLogoUrl,
  tableNumber,
  sessionNumber,
}: {
  restaurantName: string;
  restaurantLogoUrl?: string;
  tableNumber: number;
  sessionNumber?: string;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0c0c0e] px-4 py-8 text-zinc-100">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-[#16161a] border border-[#27272b] rounded-3xl p-6 sm:p-8 max-w-sm sm:max-w-md w-full text-center space-y-6 shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-orange-500 to-red-500" />

        {restaurantLogoUrl ? (
          <img
            src={restaurantLogoUrl}
            alt={restaurantName}
            className="size-16 rounded-2xl object-cover mx-auto border border-[#27272b] shadow-sm"
          />
        ) : (
          <div className="bg-[#202026] border border-[#2c2c36] rounded-2xl p-4 size-16 mx-auto flex items-center justify-center shadow-md">
            <ShieldAlert className="size-8 text-orange-400" />
          </div>
        )}

        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-orange-500/10 border border-orange-500/30 text-orange-400">
            Table {tableNumber} {sessionNumber ? `· ${sessionNumber}` : ""}
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-white mt-3">
            Table Occupied
          </h1>
          <p className="text-zinc-300 text-sm mt-2 leading-relaxed">
            This table is currently in use. Please wait until the current session is closed.
          </p>
        </div>

        <div className="bg-[#101014] border border-[#23232a] rounded-2xl p-4 text-xs text-zinc-400 text-left space-y-2">
          <p className="flex items-start gap-2">
            <span className="text-orange-400 font-bold">•</span>
            <span>Another customer has an active dining session at this table.</span>
          </p>
          <p className="flex items-start gap-2">
            <span className="text-orange-400 font-bold">•</span>
            <span>Once the current session is completed and closed by the staff, this screen will automatically refresh so you can start ordering.</span>
          </p>
        </div>

        <p className="text-[11px] text-zinc-500">
          If you need assistance, please speak to your restaurant waiter or manager.
        </p>
      </motion.div>
    </div>
  );
}
