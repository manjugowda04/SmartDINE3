
import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { validateAndRedeemMasterCode } from "./masterCode.js";
import type { MutationCtx } from "./_generated/server.js";

/**
 * Computes a SHA-256 hex digest of a token string.
 */
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const {
  auth,
  signIn,
  signOut,
  store,
  isAuthenticated,
} = convexAuth({
  providers: [
    Password({
      profile: (params): Record<string, string> & { email: string } => {
        const rawEmail = params.email;

        if (typeof rawEmail !== "string" || rawEmail.trim().length === 0) {
          throw new Error("Email is required.");
        }

        const email = rawEmail.trim().toLowerCase();
        const result: Record<string, string> & { email: string } = { email };

        if (params.flow === "signUp") {
          // Restaurant owner registration using a developer-issued Master Code.
          const masterCode = params.masterCode;

          if (
            typeof masterCode === "string" &&
            masterCode.trim().length > 0
          ) {
            const restaurantName =
              typeof params.restaurantName === "string" &&
              params.restaurantName.trim().length >= 2
                ? params.restaurantName.trim()
                : "My Restaurant";

            const restaurantAddress =
              typeof params.restaurantAddress === "string"
                ? params.restaurantAddress.trim()
                : "";

            const contactNumber =
              typeof params.contactNumber === "string"
                ? params.contactNumber.trim()
                : "";

            // Do not use underscore-prefixed custom profile fields.
            result.masterCode = masterCode.trim();
            result.restaurantName = restaurantName;
            result.restaurantAddress = restaurantAddress;
            result.contactNumber = contactNumber;

            return result;
          }

          // Legacy staff invitation signup support.
          const invitationToken = params.invitationToken;

          if (
            typeof invitationToken === "string" &&
            invitationToken.trim().length === 48
          ) {
            result.invitationToken = invitationToken.trim();
            return result;
          }

          throw new Error(
            "Registration requires a developer-issued Master Code for new restaurants or an invitation link for staff."
          );
        }

        return result;
      },
    }),
  ],

  callbacks: {
    async afterUserCreatedOrUpdated(ctx, args) {
      const mCtx = ctx as unknown as MutationCtx;

      if (args.type !== "credentials") {
        return;
      }

      const profile = args.profile as Record<string, unknown>;

      // Case 1: Register a new restaurant using a Master Code.
      const masterCode = profile.masterCode;

      if (typeof masterCode === "string" && masterCode.length > 0) {
        const restaurantName =
          typeof profile.restaurantName === "string"
            ? profile.restaurantName
            : "My Restaurant";

        const restaurantAddress =
          typeof profile.restaurantAddress === "string"
            ? profile.restaurantAddress
            : "";

        const contactNumber =
          typeof profile.contactNumber === "string"
            ? profile.contactNumber
            : "";

        const email =
          typeof profile.email === "string" ? profile.email : "";

        // Create the restaurant within this mutation.
        const restaurantId = await ctx.db.insert("restaurants", {
          name: restaurantName,
          address: restaurantAddress || undefined,
          contactNumber: contactNumber || undefined,
          isActive: true,
          createdAt: Date.now(),
        });

        // Validate and redeem the Master Code.
        // If validation throws, Convex rolls back this mutation's writes.
        await validateAndRedeemMasterCode(
          ctx,
          masterCode,
          email,
          restaurantId
        );

        // Associate the registering user with the new restaurant as owner.
        await mCtx.db.patch("users", args.userId, {
          role: "owner",
          isActive: true,
          restaurantId,
          name: `${restaurantName} Owner`,
        });

        // Initialize restaurant-specific sequences.
        await ctx.db.insert("sequences", {
          name: "session_number",
          value: 0,
          restaurantId,
        });

        await ctx.db.insert("sequences", {
          name: "order_number",
          value: 1000,
          restaurantId,
        });

        // Create the first table with a random QR token.
        const chars =
          "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

        const tableToken = Array.from({ length: 24 }, () =>
          chars[Math.floor(Math.random() * chars.length)]
        ).join("");

        await ctx.db.insert("restaurant_tables", {
          tableNumber: 1,
          name: "Table 1",
          token: tableToken,
          status: "available",
          isActive: true,
          capacity: 4,
          restaurantId,
        });

        // Record the registration in the audit log.
        await ctx.db.insert("audit_logs", {
          userId: args.userId,
          action: "register_restaurant",
          resourceType: "restaurants",
          resourceId: restaurantId,
          details: `Registered restaurant "${restaurantName}"`,
          createdAt: new Date().toISOString(),
          restaurantId,
        });
      }

      // Case 2: Legacy staff invitation redemption.
      // This is retained for compatibility with existing invitation records.
      const invitationToken = profile.invitationToken;

      if (
        typeof invitationToken === "string" &&
        invitationToken.length === 48
      ) {
        const tokenHash = await hashToken(invitationToken);

        const invitation = await mCtx.db
          .query("staff_invitations")
          .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
          .unique();

        if (!invitation) {
          throw new Error("Invitation not found.");
        }

        if (invitation.status === "revoked") {
          throw new Error("This invitation has been revoked.");
        }

        if (invitation.status === "redeemed") {
          throw new Error("This invitation has already been redeemed.");
        }

        if (Date.now() > invitation.expiresAt) {
          throw new Error("This invitation has expired.");
        }

        const userEmail =
          typeof profile.email === "string"
            ? profile.email.trim().toLowerCase()
            : "";

        if (invitation.email.trim().toLowerCase() !== userEmail) {
          throw new Error(
            "Invitation was issued for a different email address."
          );
        }

        await mCtx.db.patch("staff_invitations", invitation._id, {
          status: "redeemed",
          redeemedAt: Date.now(),
          redeemedBy: args.userId,
        });

        await mCtx.db.patch("users", args.userId, {
          role: invitation.role,
          isActive: true,
          restaurantId: invitation.restaurantId,
          name: invitation.name,
        });
      }
    },
  },
});
