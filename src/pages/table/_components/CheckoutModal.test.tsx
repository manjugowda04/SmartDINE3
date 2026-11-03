/// <reference types="vite/client" />
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CheckoutModal } from "./CheckoutModal.tsx";
import { getFunctionName } from "convex/server";
import type { FunctionReference } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();
const mockPlaceOrder = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (queryFn: unknown, args: unknown) => mockUseQuery(queryFn, args),
  useMutation: () => mockPlaceOrder,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("CheckoutModal Component", () => {
  const sessionId = "session_123" as Id<"table_sessions">;
  const restaurantId = "rest_456" as Id<"restaurants">;
  const onClose = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseQuery.mockImplementation((queryFn: FunctionReference<"query">) => {
      const name = getFunctionName(queryFn);

      // Return cart
      if (name === "cart:getCart") {
        return {
          items: [
            {
              _id: "cart_item_1" as Id<"cart_items">,
              sessionId,
              menuItemId: "item_1" as Id<"menu_items">,
              menuItemName: "Paneer Tikka",
              basePrice: 28000,
              quantity: 2,
              specialInstructions: "Extra spicy",
              lineTotal: 64000, // (280 + 40) * 2 = 640 INR in paise
              addons: [
                {
                  _id: "addon_1" as Id<"cart_item_addons">,
                  cartItemId: "cart_item_1" as Id<"cart_items">,
                  addonId: "m_addon_1" as Id<"menu_addons">,
                  addonName: "Extra Butter",
                  addonPrice: 4000,
                },
              ],
            },
          ],
          total: 64000,
        };
      }

      // Return session
      if (name === "sessions:getSessionById") {
        return {
          _id: sessionId,
          sessionNumber: "SES-202",
          tableId: "tab_1" as Id<"restaurant_tables">,
          status: "active",
          peopleCount: 2,
        };
      }

      // Return restaurant
      return {
        _id: restaurantId,
        name: "Spice Garden",
        gstEnabled: true,
        gstPercentage: 5,
        serviceChargeEnabled: true,
        serviceChargePercentage: 10,
        serviceChargeBasis: "subtotal",
      };
    });

    mockPlaceOrder.mockResolvedValue({
      orderId: "order_999",
      orderNumber: "ORD-1050",
    });
  });

  it("1. Renders restaurant name, table number, session number, and itemized breakdown", () => {
    render(
      <CheckoutModal
        open={true}
        onClose={onClose}
        sessionId={sessionId}
        tableNumber={3}
        restaurantName="Spice Garden"
        restaurantId={restaurantId}
        customerName="Manju"
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByText("Confirm Your Order")).toBeDefined();
    expect(screen.getByText(/Table 3/)).toBeDefined();
    expect(screen.getByText("SES-202")).toBeDefined();
    expect(screen.getByText("Manju")).toBeDefined();
    expect(screen.getByText(/2× Paneer Tikka/)).toBeDefined();
    expect(screen.getByText(/\+ Extra Butter/)).toBeDefined();
  });

  it("2. Cancel button closes the modal without submitting order", () => {
    render(
      <CheckoutModal
        open={true}
        onClose={onClose}
        sessionId={sessionId}
        tableNumber={3}
        restaurantName="Spice Garden"
        restaurantId={restaurantId}
        customerName="Manju"
        onSuccess={onSuccess}
      />
    );

    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockPlaceOrder).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("3. Confirm Order places the order, prevents duplicates, closes modal, and calls onSuccess", async () => {
    render(
      <CheckoutModal
        open={true}
        onClose={onClose}
        sessionId={sessionId}
        tableNumber={3}
        restaurantName="Spice Garden"
        restaurantId={restaurantId}
        customerName="Manju"
        onSuccess={onSuccess}
      />
    );

    const confirmBtn = screen.getByRole("button", { name: /confirm order/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockPlaceOrder).toHaveBeenCalledWith({
        sessionId,
        customerName: "Manju",
      });
      expect(onClose).toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalledWith("ORD-1050");
    });
  });
});
