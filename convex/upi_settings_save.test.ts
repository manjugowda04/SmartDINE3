/// <reference types="vite/client" />
import { describe, it, expect, beforeEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema.js";
import { api } from "./_generated/api.js";
import { modules } from "./test.setup.js";
import type { Id } from "./_generated/dataModel.d.ts";

describe("Backend: UPI Payment Settings Save, Replace, Remove & Permissions", () => {
  beforeEach(() => {
    process.env.DEVELOPER_MASTER_CODE = "DEV-MASTER-2026-SECURE";
  });

  async function setupRestaurantWithRoles(t: ReturnType<typeof convexTest>) {
    return t.run(async (ctx) => {
      const restId = await ctx.db.insert("restaurants", {
        name: "Biryani House",
        isActive: true,
        createdAt: Date.now(),
      });

      const ownerId = await ctx.db.insert("users", {
        email: `owner-${Date.now()}@biryani.com`,
        name: "Owner User",
        role: "owner",
        isActive: true,
        restaurantId: restId,
      });

      const managerId = await ctx.db.insert("users", {
        email: `manager-${Date.now()}@biryani.com`,
        name: "Manager User",
        role: "manager",
        isActive: true,
        restaurantId: restId,
      });

      const staffId = await ctx.db.insert("users", {
        email: `staff-${Date.now()}@biryani.com`,
        name: "Staff User",
        role: "staff",
        isActive: true,
        restaurantId: restId,
      });

      return { restId, ownerId, managerId, staffId };
    });
  }

  it("1. Saves UPI ID without a QR image (including 6787677877@ybl) and persists", async () => {
    const t = convexTest(schema, modules);
    const { ownerId, restId } = await setupRestaurantWithRoles(t);
    const asOwner = t.withIdentity({ subject: ownerId });

    const result = await asOwner.mutation(api.restaurants.updatePaymentSettings, {
      upiId: "6787677877@ybl",
    });

    expect(result.success).toBe(true);
    expect(result.upiId).toBe("6787677877@ybl");

    // Verify persistence via getCurrentRestaurant
    const current = await asOwner.query(api.restaurants.getCurrentRestaurant, {});
    expect(current?.upiId).toBe("6787677877@ybl");

    // Verify persistence via public info
    const publicInfo = await t.query(api.restaurants.getRestaurantPublicInfo, {
      restaurantId: restId,
    });
    expect(publicInfo?.upiId).toBe("6787677877@ybl");
  });

  it("2. Saves UPI ID with a valid QR image storage ID", async () => {
    const t = convexTest(schema, modules);
    const { managerId } = await setupRestaurantWithRoles(t);
    const asManager = t.withIdentity({ subject: managerId });

    // Store a mock file in convex storage
    const storageId = (await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(["mock-qr-code-png"], { type: "image/png" }));
    })) as Id<"_storage">;

    const result = await asManager.mutation(api.restaurants.updatePaymentSettings, {
      upiId: "biryanihouse@okaxis",
      upiQrStorageId: storageId,
    });

    expect(result.success).toBe(true);
    expect(result.upiId).toBe("biryanihouse@okaxis");
    expect(result.upiQrUrl).toBeTruthy();

    const current = await asManager.query(api.restaurants.getCurrentRestaurant, {});
    expect(current?.upiQrStorageId).toBe(storageId);
    expect(current?.upiQrUrl).toBeTruthy();
  });

  it("3. Replaces an existing QR image with a new valid storage ID", async () => {
    const t = convexTest(schema, modules);
    const { ownerId } = await setupRestaurantWithRoles(t);
    const asOwner = t.withIdentity({ subject: ownerId });

    // First QR upload
    const storage1 = (await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(["qr-1"], { type: "image/png" }));
    })) as Id<"_storage">;

    await asOwner.mutation(api.restaurants.updatePaymentSettings, {
      upiId: "biryani@icici",
      upiQrStorageId: storage1,
    });

    // Replace with second QR upload
    const storage2 = (await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(["qr-2"], { type: "image/png" }));
    })) as Id<"_storage">;

    const replaceRes = await asOwner.mutation(api.restaurants.updatePaymentSettings, {
      upiQrStorageId: storage2,
    });

    expect(replaceRes.success).toBe(true);

    const current = await asOwner.query(api.restaurants.getCurrentRestaurant, {});
    expect(current?.upiQrStorageId).toBe(storage2);
    // Old storage1 should have been cleaned up
    const oldUrl = await t.run(async (ctx) => ctx.storage.getUrl(storage1));
    expect(oldUrl).toBeNull();
  });

  it("4. Removes the QR image when removeQrImage is true", async () => {
    const t = convexTest(schema, modules);
    const { ownerId } = await setupRestaurantWithRoles(t);
    const asOwner = t.withIdentity({ subject: ownerId });

    const storageId = (await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(["qr-to-delete"], { type: "image/png" }));
    })) as Id<"_storage">;

    await asOwner.mutation(api.restaurants.updatePaymentSettings, {
      upiId: "biryani@upi",
      upiQrStorageId: storageId,
    });

    // Remove QR
    const removeRes = await asOwner.mutation(api.restaurants.updatePaymentSettings, {
      removeQrImage: true,
    });

    expect(removeRes.success).toBe(true);
    expect(removeRes.upiQrUrl).toBeUndefined();

    const current = await asOwner.query(api.restaurants.getCurrentRestaurant, {});
    expect(current?.upiQrStorageId).toBeUndefined();
    expect(current?.upiQrUrl).toBeUndefined();
    expect(current?.upiId).toBe("biryani@upi");
  });

  it("5. Rejects invalid UPI ID formats with specific error message", async () => {
    const t = convexTest(schema, modules);
    const { ownerId } = await setupRestaurantWithRoles(t);
    const asOwner = t.withIdentity({ subject: ownerId });

    const invalidIds = ["invalid", "user@", "@bank", "a@b", "user@b"];
    for (const invalid of invalidIds) {
      await expect(
        asOwner.mutation(api.restaurants.updatePaymentSettings, {
          upiId: invalid,
        })
      ).rejects.toThrow(/invalid upi id format/i);
    }
  });

  it("6. Rejects unauthorized staff users", async () => {
    const t = convexTest(schema, modules);
    const { staffId } = await setupRestaurantWithRoles(t);
    const asStaff = t.withIdentity({ subject: staffId });

    await expect(
      asStaff.mutation(api.restaurants.updatePaymentSettings, {
        upiId: "staff-attempt@upi",
      })
    ).rejects.toThrow(/privileges required/i);
  });

  it("7. Rejects invalid or nonexistent QR storage IDs", async () => {
    const t = convexTest(schema, modules);
    const { ownerId } = await setupRestaurantWithRoles(t);
    const asOwner = t.withIdentity({ subject: ownerId });

    // A valid storage ID that was deleted and no longer exists in storage
    const deletedStorageId = (await t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob(["temp"], { type: "image/png" }));
      await ctx.storage.delete(id);
      return id;
    })) as Id<"_storage">;

    await expect(
      asOwner.mutation(api.restaurants.updatePaymentSettings, {
        upiQrStorageId: deletedStorageId,
      })
    ).rejects.toThrow(/not found in storage/i);

    // Malformed storage ID string
    await expect(
      asOwner.mutation(api.restaurants.updatePaymentSettings, {
        upiQrStorageId: "malformed-storage-id" as unknown as Id<"_storage">,
      })
    ).rejects.toThrow(/Expected ID for table/i);
  });
});
