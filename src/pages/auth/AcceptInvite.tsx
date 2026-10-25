import { useState, type FormEvent } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { toast } from "sonner";
import { UtensilsCrossed, ShieldAlert, CheckCircle2, Lock, ArrowRight } from "lucide-react";

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { signIn, signOut } = useAuthActions();

  const details = useQuery(
    api.staff.getInvitationDetails,
    token ? { token: token.trim() } : "skip"
  );
  const finalizeRedemption = useMutation(api.staff.finalizeInvitationRedemption);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="bg-card border rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-lg">
          <ShieldAlert className="size-12 text-destructive mx-auto" />
          <h1 className="text-xl font-bold">Invalid Link</h1>
          <p className="text-muted-foreground text-sm">
            No invitation token was provided in the URL.
          </p>
          <Button asChild className="w-full">
            <Link to="/management">Go to Sign In</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (details === undefined) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-3">
        <Spinner className="size-8" />
        <p className="text-sm text-muted-foreground">Validating invitation...</p>
      </div>
    );
  }

  if (!details.isValid || !details.email) {
    let errorTitle = "Invitation Unavailable";
    let errorMessage = "This invitation link is invalid or does not exist.";

    if (details.reason === "REVOKED") {
      errorTitle = "Invitation Revoked";
      errorMessage = "This invitation has been revoked by the restaurant owner.";
    } else if (details.reason === "ALREADY_REDEEMED") {
      errorTitle = "Already Redeemed";
      errorMessage = "This invitation has already been used to create an account. Please sign in instead.";
    } else if (details.reason === "EXPIRED") {
      errorTitle = "Invitation Expired";
      errorMessage = "This invitation link has expired. Please contact the owner for a new invite.";
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="bg-card border rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-lg">
          <ShieldAlert className="size-12 text-amber-500 mx-auto" />
          <h1 className="text-2xl font-bold">{errorTitle}</h1>
          <p className="text-muted-foreground text-sm">{errorMessage}</p>
          <Button asChild className="w-full">
            <Link to="/management">Go to Sign In</Link>
          </Button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      // 1. Clear any active session in the current browser to prevent cross-account leakage
      try {
        await signOut();
      } catch {
        // Ignore if already signed out
      }

      // 2. Sign up through Convex Auth with the invitation token
      await signIn("password", {
        email: details.email.trim().toLowerCase(),
        password,
        flow: "signUp",
        invitationToken: token.trim(),
      });

      // 3. Finalize the redemption
      await finalizeRedemption({ token: token.trim() });

      toast.success("Account created successfully! Welcome to SmartDine.");
      navigate("/management", { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to set up account.";
      toast.error("Signup failed", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-8">
      <div className="bg-card border rounded-2xl p-8 max-w-md w-full space-y-6 shadow-xl">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="bg-primary rounded-xl p-3 size-14 mx-auto flex items-center justify-center mb-2 shadow-sm">
            <UtensilsCrossed className="size-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Accept Invitation</h1>
          <p className="text-sm text-muted-foreground">
            You've been invited to join the team at{" "}
            <span className="font-semibold text-foreground">
              {details.restaurantName ?? "SmartDine"}
            </span>{" "}
            as a{" "}
            <span className="font-semibold text-primary uppercase">
              {details.role}
            </span>
            .
          </p>
        </div>

        {/* Invitee Info Card */}
        <div className="bg-muted/50 rounded-xl p-3.5 border text-sm space-y-1">
          {details.restaurantName && (
            <div className="flex justify-between">
              <span className="text-muted-foreground text-xs uppercase font-medium">Restaurant</span>
              <span className="font-semibold">{details.restaurantName}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground text-xs uppercase font-medium">Invited Name</span>
            <span className="font-medium">{details.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground text-xs uppercase font-medium">Email</span>
            <span className="font-mono text-xs">{details.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground text-xs uppercase font-medium">Role</span>
            <span className="font-semibold uppercase text-xs text-primary">{details.role}</span>
          </div>
        </div>

        {/* Password Setup Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase text-muted-foreground">
              Create Password
            </label>
            <Input
              type="password"
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase text-muted-foreground">
              Confirm Password
            </label>
            <Input
              type="password"
              placeholder="Re-enter your password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full"
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full gap-2" size="lg">
            {loading ? (
              <>
                <Spinner className="size-4" />
                Setting up account...
              </>
            ) : (
              <>
                <Lock className="size-4" />
                Set Password & Join
              </>
            )}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link to="/management" className="text-primary underline hover:text-primary/80">
            Sign in here
          </Link>
        </p>
      </div>
    </div>
  );
}
