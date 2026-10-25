import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MenuItemCard } from "./MenuItemCard.tsx";
import type { Id, Doc } from "@/convex/_generated/dataModel.d.ts";

const mockUseMutation = vi.fn();

vi.mock("convex/react", () => ({
  useMutation: (apiFn: unknown) => mockUseMutation(apiFn),
}));

describe("MenuItemCard Component", () => {
  const mockAddToCart = vi.fn();
  const mockUpdateQty = vi.fn();
  const mockRemoveItem = vi.fn();

  const dummyItem: Doc<"menu_items"> & { addons: Doc<"menu_addons">[] } = {
    _id: "item_paneer" as Id<"menu_items">,
    _creationTime: 1000,
    categoryId: "cat_starters" as Id<"categories">,
    name: "Paneer Tikka",
    description: "Charcoal grilled cottage cheese with aromatic spices",
    price: 28000, // 280 INR in paise
    isVeg: true,
    isAvailable: true,
    sortOrder: 1,
    addons: [
      {
        _id: "addon_extra_paneer" as Id<"menu_addons">,
        _creationTime: 1001,
        menuItemId: "item_paneer" as Id<"menu_items">,
        name: "Extra Paneer",
        price: 8000, // 80 INR in paise
        isAvailable: true,
      },
      {
        _id: "addon_mint_chutney" as Id<"menu_addons">,
        _creationTime: 1002,
        menuItemId: "item_paneer" as Id<"menu_items">,
        name: "Mint Chutney",
        price: 2000, // 20 INR in paise
        isAvailable: true,
      },
    ],
  };

  const sessionId = "session_123" as Id<"table_sessions">;

  beforeEach(() => {
    vi.clearAllMocks();
    let callIndex = 0;
    mockUseMutation.mockImplementation(() => {
      callIndex++;
      const mod = callIndex % 3;
      if (mod === 1) return mockAddToCart;
      if (mod === 2) return mockUpdateQty;
      return mockRemoveItem;
    });
  });

  it("1. renders item name, base price, veg indicator and + Add button when not in cart", () => {
    render(<MenuItemCard item={dummyItem} sessionId={sessionId} cartItems={[]} />);

    expect(screen.getByText("Paneer Tikka")).toBeInTheDocument();
    expect(screen.getByText("₹280.00")).toBeInTheDocument();
    expect(screen.getByTitle("Vegetarian")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add/i })).toBeInTheDocument();
  });

  it("2. shows inline add-ons and updates calculation when checked", () => {
    render(<MenuItemCard item={dummyItem} sessionId={sessionId} cartItems={[]} />);

    const extraPaneerCheckbox = screen.getByRole("checkbox", { name: /extra paneer/i });
    expect(extraPaneerCheckbox).not.toBeChecked();

    fireEvent.click(extraPaneerCheckbox);
    expect(extraPaneerCheckbox).toBeChecked();

    // Check compact formula calculation: (₹280.00 + ₹80.00) × 1 = ₹360.00
    expect(screen.getByText(/= ₹360.00/i)).toBeInTheDocument();
  });

  it("3. clicking + Add calls addToCart without navigating", async () => {
    mockAddToCart.mockResolvedValueOnce("cart_item_1");

    render(<MenuItemCard item={dummyItem} sessionId={sessionId} cartItems={[]} />);

    const addButton = screen.getByRole("button", { name: /add/i });
    fireEvent.click(addButton);

    expect(mockAddToCart).toHaveBeenCalledWith({
      sessionId,
      menuItemId: "item_paneer",
      quantity: 1,
      selectedAddonIds: undefined,
    });
  });

  it("4. displays quantity controls when matching item is already in cart", () => {
    const cartItems = [
      {
        _id: "cart_item_1" as Id<"cart_items">,
        _creationTime: 2000,
        sessionId,
        menuItemId: "item_paneer" as Id<"menu_items">,
        menuItemName: "Paneer Tikka",
        quantity: 2,
        basePrice: 28000,
        addons: [],
        lineTotal: 56000,
      },
    ];

    render(<MenuItemCard item={dummyItem} sessionId={sessionId} cartItems={cartItems} />);

    // When in cart with quantity 2, it should display 2 and no "+ Add" button
    expect(screen.queryByRole("button", { name: /^add$/i })).not.toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByTitle("Increase quantity")).toBeInTheDocument();
    expect(screen.getByTitle("Decrease quantity")).toBeInTheDocument();
  });

  it("5. clicking + on quantity selector calls updateCartItemQuantity", () => {
    const cartItems = [
      {
        _id: "cart_item_1" as Id<"cart_items">,
        _creationTime: 2000,
        sessionId,
        menuItemId: "item_paneer" as Id<"menu_items">,
        menuItemName: "Paneer Tikka",
        quantity: 2,
        basePrice: 28000,
        addons: [],
        lineTotal: 56000,
      },
    ];

    render(<MenuItemCard item={dummyItem} sessionId={sessionId} cartItems={cartItems} />);

    fireEvent.click(screen.getByTitle("Increase quantity"));
    expect(mockUpdateQty).toHaveBeenCalledWith({
      cartItemId: "cart_item_1",
      sessionId,
      quantity: 3,
    });
  });

  it("6. clicking − when quantity is 1 calls removeFromCart", () => {
    const cartItems = [
      {
        _id: "cart_item_1" as Id<"cart_items">,
        _creationTime: 2000,
        sessionId,
        menuItemId: "item_paneer" as Id<"menu_items">,
        menuItemName: "Paneer Tikka",
        quantity: 1,
        basePrice: 28000,
        addons: [],
        lineTotal: 28000,
      },
    ];

    render(<MenuItemCard item={dummyItem} sessionId={sessionId} cartItems={cartItems} />);

    fireEvent.click(screen.getByTitle("Decrease quantity"));
    expect(mockRemoveItem).toHaveBeenCalledWith({
      cartItemId: "cart_item_1",
      sessionId,
    });
  });
});
