import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRef, useEffect } from "react";
import { audioNotifier } from "@/lib/audioNotification.ts";
import { formatTime, requestTypeLabel } from "@/lib/restaurant.ts";

// Helper hook mimicking the notification engine in ManagementLayout
function useStaffNotifications({
  activeOrders,
  waiterRequests,
  onNotifyOrder,
  onNotifyRequest,
}: {
  activeOrders: Array<{ _id: string; status: string; orderNumber: string; placedAt: string; table?: { tableNumber: number } | null }> | undefined;
  waiterRequests: Array<{ _id: string; status: string; requestType: string; createdAt: string; table?: { tableNumber: number } | null }> | undefined;
  onNotifyOrder: (title: string, desc: string) => void;
  onNotifyRequest: (title: string, desc: string) => void;
}) {
  const seenOrderIdsRef = useRef<Set<string>>(new Set());
  const isOrdersInitializedRef = useRef<boolean>(false);

  const seenRequestIdsRef = useRef<Set<string>>(new Set());
  const isRequestsInitializedRef = useRef<boolean>(false);

  useEffect(() => {
    if (activeOrders === undefined) return;

    if (!isOrdersInitializedRef.current) {
      activeOrders.forEach((o) => seenOrderIdsRef.current.add(o._id));
      isOrdersInitializedRef.current = true;
      return;
    }

    for (const order of activeOrders) {
      if (!seenOrderIdsRef.current.has(order._id)) {
        seenOrderIdsRef.current.add(order._id);

        if (order.status === "placed") {
          audioNotifier.playOrderChime();
          onNotifyOrder(
            "🔔 New Order Received!",
            `Table ${order.table?.tableNumber ?? "?"} · ${order.orderNumber} · ${formatTime(order.placedAt)}`
          );
        }
      }
    }
  }, [activeOrders, onNotifyOrder]);

  useEffect(() => {
    if (waiterRequests === undefined) return;

    if (!isRequestsInitializedRef.current) {
      waiterRequests.forEach((r) => seenRequestIdsRef.current.add(r._id));
      isRequestsInitializedRef.current = true;
      return;
    }

    for (const req of waiterRequests) {
      if (!seenRequestIdsRef.current.has(req._id)) {
        seenRequestIdsRef.current.add(req._id);

        if (req.status === "pending") {
          audioNotifier.playRequestChime();
          onNotifyRequest(
            `🔔 New Service Request — Table ${req.table?.tableNumber ?? "?"}`,
            `${requestTypeLabel(req.requestType)} · ${formatTime(req.createdAt)}`
          );
        }
      }
    }
  }, [waiterRequests, onNotifyRequest]);
}

