/** Format paise to INR string: 32000 → "₹320.00" */
export function formatINR(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Check if order cancellation window is still open */
export function isCancellable(cancellationDeadline: string, status: string): boolean {
  if (["preparing", "ready", "served", "cancelled", "rejected"].includes(status)) return false;
  return new Date() < new Date(cancellationDeadline);
}

/** Get seconds remaining until cancellation deadline */
export function secondsUntilDeadline(deadline: string): number {
  return Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000));
}

/** Format relative time e.g. "2 min ago" */
export function timeAgo(isoString: string): string {
  const secs = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

/** Format ISO string to display time e.g. "3:45 PM" */
export function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Get order status color classes */
export function orderStatusColor(status: string): string {
  const map: Record<string, string> = {
    placed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    accepted: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    preparing: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    ready: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    served: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  };
  return map[status] ?? "bg-gray-100 text-gray-700";
}

/**
 * Formats table number and customer names for management views.
 * Examples:
 * - "Table 1 — Manjunath Gowda" (1 guest with name)
 * - "Table 1 — Manjunath Gowda (+2 guests)" (multi-guest session)
 * - "Table 1 — Guest" (no name recorded)
 */
export function formatTableCustomerLabel(
  tableNumber: number | string | undefined | null,
  customerNames?: string[] | null,
  peopleCount?: number
): {
  headline: string;
  subtext: string;
} {
  const tableDisplay = tableNumber !== undefined && tableNumber !== null ? `Table ${tableNumber}` : "Table ?";
  const names = (customerNames ?? []).filter((n) => typeof n === "string" && n.trim().length > 0);
  const primaryName = names[0]?.trim() || "Guest";

  let headline = `${tableDisplay} — ${primaryName}`;
  if (names.length > 1) {
    headline += ` (+${names.length - 1} ${names.length === 2 ? "guest" : "guests"})`;
  } else if ((peopleCount ?? 1) > 1 && primaryName !== "Guest") {
    const additional = (peopleCount ?? 1) - 1;
    headline += ` (+${additional} ${additional === 1 ? "guest" : "guests"})`;
  }

  const guestText = `${peopleCount ?? 1} ${peopleCount === 1 ? "Guest" : "Guests"}`;

  return {
    headline,
    subtext: guestText,
  };
}

/** Get request type label */
export function requestTypeLabel(type: string): string {
  const map: Record<string, string> = {
    waiter: "Call Waiter",
    water: "Water",
    cutlery: "Cutlery",
    assistance: "Assistance",
    bill: "Request Bill",
    payment_verification: "Payment Verification",
  };
  return map[type] ?? type;
}

/**
 * Extracts a safe, informative user-facing message from any error
 * (ConvexError, fetch error, standard Error, or string).
 */
export function getSafeErrorMessage(err: unknown, fallback: string): string {
  if (!err) return fallback;

  const anyErr = err as { data?: unknown; message?: string };
  if (anyErr?.data) {
    if (typeof anyErr.data === "string" && anyErr.data.trim()) return anyErr.data;
    if (
      typeof anyErr.data === "object" &&
      anyErr.data !== null &&
      "message" in anyErr.data &&
      typeof (anyErr.data as { message?: unknown }).message === "string"
    ) {
      return (anyErr.data as { message: string }).message;
    }
  }

  if (typeof anyErr?.message === "string" && anyErr.message.trim()) {
    try {
      const match = anyErr.message.match(/ConvexError\s*:\s*(\{.*\})/);
      if (match) {
        const parsed = JSON.parse(match[1]);
        if (typeof parsed?.message === "string") return parsed.message;
      }
    } catch {
      // ignore JSON parse failure
    }
    return anyErr.message;
  }

  return fallback;
}
