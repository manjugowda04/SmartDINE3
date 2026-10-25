import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TaxAndChargesSection } from "./TaxAndChargesSection.tsx";

// Mock convex hooks
const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
}));

describe("TaxAndChargesSection Component", () => {
  const mockUpdateMutation = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMutation.mockReturnValue(mockUpdateMutation);
    mockUseQuery.mockReturnValue({
      _id: "rest_1",
      name: "SmartDine",
      gstEnabled: true,
      gstPercentage: 5,
      serviceChargeEnabled: true,
      serviceChargePercentage: 10,
      serviceChargeBasis: "subtotal",
    });
  });

  it("1. renders Tax & Service Charges form with initial restaurant values", () => {
    render(<TaxAndChargesSection />);

    expect(screen.getByText("Tax & Service Charges")).toBeInTheDocument();
    expect(screen.getByText("Goods and Services Tax (GST)")).toBeInTheDocument();
    expect(screen.getByText("Service Charge")).toBeInTheDocument();
    expect(screen.getByDisplayValue("5")).toBeInTheDocument();
    expect(screen.getByDisplayValue("10")).toBeInTheDocument();
  });

  it("2. displays live preview calculating ₹1,000 + 5% GST + 10% Service Charge = ₹1,150", () => {
    render(<TaxAndChargesSection />);

    // Live preview should show breakdown matching the prompt's illustrative example
    expect(screen.getByText("Live Bill Preview")).toBeInTheDocument();
    expect(screen.getByText("Final Payable Amount")).toBeInTheDocument();
    // Total payable ₹1,150.00
    expect(screen.getByText("₹1,150.00")).toBeInTheDocument();
  });

  it("3. saving submits configured tax settings to backend mutation", async () => {
    mockUpdateMutation.mockResolvedValueOnce({ success: true });
    const { container } = render(<TaxAndChargesSection />);

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockUpdateMutation).toHaveBeenCalledWith({
        gstEnabled: true,
        gstPercentage: 5,
        serviceChargeEnabled: true,
        serviceChargePercentage: 10,
        serviceChargeBasis: "subtotal",
      });
    });
  });
});
