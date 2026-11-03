import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { requestTypeLabel, timeAgo } from "@/lib/restaurant.ts";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { Bell, CheckCircle, Clock, ArrowRight, Star, MessageSquare, CheckCheck, AlertTriangle } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog.tsx";

export default function RequestsPage() {
  const [filter, setFilter] = useState<"pending" | "in_progress" | "completed" | "all">("pending");
  const [inboxTab, setInboxTab] = useState<"requests" | "feedback">("requests");
  const [showAllDoneConfirm, setShowAllDoneConfirm] = useState(false);
  const [completingAll, setCompletingAll] = useState(false);

  const allRequests = useQuery(api.requests.listWaiterRequests, {});
  const feedback = useQuery(api.requests.listCustomerFeedback, {});
  const updateStatus = useMutation(api.requests.updateRequestStatus);
  const completeAllPending = useMutation(api.requests.completeAllPendingRequests);

  const filtered = allRequests
    ? filter === "all"
      ? allRequests
      : allRequests.filter((r) => r.status === filter)
    : [];

  const handleUpdate = async (id: Id<"waiter_requests">, status: "in_progress" | "completed") => {
    try {
      await updateStatus({ requestId: id, status });
      toast.success(`Request marked as ${status.replace("_", " ")}`);
    } catch (e) {
      toast.error("Failed to update request");
    }
  };

  const handleCompleteAll = async () => {
    if (completingAll) return;
    setCompletingAll(true);
    try {
      const res = await completeAllPending({});
      toast.success(
        res.count > 0
          ? `All ${res.count} pending requests marked as completed!`
          : "No pending requests to complete."
      );
      setShowAllDoneConfirm(false);
    } catch (e) {
      if (e instanceof ConvexError) toast.error(e.data.message);
      else toast.error("Failed to complete pending requests");
    } finally {
      setCompletingAll(false);
    }
  };

  const statusColor = (status: string) => {
    if (status === "pending") return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
    if (status === "in_progress") return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
  };

  const pendingCount = allRequests?.filter((r) => r.status === "pending").length ?? 0;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Customer Requests</h1>
        {pendingCount > 0 && (
          <span className="bg-destructive text-destructive-foreground rounded-full text-xs px-2.5 py-1 font-bold animate-pulse">
            {pendingCount} pending
          </span>
        )}
      </div>

      <div className="flex gap-2 border-b">
        <button
          onClick={() => setInboxTab("requests")}
          className={`px-3 py-2 text-sm font-medium ${
            inboxTab === "requests"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground"
          }`}
        >
          Requests
        </button>
        <button
          onClick={() => setInboxTab("feedback")}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium ${
            inboxTab === "feedback"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground"
          }`}
        >
          <MessageSquare className="size-4" />
          Feedback
          {feedback && feedback.length > 0 && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
              {feedback.length}
            </span>
          )}
        </button>
      </div>

      {inboxTab === "feedback" ? (
        feedback === undefined ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
          </div>
        ) : feedback.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><MessageSquare /></EmptyMedia>
              <EmptyTitle>No feedback yet</EmptyTitle>
              <EmptyDescription>Customer feedback will appear here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-2">
            {feedback.map((entry) => (
              <div key={entry._id} className="rounded-xl border bg-card px-4 py-3">
                <div className="flex items-center gap-1 text-yellow-500" aria-label={`${entry.rating} out of 5 stars`}>
                  {Array.from({ length: 5 }, (_, index) => (
                    <Star
                      key={index}
                      className="size-4"
                      fill={index < entry.rating ? "currentColor" : "none"}
                    />
                  ))}
                  <span className="ml-2 text-xs text-muted-foreground">
                    Table {entry.tableNumber ?? "?"} · {timeAgo(entry.createdAt)}
                  </span>
                </div>
                {entry.comment && (
                  <p className="mt-2 whitespace-pre-wrap text-sm">{entry.comment}</p>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        <>
      {/* Filters and All Done button */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap">
          {(["pending", "in_progress", "completed", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {f === "in_progress" ? "In Progress" : f.charAt(0).toUpperCase() + f.slice(1)}
              {f === "pending" && pendingCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/20">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* All Done Button */}
        <Button
          onClick={() => setShowAllDoneConfirm(true)}
          disabled={pendingCount === 0 || completingAll}
          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold text-xs h-9 px-3.5 rounded-xl shadow-md shadow-orange-500/20 flex items-center gap-1.5 cursor-pointer"
        >
          <CheckCheck className="size-4" />
          <span>All Done</span>
          {pendingCount > 0 && (
            <span className="bg-white/20 text-white text-[10px] font-mono px-1.5 py-0.5 rounded-full">
              {pendingCount}
            </span>
          )}
        </Button>
      </div>

      {allRequests === undefined ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Bell /></EmptyMedia>
            <EmptyTitle>No requests</EmptyTitle>
            <EmptyDescription>No {filter !== "all" ? filter.replace("_", " ") : ""} customer requests</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-2">
          {filtered.map((req) => (
            <div key={req._id} className="bg-card border rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{requestTypeLabel(req.requestType)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(req.status)}`}>
                    {req.status.replace("_", " ").toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Table {req.table?.tableNumber ?? "?"} · {timeAgo(req.createdAt)}
                </p>
              </div>
              <div className="flex gap-2">
                {req.status === "pending" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="text-xs gap-1"
                    onClick={() => handleUpdate(req._id, "in_progress")}
                  >
                    <ArrowRight className="size-3" /> Start
                  </Button>
                )}
                {req.status !== "completed" && (
                  <Button
                    size="sm"
                    className="text-xs gap-1"
                    onClick={() => handleUpdate(req._id, "completed")}
                  >
                    <CheckCircle className="size-3" /> Done
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      )}

      {/* Confirmation Dialog for All Done */}
      <Dialog open={showAllDoneConfirm} onOpenChange={setShowAllDoneConfirm}>
        <DialogContent className="bg-[#16161a] border-[#27272b] text-zinc-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <CheckCheck className="size-5 text-orange-400" />
              Complete All Pending Requests?
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-xs mt-1">
              Are you sure you want to mark all pending requests as completed?
            </DialogDescription>
          </DialogHeader>

          <p className="text-xs text-zinc-300">
            This will mark {pendingCount} pending {pendingCount === 1 ? "request" : "requests"} as completed for your restaurant. Request history and records will be fully preserved.
          </p>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="secondary"
              onClick={() => setShowAllDoneConfirm(false)}
              disabled={completingAll}
              className="bg-[#24242a] hover:bg-[#2e2e36] text-white border-none"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCompleteAll}
              disabled={completingAll}
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold"
            >
              {completingAll ? "Completing..." : "Confirm All Done"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