describe("Real-time Notification Engine", () => {
  let playOrderChimeSpy: ReturnType<typeof vi.spyOn>;
  let playRequestChimeSpy: ReturnType<typeof vi.spyOn>;
  let onNotifyOrderMock: ReturnType<typeof vi.fn<(title: string, desc: string) => void>>;
  let onNotifyRequestMock: ReturnType<typeof vi.fn<(title: string, desc: string) => void>>;

  beforeEach(() => {
    playOrderChimeSpy = vi.spyOn(audioNotifier, "playOrderChime").mockImplementation(() => {});
    playRequestChimeSpy = vi.spyOn(audioNotifier, "playRequestChime").mockImplementation(() => {});
    onNotifyOrderMock = vi.fn<(title: string, desc: string) => void>();
    onNotifyRequestMock = vi.fn<(title: string, desc: string) => void>();
  });

  it("1. initial load does NOT play sounds or show notifications (prevents false alerts on refresh)", () => {
    const existingOrders = [
      { _id: "ord_1", status: "placed", orderNumber: "ORD-1001", placedAt: new Date().toISOString(), table: { tableNumber: 3 } },
      { _id: "ord_2", status: "preparing", orderNumber: "ORD-1002", placedAt: new Date().toISOString(), table: { tableNumber: 5 } },
    ];
    const existingRequests = [
      { _id: "req_1", status: "pending", requestType: "waiter", createdAt: new Date().toISOString(), table: { tableNumber: 2 } },
    ];

    renderHook(() =>
      useStaffNotifications({
        activeOrders: existingOrders,
        waiterRequests: existingRequests,
        onNotifyOrder: onNotifyOrderMock,
        onNotifyRequest: onNotifyRequestMock,
      })
    );

    expect(playOrderChimeSpy).not.toHaveBeenCalled();
    expect(playRequestChimeSpy).not.toHaveBeenCalled();
    expect(onNotifyOrderMock).not.toHaveBeenCalled();
    expect(onNotifyRequestMock).not.toHaveBeenCalled();
  });

  it("2. genuinely new order plays order chime and displays notification with table, order number, and time", () => {
    let currentOrders = [
      { _id: "ord_1", status: "placed", orderNumber: "ORD-1001", placedAt: new Date().toISOString(), table: { tableNumber: 3 } },
    ];

    const { rerender } = renderHook(
      ({ orders }) =>
        useStaffNotifications({
          activeOrders: orders,
          waiterRequests: [],
          onNotifyOrder: onNotifyOrderMock,
          onNotifyRequest: onNotifyRequestMock,
        }),
      { initialProps: { orders: currentOrders } }
    );

    // Initial load check
    expect(playOrderChimeSpy).not.toHaveBeenCalled();

    // Now simulate arrival of new order
    const newOrder = {
      _id: "ord_2",
      status: "placed",
      orderNumber: "ORD-1002",
      placedAt: "2026-10-23T12:00:00.000Z",
      table: { tableNumber: 4 },
    };
    currentOrders = [...currentOrders, newOrder];

    act(() => {
      rerender({ orders: currentOrders });
    });

    expect(playOrderChimeSpy).toHaveBeenCalledTimes(1);
    expect(onNotifyOrderMock).toHaveBeenCalledWith(
      "🔔 New Order Received!",
      expect.stringContaining("Table 4 · ORD-1002")
    );
  });

  it("3. genuinely new service request plays request chime and displays request type and table", () => {
    let currentRequests = [
      { _id: "req_1", status: "pending", requestType: "waiter", createdAt: new Date().toISOString(), table: { tableNumber: 1 } },
    ];

    const { rerender } = renderHook(
      ({ requests }) =>
        useStaffNotifications({
          activeOrders: [],
          waiterRequests: requests,
          onNotifyOrder: onNotifyOrderMock,
          onNotifyRequest: onNotifyRequestMock,
        }),
      { initialProps: { requests: currentRequests } }
    );

    expect(playRequestChimeSpy).not.toHaveBeenCalled();

    // Now simulate arrival of new service request (e.g. Request Bill)
    const newRequest = {
      _id: "req_2",
      status: "pending",
      requestType: "bill",
      createdAt: "2026-10-23T12:05:00.000Z",
      table: { tableNumber: 7 },
    };
    currentRequests = [...currentRequests, newRequest];

    act(() => {
      rerender({ requests: currentRequests });
    });

    expect(playRequestChimeSpy).toHaveBeenCalledTimes(1);
    expect(onNotifyRequestMock).toHaveBeenCalledWith(
      "🔔 New Service Request — Table 7",
      expect.stringContaining("Request Bill")
    );
  });

  it("4. status changes on existing orders/requests do NOT fire repeated notifications", () => {
    let currentOrders = [
      { _id: "ord_1", status: "placed", orderNumber: "ORD-1001", placedAt: new Date().toISOString(), table: { tableNumber: 2 } },
    ];

    const { rerender } = renderHook(
      ({ orders }) =>
        useStaffNotifications({
          activeOrders: orders,
          waiterRequests: [],
          onNotifyOrder: onNotifyOrderMock,
          onNotifyRequest: onNotifyRequestMock,
        }),
      { initialProps: { orders: currentOrders } }
    );

    // Transition ord_1 to accepted
    currentOrders = [
      { _id: "ord_1", status: "accepted", orderNumber: "ORD-1001", placedAt: new Date().toISOString(), table: { tableNumber: 2 } },
    ];

    act(() => {
      rerender({ orders: currentOrders });
    });

    // Still no notifications
    expect(playOrderChimeSpy).not.toHaveBeenCalled();
    expect(onNotifyOrderMock).not.toHaveBeenCalled();
  });
});
