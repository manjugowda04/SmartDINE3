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

/** Get request type label */
export function requestTypeLabel(type: string): string {
  const map: Record<string, string> = {
    waiter: "Call Waiter",
    water: "Water",
    cutlery: "Cutlery",
    assistance: "Assistance",
    bill: "Request Bill",
  };
  return map[type] ?? type;
}
