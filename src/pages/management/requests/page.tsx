import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { requestTypeLabel, timeAgo } from "@/lib/restaurant.ts";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { Bell, CheckCircle, Clock, ArrowRight, Star, MessageSquare } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";

export default function RequestsPage() {
  const [filter, setFilter] = useState<"pending" | "in_progress" | "completed" | "all">("pending");
  const [inboxTab, setInboxTab] = useState<"requests" | "feedback">("requests");
  const allRequests = useQuery(api.requests.listWaiterRequests, {});
  const feedback = useQuery(api.requests.listCustomerFeedback, {});
  const updateStatus = useMutation(api.requests.updateRequestStatus);

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
      {/* Filters */}
      <div className="flex gap-2">
        {(["pending", "in_progress", "completed", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {f === "in_progress" ? "In Progress" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
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
    </div>
  );
}
