import type { MutationCtx } from "./_generated/server.js";
import type { Id } from "./_generated/dataModel.d.ts";

/**
 * Computes SHA-256 hash of a string.
 */
export async function hashString(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Throttles registration brute-force attempts per email/identifier.
 */
export async function checkRateLimit(
  ctx: MutationCtx,
  identifier: string
): Promise<void> {
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const now = Date.now();
  const allRecent = await ctx.db
    .query("registration_attempts")
    .withIndex("by_target_time", (q) =>
      q.eq("ipOrEmail", identifier).gt("attemptTime", now - windowMs)
    )
    .collect();
  const recentFailedAttempts = allRecent.filter((a) => !a.success);

  if (recentFailedAttempts.length >= 5) {
    throw new Error(
      "Too many failed registration attempts. Please wait 15 minutes before trying again."
    );
  }
}

/**
 * Records a registration attempt for rate-limiting.
 */
export async function recordAttempt(
  ctx: MutationCtx,
  identifier: string,
  success: boolean
): Promise<void> {
  await ctx.db.insert("registration_attempts", {
    ipOrEmail: identifier,
    attemptTime: Date.now(),
    success,
  });
}

/**
 * Validates and redeems a developer Master Code atomically.
 * Ensures single-use redemption, rate-limiting, and server-side secret validation.
 * Never logs or exposes the submitted code.
 */
export async function validateAndRedeemMasterCode(
  ctx: MutationCtx,
  code: string,
  identifier: string,
  restaurantId?: Id<"restaurants">
): Promise<boolean> {
  const trimmed = code.trim();
  if (!trimmed) {
    await recordAttempt(ctx, identifier, false);
    throw new Error("Master Code is required.");
  }

  await checkRateLimit(ctx, identifier);

  const codeHash = await hashString(trimmed);

  // Check if this code hash was already recorded/redeemed in database
  const existingRecord = await ctx.db
    .query("developer_master_codes")
    .withIndex("by_code_hash", (q) => q.eq("codeHash", codeHash))
    .unique();

  if (existingRecord && existingRecord.isRedeemed) {
    await recordAttempt(ctx, identifier, false);
    throw new Error("This Master Code has already been redeemed.");
  }

  // Check against server-configured developer master code
  const configuredEnvCode =
    process.env.DEVELOPER_MASTER_CODE || process.env.MASTER_CODE;
  let isValid = false;

  if (configuredEnvCode && trimmed === configuredEnvCode.trim()) {
    isValid = true;
  } else if (existingRecord && !existingRecord.isRedeemed) {
    isValid = true;
  }

  if (!isValid) {
    await recordAttempt(ctx, identifier, false);
    throw new Error(
      "Invalid Master Code. A valid developer-issued code is required to register a restaurant."
    );
  }

  // Atomically mark code as redeemed with timestamp and restaurant reference
  const now = Date.now();
  if (existingRecord) {
    await ctx.db.patch("developer_master_codes", existingRecord._id, {
      isRedeemed: true,
      redeemedAt: now,
      redeemedByRestaurantId: restaurantId,
    });
  } else {
    await ctx.db.insert("developer_master_codes", {
      codeHash,
      isRedeemed: true,
      redeemedAt: now,
      redeemedByRestaurantId: restaurantId,
      createdAt: now,
    });
  }

  await recordAttempt(ctx, identifier, true);
  return true;
}
