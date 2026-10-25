import { useState, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { formatINR } from "@/lib/restaurant.ts";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { Receipt, Percent, Info, Check, HelpCircle } from "lucide-react";
import { calculateBillCharges } from "@/convex/billingCalculations.js";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";

interface TaxFormProps {
  restaurant: Doc<"restaurants">;
}

function TaxForm({ restaurant }: TaxFormProps) {
  const updateSettings = useMutation(api.restaurants.updateTaxAndServiceCharges);

  const [gstEnabled, setGstEnabled] = useState(!!restaurant.gstEnabled);
  const [gstPercentage, setGstPercentage] = useState(
    restaurant.gstPercentage !== undefined ? String(restaurant.gstPercentage) : "5"
  );
  const [serviceChargeEnabled, setServiceChargeEnabled] = useState(!!restaurant.serviceChargeEnabled);
  const [serviceChargePercentage, setServiceChargePercentage] = useState(
    restaurant.serviceChargePercentage !== undefined ? String(restaurant.serviceChargePercentage) : "5"
  );
  const [serviceChargeBasis, setServiceChargeBasis] = useState<"subtotal" | "subtotal_with_gst">(
    restaurant.serviceChargeBasis || "subtotal"
  );
  const [sampleSubtotalRupees, setSampleSubtotalRupees] = useState("1000");
  const [saving, setSaving] = useState(false);

  // Compute live preview based on current form inputs
  const preview = useMemo(() => {
    const subtotalPaise = Math.max(0, Math.round((parseFloat(sampleSubtotalRupees) || 0) * 100));
    const gstRate = parseFloat(gstPercentage) || 0;
    const serviceRate = parseFloat(serviceChargePercentage) || 0;

    return calculateBillCharges(subtotalPaise, {
      gstEnabled,
      gstPercentage: gstRate,
      serviceChargeEnabled,
      serviceChargePercentage: serviceRate,
      serviceChargeBasis,
    });
  }, [sampleSubtotalRupees, gstEnabled, gstPercentage, serviceChargeEnabled, serviceChargePercentage, serviceChargeBasis]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsedGst = parseFloat(gstPercentage);
    if (gstEnabled && (isNaN(parsedGst) || parsedGst < 0 || parsedGst > 100)) {
      toast.error("GST rate must be between 0% and 100%");
      return;
    }

    const parsedService = parseFloat(serviceChargePercentage);
    if (serviceChargeEnabled && (isNaN(parsedService) || parsedService < 0 || parsedService > 100)) {
      toast.error("Service charge rate must be between 0% and 100%");
      return;
    }

    setSaving(true);
    try {
      await updateSettings({
        gstEnabled,
        gstPercentage: isNaN(parsedGst) ? 0 : parsedGst,
        serviceChargeEnabled,
        serviceChargePercentage: isNaN(parsedService) ? 0 : parsedService,
        serviceChargeBasis,
      });
      toast.success("Tax & Service Charge settings saved successfully!");
    } catch (err) {
      if (err instanceof ConvexError) toast.error(err.data.message);
      else toast.error("Failed to save tax settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        {/* Left: Configuration Inputs */}
        <div className="space-y-5">
          {/* GST Configuration */}
          <div className="rounded-xl border p-4 space-y-3 bg-muted/20">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-sm">Goods and Services Tax (GST)</span>
                <p className="text-xs text-muted-foreground">
                  Enable statutory GST calculation on orders
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={gstEnabled}
                  onChange={(e) => setGstEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            {gstEnabled && (
              <div className="pt-2 border-t space-y-1.5">
                <label className="text-xs font-medium text-foreground flex items-center justify-between">
                  <span>GST Percentage Rate</span>
                  <span className="text-[11px] text-muted-foreground">Typically 5% for food service</span>
                </label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={gstPercentage}
                    onChange={(e) => setGstPercentage(e.target.value)}
                    placeholder="e.g. 5"
                    required={gstEnabled}
                    className="pr-8 text-sm"
                  />
                  <Percent className="size-3.5 absolute right-3 top-3 text-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          {/* Service Charge Configuration */}
          <div className="rounded-xl border p-4 space-y-3 bg-muted/20">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-sm">Service Charge</span>
                <p className="text-xs text-muted-foreground">
                  Optional hospitality service charge for the restaurant
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={serviceChargeEnabled}
                  onChange={(e) => setServiceChargeEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            {serviceChargeEnabled && (
              <div className="pt-2 border-t space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">
                    Service Charge Rate (%)
                  </label>
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={serviceChargePercentage}
                      onChange={(e) => setServiceChargePercentage(e.target.value)}
                      placeholder="e.g. 10"
                      required={serviceChargeEnabled}
                      className="pr-8 text-sm"
                    />
                    <Percent className="size-3.5 absolute right-3 top-3 text-muted-foreground" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground flex items-center gap-1">
                    <span>Calculation Basis</span>
                    <HelpCircle className="size-3 text-muted-foreground" />
                  </label>
                  <div className="grid grid-cols-1 gap-2 text-xs">
                    <label className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      serviceChargeBasis === "subtotal" ? "border-primary bg-primary/5 font-medium" : "bg-card"
                    }`}>
                      <input
                        type="radio"
                        name="scBasis"
                        value="subtotal"
                        checked={serviceChargeBasis === "subtotal"}
                        onChange={() => setServiceChargeBasis("subtotal")}
                        className="text-primary"
                      />
                      <span>Calculate on food subtotal before GST (Standard)</span>
                    </label>
                    <label className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      serviceChargeBasis === "subtotal_with_gst" ? "border-primary bg-primary/5 font-medium" : "bg-card"
                    }`}>
                      <input
                        type="radio"
                        name="scBasis"
                        value="subtotal_with_gst"
                        checked={serviceChargeBasis === "subtotal_with_gst"}
                        onChange={() => setServiceChargeBasis("subtotal_with_gst")}
                        className="text-primary"
                      />
                      <span>Calculate on subtotal including GST</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Live Interactive Calculation Preview */}
        <div className="space-y-4">
          <div className="rounded-xl border p-4 bg-card shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="font-semibold text-sm">Live Bill Preview</h4>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Sample bill: ₹</span>
                <input
                  type="number"
                  min="1"
                  step="50"
                  value={sampleSubtotalRupees}
                  onChange={(e) => setSampleSubtotalRupees(e.target.value)}
                  className="w-16 h-6 px-1.5 border rounded text-right font-medium text-foreground bg-background text-xs"
                  title="Adjust sample subtotal"
                />
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Food Subtotal</span>
                <span className="font-medium">{formatINR(preview.subtotal)}</span>
              </div>

              {preview.serviceChargeEnabled && preview.serviceChargeAmount > 0 && (
                <div className="flex justify-between py-1 text-primary">
                  <span>
                    Service Charge ({preview.serviceChargePercentage}%)
                    <span className="text-[10px] block opacity-75">
                      {preview.serviceChargeBasis === "subtotal_with_gst" ? "(on subtotal + GST)" : "(on subtotal)"}
                    </span>
                  </span>
                  <span className="font-semibold">+{formatINR(preview.serviceChargeAmount)}</span>
                </div>
              )}

              {preview.gstEnabled && preview.gstAmount > 0 && (
                <div className="flex justify-between py-1 text-primary">
                  <span>GST ({preview.gstPercentage}%)</span>
                  <span className="font-semibold">+{formatINR(preview.gstAmount)}</span>
                </div>
              )}

              {!preview.gstEnabled && !preview.serviceChargeEnabled && (
                <p className="text-muted-foreground italic text-center py-1">
                  No tax or service charges enabled. Customer pays net subtotal.
                </p>
              )}

              <div className="flex justify-between border-t pt-2.5 font-bold text-sm text-foreground">
                <span>Final Payable Amount</span>
                <span className="text-primary text-base">{formatINR(preview.totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Compliance Note */}
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 p-3 flex gap-2.5 text-xs text-amber-800 dark:text-amber-300">
            <Info className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <p className="leading-relaxed">
              <strong>Statutory Notice:</strong> Tax and service charge regulations vary by jurisdiction. Restaurant owners are responsible for ensuring configured rates comply with applicable statutory rules, registration requirements, and local laws.
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={saving} className="gap-2 px-6">
          <Check className="size-4" />
          {saving ? "Saving Changes..." : "Save Tax & Service Settings"}
        </Button>
      </div>
    </form>
  );
}

export function TaxAndChargesSection() {
  const restaurant = useQuery(api.restaurants.getCurrentRestaurant);

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="bg-primary/10 p-2 rounded-lg text-primary">
            <Receipt className="size-5" />
          </div>
          <div>
            <CardTitle className="text-lg">Tax & Service Charges</CardTitle>
            <CardDescription className="text-xs">
              Configure GST tax rates and optional service charges applied to customer bills.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {restaurant === undefined ? (
          <div className="space-y-4">
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </div>
        ) : restaurant === null ? (
          <p className="text-sm text-muted-foreground">Restaurant not found.</p>
        ) : (
          <TaxForm key={restaurant._id} restaurant={restaurant} />
        )}
      </CardContent>
    </Card>
  );
}
