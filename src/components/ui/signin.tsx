import { useState, type FormEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Loader2, LogIn, Store, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";

export interface SignInButtonProps {
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function SignInButton({ size = "default", className }: SignInButtonProps) {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [masterCode, setMasterCode] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [restaurantAddress, setRestaurantAddress] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [isRegisteringRestaurant, setIsRegisteringRestaurant] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      if (isRegisteringRestaurant) {
        if (!masterCode.trim()) {
          toast.error("Developer Master Code is required to register a restaurant.");
          setLoading(false);
          return;
        }
        if (!restaurantName.trim()) {
          toast.error("Restaurant name is required.");
          setLoading(false);
          return;
        }

        await signIn("password", {
          email: email.trim().toLowerCase(),
          password,
          flow: "signUp",
          masterCode: masterCode.trim(),
          restaurantName: restaurantName.trim(),
          restaurantAddress: restaurantAddress.trim(),
          contactNumber: contactNumber.trim(),
        });

        toast.success("Restaurant registered and owner account created!");
      } else {
        await signIn("password", {
          email: email.trim().toLowerCase(),
          password,
          flow: "signIn",
        });
        toast.success("Signed in successfully.");
      }
    } catch (error: unknown) {
      const errorMsg =
        error instanceof Error ? error.message : "Authentication failed";
      toast.error(isRegisteringRestaurant ? "Registration failed" : "Sign-in failed", {
        description: errorMsg.includes("Master code") || errorMsg.includes("master code")
          ? errorMsg
          : isRegisteringRestaurant
          ? "Check the master code and details, then try again."
          : "Check your email and password, then try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`w-full max-w-sm space-y-4 ${className ?? ""}`}>
      {isRegisteringRestaurant ? (
        <>
          <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg text-primary text-xs font-medium mb-2">
            <ShieldCheck className="size-4 shrink-0" />
            <span>Developer Master Code required for new restaurant registration</span>
          </div>

          <div className="space-y-1.5 text-left">
            <label htmlFor="master-code" className="text-xs font-semibold uppercase text-muted-foreground">
              Master Code *
            </label>
            <input
              id="master-code"
              type="password"
              autoComplete="off"
              required
              value={masterCode}
              onChange={(e) => setMasterCode(e.target.value)}
              placeholder="Enter developer-issued code"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring font-mono"
            />
          </div>

          <div className="space-y-1.5 text-left">
            <label htmlFor="restaurant-name" className="text-xs font-semibold uppercase text-muted-foreground">
              Restaurant Name *
            </label>
            <input
              id="restaurant-name"
              type="text"
              required
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
              placeholder="e.g. Bella Italia Bistro"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1.5 text-left">
            <label htmlFor="restaurant-address" className="text-xs font-semibold uppercase text-muted-foreground">
              Restaurant Address
            </label>
            <input
              id="restaurant-address"
              type="text"
              value={restaurantAddress}
              onChange={(e) => setRestaurantAddress(e.target.value)}
              placeholder="e.g. 123 Main St, Downtown"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1.5 text-left">
            <label htmlFor="contact-number" className="text-xs font-semibold uppercase text-muted-foreground">
              Contact Number
            </label>
            <input
              id="contact-number"
              type="tel"
              value={contactNumber}
              onChange={(e) => setContactNumber(e.target.value)}
              placeholder="e.g. +1 555-0199"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1.5 text-left">
            <label htmlFor="owner-email" className="text-xs font-semibold uppercase text-muted-foreground">
              Owner Email *
            </label>
            <input
              id="owner-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@restaurant.com"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1.5 text-left">
            <label htmlFor="owner-password" className="text-xs font-semibold uppercase text-muted-foreground">
              Owner Password *
            </label>
            <input
              id="owner-password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create strong password"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </>
      ) : (
        <>
          <div className="space-y-2 text-left">
            <label htmlFor="staff-email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="staff-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="staff@restaurant.com"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-2 text-left">
            <label htmlFor="staff-password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="staff-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </>
      )}

      <Button type="submit" size={size} className="w-full" disabled={loading}>
        {loading ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : isRegisteringRestaurant ? (
          <Store className="mr-2 size-4" />
        ) : (
          <LogIn className="mr-2 size-4" />
        )}
        {loading
          ? isRegisteringRestaurant
            ? "Registering restaurant..."
            : "Signing in..."
          : isRegisteringRestaurant
          ? "Register Restaurant"
          : "Sign In"}
      </Button>

      <button
        type="button"
        className="w-full text-xs text-primary underline-offset-4 hover:underline pt-1"
        disabled={loading}
        onClick={() => setIsRegisteringRestaurant((v) => !v)}
      >
        {isRegisteringRestaurant
          ? "Already have an account? Sign in"
          : "Register a new restaurant (Master Code required)"}
      </button>
    </form>
  );
}
