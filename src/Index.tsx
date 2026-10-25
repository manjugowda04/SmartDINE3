import { Link } from "react-router-dom";
import { UtensilsCrossed, QrCode } from "lucide-react";
import { motion } from "motion/react";

export default function Index() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="text-center space-y-8 max-w-lg"
      >
        <div className="flex justify-center">
          <div className="bg-primary rounded-2xl p-5 shadow-lg">
            <UtensilsCrossed className="size-12 text-primary-foreground" />
          </div>
        </div>
        <div className="space-y-3">
          <h1 className="text-5xl font-bold tracking-tight text-foreground" style={{ fontFamily: "var(--font-display)" }}>
            SmartDine
          </h1>
          <p className="text-xl text-muted-foreground">
            QR-Based Shared Table Ordering Platform
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="bg-card border rounded-xl p-5 text-left space-y-2">
          <QrCode className="size-6 text-primary" />
          <h3 className="font-semibold text-foreground">For Customers</h3>
          <p className="text-sm text-muted-foreground">Scan the QR code at your table to start ordering</p>
        </div>
        <Link to="/management" className="bg-card border rounded-xl p-5 text-left space-y-2 hover:border-primary/50 transition-colors cursor-pointer">
          <UtensilsCrossed className="size-6 text-primary" />
          <h3 className="font-semibold text-foreground">Management</h3>
          <p className="text-sm text-muted-foreground">Restaurant operations and admin dashboard</p>
        </Link>
        </div>

        <p className="text-xs text-muted-foreground">
          Scan a table QR code or{" "}
          <Link to="/management" className="text-primary hover:underline font-medium">
            sign in to management
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
