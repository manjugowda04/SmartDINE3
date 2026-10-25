import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { Bell, Droplets, UtensilsCrossed, HelpCircle, Receipt, CheckCircle, Clock, Star } from "lucide-react";
import { timeAgo } from "@/lib/restaurant.ts";

interface Props {
  sessionId: Id<"table_sessions">;
}

type RequestType = "waiter" | "water" | "cutlery" | "assistance" | "bill";

const REQUEST_TYPES: { type: RequestType; label: string; icon: React.ReactNode; description: string }[] = [
  { type: "waiter", label: "Call Waiter", icon: <Bell className="size-5" />, description: "Need assistance" },
  { type: "water", label: "Water", icon: <Droplets className="size-5" />, description: "Request water" },
  { type: "cutlery", label: "Cutlery", icon: <UtensilsCrossed className="size-5" />, description: "Need cutlery" },
  { type: "assistance", label: "Assistance", icon: <HelpCircle className="size-5" />, description: "General help" },
  { type: "bill", label: "Request Bill", icon: <Receipt className="size-5" />, description: "Ready to pay" },
];

export default function RequestsView({ sessionId }: Props) {
  const requests = useQuery(api.requests.listRequestsForSession, { sessionId });
  const createRequest = useMutation(api.requests.createWaiterRequest);
  const createFeedback = useMutation(api.requests.createCustomerFeedback);
  const [loading, setLoading] = useState<RequestType | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  const handleRequest = async (type: RequestType) => {
    setLoading(type);
    try {
      await createRequest({ sessionId, requestType: type });
      toast.success(`${REQUEST_TYPES.find((r) => r.type === type)?.label} request sent!`);
    } catch (e) {
      if (e instanceof ConvexError) toast.error(e.data.message);
      else toast.error("Failed to send request");
    } finally {
      setLoading(null);
    }
  };

  const pendingRequests = requests?.filter((r) => r.status !== "completed") ?? [];

  const handleFeedbackSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (rating === null) {
      toast.error("Please choose a rating from 1 to 5.");
      return;
    }

    setFeedbackLoading(true);
    try {
      await createFeedback({
        sessionId,
        rating,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
      setRating(null);
      setComment("");
      toast.success("Thanks! Your feedback was sent to the service team.");
    } catch (error) {
      if (error instanceof ConvexError) toast.error(error.data.message);
      else toast.error("Could not send feedback. Please try again.");
    } finally {
      setFeedbackLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-6">
      {/* Request buttons */}
      <div>
        <h3 className="font-semibold mb-3">How can we help?</h3>
        <div className="grid grid-cols-2 gap-3">
          {REQUEST_TYPES.map(({ type, label, icon, description }) => (
            <button
              key={type}
              onClick={() => handleRequest(type)}
              disabled={loading !== null}
              className={`bg-card border rounded-xl p-4 text-left transition-all hover:border-primary/50 hover:shadow-sm active:scale-95 cursor-pointer ${
                type === "bill" ? "col-span-2 bg-primary/5 border-primary/30" : ""
              }`}
            >
              <div className={`mb-2 ${type === "bill" ? "text-primary" : "text-muted-foreground"}`}>
                {loading === type ? (
                  <div className="size-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : icon}
              </div>
              <p className={`font-semibold text-sm ${type === "bill" ? "text-primary" : ""}`}>{label}</p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Active requests */}
      {pendingRequests.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            Active Requests
            <span className="bg-primary text-primary-foreground rounded-full text-xs px-2 py-0.5">
              {pendingRequests.length}
            </span>
          </h3>
          <div className="space-y-2">
            {pendingRequests.map((req) => (
              <div key={req._id} className="bg-card border rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium capitalize">{req.requestType.replace("_", " ")}</p>
                  <p className="text-xs text-muted-foreground">{timeAgo(req.createdAt)}</p>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  {req.status === "pending" ? (
                    <><Clock className="size-3 text-yellow-500" /><span className="text-yellow-600">Pending</span></>
                  ) : (
                    <><CheckCircle className="size-3 text-blue-500" /><span className="text-blue-600">In Progress</span></>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {requests === undefined && (
        <div className="space-y-2">
          {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      )}

      <form onSubmit={handleFeedbackSubmit} className="space-y-3 border-t pt-5">
        <div>
          <h3 className="font-semibold">Share your feedback</h3>
          <p className="text-sm text-muted-foreground">
            Your feedback will be received by the service team.
          </p>
        </div>
        <div className="flex gap-2" role="group" aria-label="Rating from 1 to 5">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              aria-label={`${value} star${value === 1 ? "" : "s"}`}
              aria-pressed={rating === value}
              onClick={() => setRating(value)}
              className={`rounded-md p-2 transition-colors ${
                rating !== null && value <= rating
                  ? "text-yellow-500"
                  : "text-muted-foreground"
              }`}
            >
              <Star className="size-6" fill={rating !== null && value <= rating ? "currentColor" : "none"} />
            </button>
          ))}
        </div>
        <Textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={1000}
          placeholder="Tell us about your experience (optional)"
          aria-label="Feedback comment"
        />
        <Button type="submit" disabled={feedbackLoading || rating === null}>
          {feedbackLoading ? "Sending feedback..." : "Send feedback"}
        </Button>
      </form>
    </div>
  );
}
