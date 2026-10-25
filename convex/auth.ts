
import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { validateAndRedeemMasterCode } from "./masterCode.js";
import type { MutationCtx } from "./_generated/server.js";

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

        if (typeof rawEmail !== "string" || !rawEmail.trim()) {
          throw new Error("Email is required.");
        }

        const email = rawEmail.trim().toLowerCase();

        if (params.flow === "signUp") {
          const masterCode = params.masterCode;
          const restaurantName = params.restaurantName;

          if (
            typeof masterCode !== "string" ||
            masterCode.trim().length === 0
          ) {
            throw new Error(
              "A developer-issued Master Code is required."
            );
          }

          if (
            typeof restaurantName !== "string" ||
            restaurantName.trim().length < 2
          ) {
            throw new Error(
              "Restaurant name must be at least 2 characters."
            );
          }

          const restaurantAddress =
            typeof params.restaurantAddress === "string"
              ? params.restaurantAddress.trim()
              : "";

          const contactNumber =
            typeof params.contactNumber === "string"
              ? params.contactNumber.trim()
              : "";

          // These fields are passed to the custom callback.
          // They are NOT persisted directly as a user profile.
          return {
            email,
            masterCode: masterCode.trim(),
            restaurantName: restaurantName.trim(),
            restaurantAddress,
            contactNumber,
          };
        }

        // Normal sign-in profile contains only schema-approved data.
        return { email };
      },
    }),
  ],

  callbacks: {
    async createOrUpdateUser(ctx, args) {
      const mCtx = ctx as MutationCtx;
      const profile = args.profile as Record<string, unknown>;

      const email =
        typeof profile.email === "string"
          ? profile.email.trim().toLowerCase()
          : "";

      if (!email) {
        throw new Error("Email is required.");
      }

      const masterCode =
        typeof profile.masterCode === "string"
          ? profile.masterCode
          : "";

      // Existing accounts may sign in, but cannot use signup to
      // create another restaurant or change their existing role.
      if (args.existingUserId !== null) {
        if (masterCode) {
          throw new Error(
            "This account already exists. Please sign in instead."
          );
        }

        await mCtx.db.patch("users", args.existingUserId, {
          email,
        });

        return args.existingUserId;
      }

      // A new user must be registering a restaurant.
      // Do not create unlinked accounts through ordinary sign-in.
      if (!masterCode) {
        throw new Error(
          "Account not found. Register with a valid Master Code first."
        );
      }

      const restaurantName =
        typeof profile.restaurantName === "string"
          ? profile.restaurantName.trim()
          : "";

      const restaurantAddress =
        typeof profile.restaurantAddress === "string"
          ? profile.restaurantAddress.trim()
          : "";

      const contactNumber =
        typeof profile.contactNumber === "string"
          ? profile.contactNumber.trim()
          : "";

      if (restaurantName.length < 2) {
        throw new Error(
          "Restaurant name must be at least 2 characters."
        );
      }

      // Create the user with ONLY fields permitted by the users schema.
      const userId = await mCtx.db.insert("users", {
        email,
      });

      // Create the restaurant within this same transaction.
      const restaurantId = await mCtx.db.insert("restaurants", {
        name: restaurantName,
        address: restaurantAddress || undefined,
        contactNumber: contactNumber || undefined,
        isActive: true,
        createdAt: Date.now(),
      });

      // Validate and redeem the Master Code.
      // If validation fails, the transaction rolls back all writes.
      await validateAndRedeemMasterCode(
        mCtx,
        masterCode,
        email,
        restaurantId
      );

      // Assign the registering user as the restaurant owner.
      await mCtx.db.patch("users", userId, {
        role: "owner",
        isActive: true,
        restaurantId,
        name: `${restaurantName} Owner`,
      });

      // Initialize restaurant-specific sequences.
      await mCtx.db.insert("sequences", {
        name: "session_number",
        value: 0,
        restaurantId,
      });

      await mCtx.db.insert("sequences", {
        name: "order_number",
        value: 1000,
        restaurantId,
      });

      // Generate the first table's QR token.
      const chars =
        "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

      const randomBytes = new Uint8Array(24);
      crypto.getRandomValues(randomBytes);

      const tableToken = Array.from(
        randomBytes,
        (byte) => chars[byte % chars.length]
      ).join("");

      await mCtx.db.insert("restaurant_tables", {
        tableNumber: 1,
        name: "Table 1",
        token: tableToken,
        status: "available",
        isActive: true,
        capacity: 4,
        restaurantId,
      });

      // Record restaurant registration.
      await mCtx.db.insert("audit_logs", {
        userId,
        action: "register_restaurant",
        resourceType: "restaurants",
        resourceId: restaurantId,
        details: `Registered restaurant "${restaurantName}"`,
        createdAt: new Date().toISOString(),
        restaurantId,
      });

      return userId;
    },
  },
});
