import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { formatINR } from "@/lib/restaurant.ts";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { Plus, QrCode, RefreshCw, Table2, CheckCircle } from "lucide-react";
import QRCode from "qrcode";

function QRDisplay({ token, tableNumber }: { token: string; tableNumber: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const url = `${window.location.origin}/table/${token}`;

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, url, { width: 200, margin: 2 });
    }
  }, [url]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `table-${tableNumber}-qr.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas ref={canvasRef} />
      <p className="text-xs text-muted-foreground text-center break-all px-4">{url}</p>
      <Button size="sm" onClick={handleDownload} variant="secondary">Download QR</Button>
    </div>
  );
}

export default function TablesPage() {
  const tables = useQuery(api.tables.listTables, {});
  const activeSessions = useQuery(api.sessions.listActiveSessions, {});
  const createTable = useMutation(api.tables.createTable);
  const updateTable = useMutation(api.tables.updateTable);
  const regenToken = useMutation(api.tables.regenerateTableToken);

  const [showCreate, setShowCreate] = useState(false);
  const [qrTable, setQrTable] = useState<{ tableNumber: number; token: string } | null>(null);
  const [form, setForm] = useState({ tableNumber: "", name: "", capacity: "" });
  const [creating, setCreating] = useState(false);

  const sessionByTable: Record<string, { session: { _id: string; sessionNumber: string; peopleCount: number }; table: { _id: string; tableNumber?: number; name?: string } | null; bill: { totalAmount: number } | null }> = {};
  activeSessions?.forEach((s) => {
    if (s.table) sessionByTable[s.table._id] = s;
  });

  const handleCreate = async () => {
    if (!form.tableNumber || !form.name) {
      toast.error("Table number and name are required");
      return;
    }
    setCreating(true);
    try {
      await createTable({
        tableNumber: Number(form.tableNumber),
        name: form.name,
        capacity: form.capacity ? Number(form.capacity) : undefined,
      });
      toast.success(`${form.name} created!`);
      setShowCreate(false);
      setForm({ tableNumber: "", name: "", capacity: "" });
    } catch (e) {
      if (e instanceof ConvexError) toast.error(e.data.message);
      else toast.error("Failed to create table");
    } finally {
      setCreating(false);
    }
  };

  const handleRegenQR = async (tableId: Id<"restaurant_tables">, tableNumber: number) => {
    try {
      const newToken = await regenToken({ tableId });
      toast.success("QR code regenerated");
      setQrTable({ tableNumber, token: newToken });
    } catch (e) {
      if (e instanceof ConvexError) toast.error(e.data.message);
      else toast.error("Failed to regenerate QR");
    }
  };

  const statusColor = (status: string) => {
    if (status === "available") return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    if (status === "occupied") return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tables</h1>
        <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1">
          <Plus className="size-4" /> Add Table
        </Button>
      </div>

      {tables === undefined ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {tables.map((table) => {
            const session = sessionByTable[table._id];
            return (
              <Card key={table._id} className={!table.isActive ? "opacity-50" : ""}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-2xl font-bold text-primary">{table.tableNumber}</p>
                      <p className="text-sm font-medium">{table.name}</p>
                      {table.capacity && <p className="text-xs text-muted-foreground">Capacity: {table.capacity}</p>}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor(table.status)}`}>
                      {table.status.replace("_", " ").toUpperCase()}
                    </span>
                  </div>

                  {session && (
                    <div className="text-xs bg-muted rounded-lg p-2 space-y-1">
                      <p className="font-medium">{session.session.sessionNumber}</p>
                      <p className="text-muted-foreground">{session.session.peopleCount} guests</p>
                      {session.bill && (
                        <p className="font-semibold">{formatINR(session.bill.totalAmount)}</p>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex-1 text-xs gap-1"
                      onClick={() => setQrTable({ tableNumber: table.tableNumber, token: table.token })}
                    >
                      <QrCode className="size-3" /> QR
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex-1 text-xs gap-1"
                      onClick={() => handleRegenQR(table._id, table.tableNumber)}
                      disabled={table.status !== "available"}
                      title={table.status !== "available" ? "Cannot regenerate while occupied" : "Regenerate QR"}
                    >
                      <RefreshCw className="size-3" /> Regen
                    </Button>
                  </div>

                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full text-xs"
                    onClick={() => updateTable({ tableId: table._id, isActive: !table.isActive })}
                  >
                    {table.isActive ? "Deactivate" : "Activate"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create table dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Table</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Table Number (e.g. 11)"
              type="number"
              value={form.tableNumber}
              onChange={(e) => setForm((f) => ({ ...f, tableNumber: e.target.value }))}
            />
            <Input
              placeholder="Table Name (e.g. Table 11)"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Input
              placeholder="Capacity (optional)"
              type="number"
              value={form.capacity}
              onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Creating..." : "Create Table"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR dialog */}
      <Dialog open={!!qrTable} onOpenChange={(open) => !open && setQrTable(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="size-5" /> Table {qrTable?.tableNumber} QR Code
            </DialogTitle>
          </DialogHeader>
          {qrTable && <QRDisplay token={qrTable.token} tableNumber={qrTable.tableNumber} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
