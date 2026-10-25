import { useQuery, useMutation } from "convex/react";
import { useState, type FormEvent, useRef } from "react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { formatINR } from "@/lib/restaurant.ts";
import {
  Users,
  ShoppingBag,
  DollarSign,
  Table2,
  XCircle,
  TrendingUp,
  Database,
  Store,
  Edit2,
  Check,
  X,
  Upload,
  MapPin,
  Phone,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { TaxAndChargesSection } from "./_components/TaxAndChargesSection.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

function StatCard({
  title,
  value,
  icon: Icon,
  sub,
}: {
  title: string;
  value: string;
  icon: React.FC<{ className?: string }>;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="bg-primary/10 rounded-xl p-3">
            <Icon className="size-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [seeding, setSeeding] = useState(false);
  const restaurant = useQuery(api.restaurants.getCurrentRestaurant);
  const updateProfile = useMutation(api.restaurants.updateRestaurantProfile);
  const generateUploadUrl = useMutation(api.restaurants.generateUploadUrl);

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const analytics = useQuery(api.analytics.getAnalytics, { days: 1 });
  const analytics7 = useQuery(api.analytics.getAnalytics, { days: 7 });
  const activeSessions = useQuery(api.sessions.listActiveSessions, {});
  const activeOrders = useQuery(api.orders.listActiveOrders, {});
  const tables = useQuery(api.tables.listTables, {});
  const seedDatabase = useMutation(api.seed.seedDatabase);

  const startEditProfile = () => {
    if (restaurant) {
      setEditName(restaurant.name);
      setEditAddress(restaurant.address ?? "");
      setEditPhone(restaurant.contactNumber ?? "");
      setIsEditingProfile(true);
    }
  };

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) {
      toast.error("Restaurant name cannot be empty");
      return;
    }

    setSavingProfile(true);
    try {
      let logoStorageId: Id<"_storage"> | undefined;

      const file = fileInputRef.current?.files?.[0];
      if (file) {
        const uploadUrl = await generateUploadUrl();
        const uploadResult = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const { storageId } = await uploadResult.json();
        logoStorageId = storageId as Id<"_storage">;
      }

      await updateProfile({
        name: editName.trim(),
        address: editAddress.trim(),
        contactNumber: editPhone.trim(),
        ...(logoStorageId ? { logoStorageId } : {}),
      });

      toast.success("Restaurant profile updated successfully!");
      setIsEditingProfile(false);
    } catch (err) {
      if (err instanceof ConvexError) toast.error(err.data.message);
      else toast.error("Failed to update restaurant profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const result = await seedDatabase();
      toast.success(result.message);
    } catch (e) {
      if (e instanceof ConvexError) toast.error(e.data.message);
      else toast.error("Failed to seed database");
    } finally {
      setSeeding(false);
    }
  };

  if (analytics === undefined || activeSessions === undefined || restaurant === undefined) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  const newOrders = activeOrders?.filter((o) => o.status === "placed") ?? [];

  return (
    <div className="p-6 space-y-6">
      {/* Restaurant Header & Profile Card */}
      {restaurant && (
        <Card className="border-primary/20 bg-card/60 backdrop-blur">
          <CardContent className="p-5">
            {!isEditingProfile ? (
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  {restaurant.logoUrl ? (
                    <img
                      src={restaurant.logoUrl}
                      alt={restaurant.name}
                      className="size-14 rounded-xl object-cover border"
                    />
                  ) : (
                    <div className="bg-primary/10 rounded-xl p-3 flex items-center justify-center size-14">
                      <Store className="size-7 text-primary" />
                    </div>
                  )}
                  <div>
                    <h1 className="text-2xl font-bold">{restaurant.name}</h1>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1 flex-wrap">
                      {restaurant.address && (
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3.5" />
                          {restaurant.address}
                        </span>
                      )}
                      {restaurant.contactNumber && (
                        <span className="flex items-center gap-1">
                          <Phone className="size-3.5" />
                          {restaurant.contactNumber}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={startEditProfile} className="gap-1.5">
                    <Edit2 className="size-3.5" />
                    Edit Profile
                  </Button>
                  {tables !== undefined && tables.length === 0 && (
                    <Button
                      onClick={handleSeed}
                      disabled={seeding}
                      variant="secondary"
                      size="sm"
                      className="gap-2"
                    >
                      <Database className="size-4" />
                      {seeding ? "Seeding..." : "Load Demo Data"}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Edit Restaurant Profile & Branding</h3>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditingProfile(false)}
                      disabled={savingProfile}
                    >
                      <X className="size-4 mr-1" />
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={savingProfile}>
                      <Check className="size-4 mr-1" />
                      {savingProfile ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Restaurant Name *
                    </label>
                    <Input
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Restaurant Name"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Address</label>
                    <Input
                      value={editAddress}
                      onChange={(e) => setEditAddress(e.target.value)}
                      placeholder="Address"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Contact Phone
                    </label>
                    <Input
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="Phone number"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Update Restaurant Logo
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="text-xs file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:bg-muted file:text-foreground hover:file:bg-muted/80 cursor-pointer"
                    />
                    <span className="text-[11px] text-muted-foreground">
                      PNG, JPG, or WebP up to 5MB. Appears in customer view and reports.
                    </span>
                  </div>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tax & Service Charges Configuration for Owners */}
      <TaxAndChargesSection />

      {/* Today stats */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Today
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard
            title="Customers"
            value={String(analytics.totalCustomers)}
            icon={Users}
            sub="from new sessions"
          />
          <StatCard
            title="Orders"
            value={String(analytics.totalOrders)}
            icon={ShoppingBag}
            sub={`${analytics.cancelledOrders} cancelled`}
          />
          <StatCard title="Revenue" value={formatINR(analytics.totalRevenue)} icon={DollarSign} />
          <StatCard title="Active Tables" value={String(analytics.activeTables)} icon={Table2} />
          <StatCard
            title="New Orders"
            value={String(newOrders.length)}
            icon={TrendingUp}
            sub="awaiting acceptance"
          />
          <StatCard
            title="Cancelled"
            value={String(analytics.cancelledOrders)}
            icon={XCircle}
            sub="today"
          />
        </div>
      </div>

      {/* 7-day stats */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Last 7 Days
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard
            title="Customers"
            value={String(analytics7?.totalCustomers ?? 0)}
            icon={Users}
          />
          <StatCard title="Orders" value={String(analytics7?.totalOrders ?? 0)} icon={ShoppingBag} />
          <StatCard
            title="Revenue"
            value={formatINR(analytics7?.totalRevenue ?? 0)}
            icon={DollarSign}
          />
        </div>
      </div>

      {/* Active tables */}
      {activeSessions && activeSessions.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Active Tables
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {activeSessions.map(({ session, table, bill }) => (
              <Card key={session._id} className="text-center p-4">
                <p className="text-xl font-bold text-primary">{table?.tableNumber ?? "?"}</p>
                <p className="text-xs text-muted-foreground">{table?.name}</p>
                <p className="text-xs mt-1">{session.peopleCount} guests</p>
                {bill && (
                  <p className="text-xs font-semibold mt-1">{formatINR(bill.totalAmount)}</p>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Top items */}
      {analytics.top5Items.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Top Items Today
          </h2>
          <Card>
            <CardContent className="p-0">
              {analytics.top5Items.map((item, idx) => (
                <div
                  key={item.name}
                  className={`flex items-center justify-between px-4 py-3 ${
                    idx !== 0 ? "border-t" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground text-sm w-5">#{idx + 1}</span>
                    <span className="text-sm font-medium">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{item.count} sold</p>
                    <p className="text-xs text-muted-foreground">{formatINR(item.revenue)}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
