import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PaymentSettingsSection } from "./PaymentSettingsSection.tsx";
import { getSafeErrorMessage } from "@/lib/restaurant.ts";
import { ConvexError } from "convex/values";
import { getFunctionName } from "convex/server";
import type { FunctionReference } from "convex/server";

// Mock convex hooks
const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (queryFn: FunctionReference<"query">, args: unknown) => mockUseQuery(queryFn, args),
  useMutation: (mutationFn: FunctionReference<"mutation">) => mockUseMutation(mutationFn),
}));

describe("PaymentSettingsSection Component", () => {
  const mockUpdatePaymentSettings = vi.fn();
  const mockGenerateUploadUrl = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMutation.mockImplementation((mutationFn: FunctionReference<"mutation">) => {
      const name = getFunctionName(mutationFn);
      if (name === "restaurants:generateUploadUrl") {
        return mockGenerateUploadUrl;
      }
      return mockUpdatePaymentSettings;
    });

    // Default queries
    mockUseQuery.mockImplementation((queryFn: FunctionReference<"query">) => {
      const name = getFunctionName(queryFn);
      if (name === "users:getCurrentUser") {
        return { _id: "user_1", role: "owner" };
      }
      if (name === "restaurants:getCurrentRestaurant") {
        return {
          _id: "rest_1",
          name: "Spice Garden",
          upiId: "6787677877@ybl",
          upiQrUrl: "https://example.com/mock-qr.png",
        };
      }
      return null;
    });
  });

  it("1. renders UPI Payment Settings in read-only mode with saved values", () => {
    render(<PaymentSettingsSection />);

    expect(screen.getByText("UPI Payment Settings")).toBeInTheDocument();
    expect(screen.getByText("6787677877@ybl")).toBeInTheDocument();
    expect(screen.getByText("Edit Payment Settings")).toBeInTheDocument();
    expect(screen.getByText("Customer Preview")).toBeInTheDocument();
  });

  it("2. clicking 'Edit Payment Settings' opens edit mode with current UPI ID", () => {
    render(<PaymentSettingsSection />);

    const editBtn = screen.getByText("Edit Payment Settings");
    fireEvent.click(editBtn);

    expect(screen.getByDisplayValue("6787677877@ybl")).toBeInTheDocument();
    expect(screen.getByText("Save Payment Settings")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("3. saving UPI ID without a QR image calls mutation directly with upiId", async () => {
    mockUpdatePaymentSettings.mockResolvedValueOnce({ success: true });
    render(<PaymentSettingsSection />);

    fireEvent.click(screen.getByText("Edit Payment Settings"));

    const input = screen.getByDisplayValue("6787677877@ybl");
    fireEvent.change(input, { target: { value: "6787677877@ybl" } });

    const saveBtn = screen.getByText("Save Payment Settings");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdatePaymentSettings).toHaveBeenCalledWith({
        upiId: "6787677877@ybl",
      });
    });
  });

  it("4. rejects invalid UPI ID format before calling backend mutation", async () => {
    render(<PaymentSettingsSection />);

    fireEvent.click(screen.getByText("Edit Payment Settings"));

    const input = screen.getByDisplayValue("6787677877@ybl");
    fireEvent.change(input, { target: { value: "invalid-upi-no-at" } });

    const saveBtn = screen.getByText("Save Payment Settings");
    fireEvent.click(saveBtn);

    expect(mockUpdatePaymentSettings).not.toHaveBeenCalled();
    expect(screen.getByText(/Invalid format/i)).toBeInTheDocument();
  });

  it("5. removes QR image calls updatePaymentSettings with removeQrImage", async () => {
    mockUpdatePaymentSettings.mockResolvedValueOnce({ success: true });
    render(<PaymentSettingsSection />);

    fireEvent.click(screen.getByText("Edit Payment Settings"));

    const removeBtn = screen.getByText("Remove QR");
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(mockUpdatePaymentSettings).toHaveBeenCalledWith({
        removeQrImage: true,
      });
    });
  });

  it("6. getSafeErrorMessage extracts message from ConvexError, Error, or string data", () => {
    const convexErr = new ConvexError({
      code: "BAD_REQUEST",
      message: "Invalid UPI ID format.",
    });
    expect(getSafeErrorMessage(convexErr, "Fallback")).toBe("Invalid UPI ID format.");

    const stringErr = new ConvexError("Direct string error");
    expect(getSafeErrorMessage(stringErr, "Fallback")).toBe("Direct string error");

    const stdErr = new Error("Network timeout");
    expect(getSafeErrorMessage(stdErr, "Fallback")).toBe("Network timeout");

    expect(getSafeErrorMessage(null, "Fallback message")).toBe("Fallback message");
  });

  it("7. shows Staff View Only badge and disables edit button for staff", () => {
    mockUseQuery.mockImplementation((queryFn: FunctionReference<"query">) => {
      const name = getFunctionName(queryFn);
      if (name === "users:getCurrentUser") {
        return { _id: "user_2", role: "staff" };
      }
      return {
        _id: "rest_1",
        name: "Spice Garden",
        upiId: "6787677877@ybl",
      };
    });

    render(<PaymentSettingsSection />);
    expect(screen.getByText("Staff View Only")).toBeInTheDocument();
    const editBtn = screen.getByText("Edit Payment Settings");
    expect(editBtn).toBeDisabled();
  });
});
