import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { formatINR } from "@/lib/restaurant.ts";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";

type Range = 1 | 7 | 30;

export default function AnalyticsPage() {
  const [range, setRange] = useState<Range>(7);

  const analytics = useQuery(api.analytics.getAnalytics, { days: range });
  const dailyRevenue = useQuery(api.analytics.getDailyRevenue, { days: range });
  const dailyCounts = useQuery(api.analytics.getDailyCounts, { days: range });

  const isLoading = analytics === undefined || dailyRevenue === undefined;

  const COLORS = ["#ea580c", "#16a34a", "#2563eb", "#9333ea", "#dc2626"];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <div className="flex gap-2">
          {([1, 7, 30] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                range === r ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
              }`}
            >
              {r === 1 ? "Today" : r === 7 ? "7 Days" : "30 Days"}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Revenue", value: formatINR(analytics.totalRevenue) },
              { label: "Orders", value: String(analytics.totalOrders) },
              { label: "Customers", value: String(analytics.totalCustomers) },
              { label: "Active Tables", value: String(analytics.activeTables) },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-bold mt-1">{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Revenue chart */}
          {dailyRevenue.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Daily Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={dailyRevenue.map((d) => ({ ...d, revenue: d.revenue / 100 }))}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `₹${v}`} />
                    <Tooltip formatter={(v) => [`₹${Number(v).toFixed(0)}`, "Revenue"]} />
                    <Bar dataKey="revenue" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Customer counts chart */}
          {dailyCounts && dailyCounts.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Daily Customers</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={dailyCounts}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Payment breakdown */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Payment Methods</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(analytics.paymentByMethod).map(([method, amount]) => (
                    <div key={method} className="flex justify-between items-center">
                      <span className="capitalize text-sm font-medium">{method}</span>
                      <span className="font-bold">{formatINR(amount)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Top 5 items */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {analytics.top5Items.map((item, idx) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs w-4">#{idx + 1}</span>
                      <span className="text-sm flex-1 truncate">{item.name}</span>
                      <span className="text-sm font-bold">{item.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Cancelled Orders</p>
                <p className="text-2xl font-bold mt-1 text-destructive">{analytics.cancelledOrders}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Avg Order Value</p>
                <p className="text-2xl font-bold mt-1">
                  {analytics.totalOrders > 0 ? formatINR(Math.round(analytics.totalRevenue / analytics.totalOrders)) : "₹0"}
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
