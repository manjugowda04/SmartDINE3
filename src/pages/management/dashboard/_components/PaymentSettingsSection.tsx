import { useState, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { QrCode, Upload, Trash2, Check, X, Eye, Wallet, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { getSafeErrorMessage } from "@/lib/restaurant.ts";

// ── UPI ID regex: handle@bank (e.g. 6787677877@ybl, spicegarden@okhdfcbank) ─────
const UPI_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}$/;

export function PaymentSettingsSection() {
  const restaurant = useQuery(api.restaurants.getCurrentRestaurant);
  const currentUser = useQuery(api.users.getCurrentUser);
  const generateUploadUrl = useMutation(api.restaurants.generateUploadUrl);
  const updatePaymentSettings = useMutation(api.restaurants.updatePaymentSettings);

  const [editing, setEditing] = useState(false);
  const [upiIdInput, setUpiIdInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pendingQrPreviewUrl, setPendingQrPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removingQr, setRemovingQr] = useState(false);
  const [showCustomerPreview, setShowCustomerPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isStaff = currentUser?.role === "staff";

  const startEditing = () => {
    if (isStaff) {
      toast.error("Manager or Owner privileges required to edit UPI settings.");
      return;
    }
    setUpiIdInput(restaurant?.upiId ?? "");
    setSelectedFile(null);
    setPendingQrPreviewUrl(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setSelectedFile(null);
    if (pendingQrPreviewUrl) {
      URL.revokeObjectURL(pendingQrPreviewUrl);
      setPendingQrPreviewUrl(null);
    }
  };

  const handleQrFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("QR image must be under 5 MB");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file (PNG, JPG, or WebP)");
      return;
    }

    setSelectedFile(file);
    if (pendingQrPreviewUrl) URL.revokeObjectURL(pendingQrPreviewUrl);
    setPendingQrPreviewUrl(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    const trimmed = upiIdInput.trim();
    if (trimmed && !UPI_REGEX.test(trimmed)) {
      toast.error("Invalid UPI ID format. Expected format: handle@bank (e.g. 6787677877@ybl)");
      return;
    }

    setSaving(true);
    try {
      let qrStorageId: Id<"_storage"> | undefined = undefined;

      // 1. If a new QR image was selected, upload it first
      if (selectedFile) {
        setUploading(true);
        try {
          const uploadUrl = await generateUploadUrl();
          const uploadResult = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": selectedFile.type },
            body: selectedFile,
          });

          if (!uploadResult.ok) {
            throw new Error(`QR image upload failed (HTTP ${uploadResult.status})`);
          }

          const uploadData = await uploadResult.json();
          if (!uploadData?.storageId) {
            throw new Error("Server did not return a valid storage ID for the uploaded QR image.");
          }
          qrStorageId = uploadData.storageId as Id<"_storage">;
        } finally {
          setUploading(false);
        }
      }

      // 2. Call updatePaymentSettings with UPI ID and optional storage ID
      await updatePaymentSettings({
        upiId: trimmed || undefined,
        ...(qrStorageId ? { upiQrStorageId: qrStorageId } : {}),
      });

      toast.success("Payment settings saved!");
      setEditing(false);
      setSelectedFile(null);
      if (pendingQrPreviewUrl) {
        URL.revokeObjectURL(pendingQrPreviewUrl);
        setPendingQrPreviewUrl(null);
      }
    } catch (err: unknown) {
      console.error("Failed to save payment settings:", err);
      const message = getSafeErrorMessage(err, "Failed to save payment settings");
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveQr = async () => {
    if (!restaurant?.upiQrUrl) return;
    setRemovingQr(true);
    try {
      await updatePaymentSettings({ removeQrImage: true });
      toast.success("QR image removed");
      setSelectedFile(null);
      if (pendingQrPreviewUrl) {
        URL.revokeObjectURL(pendingQrPreviewUrl);
        setPendingQrPreviewUrl(null);
      }
    } catch (err: unknown) {
      console.error("Failed to remove QR image:", err);
      const message = getSafeErrorMessage(err, "Failed to remove QR image");
      toast.error(message);
    } finally {
      setRemovingQr(false);
    }
  };

  if (restaurant === undefined) return null;
  if (restaurant === null) return null;

  const currentQrUrl = pendingQrPreviewUrl ?? restaurant.upiQrUrl ?? null;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="size-4 text-primary" />
            UPI Payment Settings
          </CardTitle>
          {isStaff && (
            <span className="text-[11px] flex items-center gap-1 font-medium bg-zinc-800 text-zinc-300 px-2.5 py-0.5 rounded-full border border-zinc-700">
              <ShieldAlert className="size-3 text-yellow-500" />
              Staff View Only
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Configure your restaurant UPI ID and QR code so customers can pay bills directly via UPI apps.
          Only Owners and Managers can edit this.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {!editing ? (
          /* ── Read-only view ── */
          <div className="space-y-4">
            <div className="flex flex-wrap gap-6 items-start">
              {/* QR Preview */}
              <div className="flex flex-col items-center gap-2">
                <div className="size-28 rounded-xl border border-dashed border-primary/30 flex items-center justify-center bg-primary/5 overflow-hidden">
                  {restaurant.upiQrUrl ? (
                    <img
                      src={restaurant.upiQrUrl}
                      alt="UPI QR Code"
                      className="size-full object-contain p-1"
                    />
                  ) : (
                    <QrCode className="size-10 text-muted-foreground/40" />
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {restaurant.upiQrUrl ? "UPI QR Code" : "No QR uploaded"}
                </p>
              </div>

              {/* UPI ID */}
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">UPI ID</p>
                {restaurant.upiId ? (
                  <p className="font-mono text-sm font-bold text-foreground break-all">
                    {restaurant.upiId}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Not configured</p>
                )}
                {restaurant.upiId && (
                  <p className="text-[11px] text-muted-foreground">
                    Customers can open their UPI app, scan the QR, or enter this ID to pay.
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={startEditing}
                disabled={isStaff}
                className="gap-1.5"
                title={isStaff ? "Owner or Manager privileges required" : undefined}
              >
                <QrCode className="size-3.5" />
                {restaurant.upiId || restaurant.upiQrUrl ? "Edit Payment Settings" : "Set Up UPI Payment"}
              </Button>

              {(restaurant.upiId || restaurant.upiQrUrl) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCustomerPreview((v) => !v)}
                  className="gap-1.5 text-muted-foreground"
                >
                  <Eye className="size-3.5" />
                  {showCustomerPreview ? "Hide Preview" : "Customer Preview"}
                </Button>
              )}
            </div>

            {/* Customer Preview */}
            {showCustomerPreview && (restaurant.upiId || restaurant.upiQrUrl) && (
              <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4 space-y-3">
                <p className="text-xs font-bold text-primary uppercase tracking-wider">
                  Customer view preview
                </p>
                <div className="bg-[#16161a] border border-[#27272b] rounded-xl p-4 space-y-3 max-w-sm">
                  <div className="flex items-center gap-2">
                    <QrCode className="size-4 text-orange-400" />
                    <p className="font-bold text-sm text-white">Pay via UPI</p>
                  </div>
                  {restaurant.upiQrUrl && (
                    <div className="flex justify-center">
                      <img
                        src={restaurant.upiQrUrl}
                        alt="UPI QR"
                        className="size-36 object-contain rounded-lg border border-[#27272b] bg-white p-1"
                      />
                    </div>
                  )}
                  {restaurant.upiId && (
                    <div className="bg-[#1e1e24] rounded-lg p-3 space-y-1">
                      <p className="text-xs text-zinc-400">UPI ID</p>
                      <p className="font-mono text-sm font-bold text-white">{restaurant.upiId}</p>
                    </div>
                  )}
                  <Button size="sm" className="w-full bg-orange-500 hover:bg-orange-600 text-white text-xs">
                    Open UPI App
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ── Edit form ── */
          <div className="space-y-4">
            {/* UPI ID Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                UPI ID (e.g. 6787677877@ybl, yourrestaurant@upi)
              </label>
              <Input
                value={upiIdInput}
                onChange={(e) => setUpiIdInput(e.target.value)}
                placeholder="6787677877@ybl"
                className={
                  upiIdInput && !UPI_REGEX.test(upiIdInput.trim())
                    ? "border-red-500 focus:border-red-500"
                    : ""
                }
              />
              {upiIdInput && !UPI_REGEX.test(upiIdInput.trim()) && (
                <p className="text-xs text-red-500">
                  Invalid format. Use: handle@bank (e.g. 6787677877@ybl)
                </p>
              )}
            </div>

            {/* QR Upload */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                UPI QR Code Image
              </label>

              <div className="flex flex-wrap items-start gap-4">
                {/* Current / pending QR preview */}
                <div className="size-28 rounded-xl border border-dashed border-primary/30 flex items-center justify-center bg-primary/5 overflow-hidden">
                  {currentQrUrl ? (
                    <img
                      src={currentQrUrl}
                      alt="QR Preview"
                      className="size-full object-contain p-1"
                    />
                  ) : (
                    <QrCode className="size-10 text-muted-foreground/40" />
                  )}
                </div>

                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={saving || uploading}
                      onClick={() => fileInputRef.current?.click()}
                      className="gap-1.5"
                    >
                      <Upload className="size-3.5" />
                      {selectedFile ? "Change Selected Image" : currentQrUrl ? "Replace QR Image" : "Select QR Image"}
                    </Button>

                    {restaurant.upiQrUrl && !selectedFile && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={removingQr || saving}
                        onClick={handleRemoveQr}
                        className="gap-1.5 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                        {removingQr ? "Removing…" : "Remove QR"}
                      </Button>
                    )}
                  </div>

                  {selectedFile ? (
                    <p className="text-xs text-green-500 font-medium">
                      Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB) — will upload on Save
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      PNG, JPG, or WebP up to 5 MB. Image is uploaded when you click "Save Payment Settings".
                    </p>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleQrFileChange}
                  />
                </div>
              </div>
            </div>

            {/* Save / Cancel */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={cancelEditing}
                disabled={saving || uploading}
              >
                <X className="size-4 mr-1" />
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={saving || uploading}
              >
                <Check className="size-4 mr-1" />
                {saving ? "Saving…" : uploading ? "Uploading QR…" : "Save Payment Settings"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
