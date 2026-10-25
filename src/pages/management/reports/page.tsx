import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { formatINR, orderStatusColor } from "@/lib/restaurant.ts";
import { Printer, Download, Store, Phone, MapPin, Calendar, FileText } from "lucide-react";

type Range = 1 | 7 | 30;

export default function ReportsPage() {
  const [range, setRange] = useState<Range>(7);
  const restaurant = useQuery(api.restaurants.getCurrentRestaurant);
  const analytics = useQuery(api.analytics.getAnalytics, { days: range });
  const dailyRevenue = useQuery(api.analytics.getDailyRevenue, { days: range });
  const dailyCounts = useQuery(api.analytics.getDailyCounts, { days: range });
  const allOrders = useQuery(api.orders.listAllOrdersForManagement, {});

  const isLoading =
    analytics === undefined ||
    dailyRevenue === undefined ||
    allOrders === undefined ||
    restaurant === undefined;

  const handlePrint = () => {
    window.print();
  };

  const rangeLabel = range === 1 ? "Today" : range === 7 ? "Previous 7 Days" : "Last 30 Days";

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Printable styles embedded directly for pristine PDF generation */}
      <style>{`
        @media print {
          aside, nav, button, .no-print {
            display: none !important;
          }
          body, main {
            background: white !important;
            color: black !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .print-only {
            display: block !important;
          }
          .print-header {
            border-bottom: 2px solid #000;
            padding-bottom: 12px;
            margin-bottom: 20px;
          }
          .card-print {
            border: 1px solid #ccc !important;
            box-shadow: none !important;
            break-inside: avoid;
            margin-bottom: 16px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 6px 8px;
            font-size: 11px;
          }
          th {
            background-color: #f5f5f5 !important;
            color: #000 !important;
          }
        }
        @media screen {
          .print-only {
            display: none;
          }
        }
      `}</style>

      {/* Screen Controls Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 no-print">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="size-6 text-primary" />
            Restaurant Reports
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {restaurant?.name ?? "SmartDine"} · Performance & Analytics
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-muted p-1 rounded-lg">
            {([1, 7, 30] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  range === r
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r === 1 ? "Today" : r === 7 ? "Weekly (7d)" : "Monthly (30d)"}
              </button>
            ))}
          </div>

          <Button
            onClick={handlePrint}
            variant="default"
            size="sm"
            className="gap-2 shadow-sm"
            disabled={isLoading}
          >
            <Printer className="size-4" />
            <span>Export Weekly PDF</span>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {/* Print-Only Header for PDF Output */}
          <div className="print-only print-header">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-extrabold">{restaurant?.name ?? "SmartDine"}</h1>
                {restaurant?.address && (
                  <p className="text-xs text-gray-600 mt-0.5">{restaurant.address}</p>
                )}
                {restaurant?.contactNumber && (
                  <p className="text-xs text-gray-600">Contact: {restaurant.contactNumber}</p>
                )}
              </div>
              <div className="text-right">
                <h2 className="text-base font-bold uppercase tracking-wide">
                  Weekly Business Report
                </h2>
                <p className="text-xs text-gray-600 mt-0.5">Range: {rangeLabel}</p>
                <p className="text-[10px] text-gray-500">
                  Generated: {new Date().toLocaleString("en-IN")}
                </p>
              </div>
            </div>
          </div>

          {/* Sales summary */}
          <Card className="card-print">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Sales Summary ({rangeLabel})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div className="p-3 bg-muted/40 rounded-xl">
                  <p className="text-2xl font-bold text-primary">
                    {formatINR(analytics.totalRevenue)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Total Revenue</p>
                </div>
                <div className="p-3 bg-muted/40 rounded-xl">
                  <p className="text-2xl font-bold">{analytics.totalOrders}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Total Orders</p>
                </div>
                <div className="p-3 bg-muted/40 rounded-xl">
                  <p className="text-2xl font-bold">{analytics.totalCustomers}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Total Customers</p>
                </div>
                <div className="p-3 bg-muted/40 rounded-xl">
                  <p className="text-2xl font-bold text-destructive">
                    {analytics.cancelledOrders}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Cancellations</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Daily breakdown */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="card-print">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Daily Revenue</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y text-xs">
                  {dailyRevenue.map((d) => (
                    <div key={d.date} className="flex justify-between px-4 py-2">
                      <span className="text-muted-foreground font-mono">{d.date}</span>
                      <span className="font-semibold">{formatINR(d.revenue)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="card-print">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Daily Customer Count</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y text-xs">
                  {(dailyCounts ?? []).map((d) => (
                    <div key={d.date} className="flex justify-between px-4 py-2">
                      <span className="text-muted-foreground font-mono">{d.date}</span>
                      <span className="font-semibold">{d.count} diners</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Payment breakdown */}
          <Card className="card-print">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Payment Method Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.entries(analytics.paymentByMethod).map(([method, amount]) => (
                  <div key={method} className="border rounded-xl p-3 flex justify-between items-center">
                    <span className="capitalize font-medium text-xs">{method}</span>
                    <span className="font-bold text-sm text-primary">{formatINR(amount)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Top 5 and Least 5 */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="card-print">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Top 5 Best-Selling Items</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {analytics.top5Items.map((item, idx) => (
                  <div
                    key={item.name}
                    className="flex justify-between px-4 py-2 text-xs border-t first:border-t-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground font-mono w-4">#{idx + 1}</span>
                      <span className="font-medium">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-semibold">{item.count} sold</span>
                      <span className="text-muted-foreground ml-2">({formatINR(item.revenue)})</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="card-print">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Least Ordered Items</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {analytics.least5Items.map((item) => (
                  <div
                    key={item.name}
                    className="flex justify-between px-4 py-2 text-xs border-t first:border-t-0"
                  >
                    <span className="font-medium">{item.name}</span>
                    <span className="font-semibold text-muted-foreground">{item.count} sold</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Order History with Customer Phone (Denormalized & Scoped) */}
          <Card className="card-print">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Recent Orders & Transactions</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="p-2.5 font-semibold">Order #</th>
                      <th className="p-2.5 font-semibold">Table</th>
                      <th className="p-2.5 font-semibold">Customer Phone</th>
                      <th className="p-2.5 font-semibold">Status</th>
                      <th className="p-2.5 font-semibold text-right">Amount</th>
                      <th className="p-2.5 font-semibold text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {allOrders.slice(0, 30).map((order) => (
                      <tr key={order._id} className="hover:bg-muted/20">
                        <td className="p-2.5 font-mono text-[11px] font-medium">{order.orderNumber}</td>
                        <td className="p-2.5">Table {order.table?.tableNumber ?? "?"}</td>
                        <td className="p-2.5 font-mono text-[11px] text-muted-foreground">
                          {order.customerPhone ?? "—"}
                        </td>
                        <td className="p-2.5">
                          <span
                            className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium ${orderStatusColor(
                              order.status
                            )}`}
                          >
                            {order.status}
                          </span>
                        </td>
                        <td className="p-2.5 font-semibold text-right">{formatINR(order.total)}</td>
                        <td className="p-2.5 text-muted-foreground text-right text-[11px]">
                          {order.placedAt.slice(0, 16).replace("T", " ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
