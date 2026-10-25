import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import {
  Users,
  UserPlus,
  ShieldCheck,
  ShieldAlert,
  Ban,
  Clock,
  Mail,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty.tsx";

export default function StaffManagementPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const staffList = useQuery(api.staff.listStaff);
  const invitations = useQuery(api.staff.listInvitations);

  const createStaffDirect = useMutation(api.staff.createStaffDirect);
  const revokeInvitation = useMutation(api.staff.revokeInvitation);
  const setUserActiveStatus = useMutation(api.staff.setUserActiveStatus);
  const updateStaffRole = useMutation(api.staff.updateStaffRole);

  // Add Staff modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    email: "",
    role: "staff" as "manager" | "staff",
    temporaryPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [submittingAdd, setSubmittingAdd] = useState(false);

  // Confirmation state for deactivation
  const [deactivateTarget, setDeactivateTarget] = useState<{
    userId: Id<"users">;
    name: string;
    currentActive: boolean;
  } | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Non-owner view
  if (currentUser && currentUser.role !== "owner") {
    return (
      <div className="p-8 text-center space-y-4 max-w-md mx-auto">
        <ShieldAlert className="size-12 text-destructive mx-auto" />
        <h1 className="text-xl font-bold">Access Denied</h1>
        <p className="text-muted-foreground text-sm">
          Only restaurant owners have permission to manage staff accounts.
        </p>
      </div>
    );
  }

  const handleAddStaff = async () => {
    const name = addForm.name.trim();
    const email = addForm.email.trim().toLowerCase();
    const password = addForm.temporaryPassword.trim();

    if (!name || !email || !password) {
      toast.error("All fields are required.");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }

    setSubmittingAdd(true);
    try {
      await createStaffDirect({
        name,
        email,
        role: addForm.role,
        temporaryPassword: password,
      });

      toast.success(
        `Account created for ${name}. Share their temporary password securely and ask them to change it after first login.`,
        { duration: 6000 }
      );
      setAddForm({ name: "", email: "", role: "staff", temporaryPassword: "" });
      setShowAddModal(false);
    } catch (e) {
      if (e instanceof ConvexError) {
        toast.error((e.data as { message?: string }).message ?? "Failed to create account.");
      } else {
        toast.error("Failed to create account. Please try again.");
      }
    } finally {
      setSubmittingAdd(false);
    }
  };

  const handleToggleActive = async () => {
    if (!deactivateTarget) return;
    setUpdatingStatus(true);
    try {
      await setUserActiveStatus({
        userId: deactivateTarget.userId,
        isActive: !deactivateTarget.currentActive,
      });
      toast.success(
        deactivateTarget.currentActive
          ? `${deactivateTarget.name} has been deactivated.`
          : `${deactivateTarget.name} has been reactivated.`
      );
      setDeactivateTarget(null);
    } catch (e) {
      if (e instanceof ConvexError) {
        toast.error((e.data as { message?: string }).message ?? "Failed to update status.");
      } else {
        toast.error("Failed to update user status.");
      }
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleRoleChange = async (userId: Id<"users">, newRole: "manager" | "staff") => {
    try {
      await updateStaffRole({ userId, role: newRole });
      toast.success("Role updated successfully.");
    } catch (e) {
      if (e instanceof ConvexError) {
        toast.error((e.data as { message?: string }).message ?? "Failed to update role.");
      } else {
        toast.error("Failed to update role.");
      }
    }
  };

  const handleRevoke = async (invitationId: Id<"staff_invitations">) => {
    try {
      await revokeInvitation({ invitationId });
      toast.success("Invitation revoked.");
    } catch (e) {
      if (e instanceof ConvexError) {
        toast.error((e.data as { message?: string }).message ?? "Failed to revoke invitation.");
      } else {
        toast.error("Failed to revoke invitation.");
      }
    }
  };

  const roleBadgeColor = (role: string) => {
    if (role === "owner")
      return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
    if (role === "manager")
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300";
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="size-6 text-primary" />
            Staff Management
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Create and manage your team members' accounts and roles.
          </p>
        </div>

        <Button
          onClick={() => {
            setShowAddModal(true);
          }}
          className="gap-2"
        >
          <UserPlus className="size-4" />
          Add Staff Member
        </Button>
      </div>

      {/* Team Roster */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Team Members
        </h2>

        {staffList === undefined ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : staffList.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><Users /></EmptyMedia>
              <EmptyTitle>No team members found</EmptyTitle>
              <EmptyDescription>Add your first staff member to get started.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid gap-3">
            {staffList.map((member) => {
              const isCurrentUser = member._id === currentUser?._id;
              const isOwner = member.role === "owner";

              return (
                <Card
                  key={member._id}
                  className={`transition-all ${!member.isActive ? "opacity-60 bg-muted/30" : ""}`}
                >
                  <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-base">{member.name}</span>
                        {isCurrentUser && (
                          <span className="text-[10px] bg-primary/10 text-primary font-medium px-2 py-0.5 rounded-full">
                            You
                          </span>
                        )}
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-semibold uppercase ${roleBadgeColor(
                            member.role
                          )}`}
                        >
                          {member.role}
                        </span>
                        {!member.isActive && (
                          <span className="text-xs bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 font-medium px-2 py-0.5 rounded-full">
                            Deactivated
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Mail className="size-3.5" />
                        {member.email}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
                      {!isOwner && (
                        <>
                          {/* Role Switcher */}
                          <select
                            value={member.role}
                            disabled={!member.isActive}
                            onChange={(e) =>
                              void handleRoleChange(
                                member._id,
                                e.target.value as "manager" | "staff"
                              )
                            }
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                          >
                            <option value="staff">Staff</option>
                            <option value="manager">Manager</option>
                          </select>

                          {/* Deactivate/Reactivate */}
                          <Button
                            size="sm"
                            variant={member.isActive ? "destructive" : "secondary"}
                            className="text-xs h-8"
                            onClick={() =>
                              setDeactivateTarget({
                                userId: member._id,
                                name: member.name,
                                currentActive: member.isActive,
                              })
                            }
                          >
                            {member.isActive ? "Deactivate" : "Reactivate"}
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Invitations (legacy/audit-only) — read-only unless pending can be revoked */}
      {invitations && invitations.length > 0 && (
        <div className="space-y-3 pt-4 border-t">
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Legacy Invitations
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              These are old invitation links. New staff are added directly via the "Add Staff Member" button above.
            </p>
          </div>

          <div className="divide-y rounded-xl border bg-card overflow-hidden">
            {invitations.map((inv) => {
              const isPending = inv.status === "pending" && !inv.isExpired;

              return (
                <div
                  key={inv._id}
                  className="p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{inv.name}</span>
                      <span className="text-xs text-muted-foreground">({inv.email})</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${roleBadgeColor(
                          inv.role
                        )}`}
                      >
                        {inv.role}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <span>Created {new Date(inv.createdAt).toLocaleDateString()}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {inv.status === "redeemed"
                          ? `Redeemed ${inv.redeemedAt ? new Date(inv.redeemedAt).toLocaleDateString() : ""}`
                          : inv.isExpired
                          ? "Expired"
                          : `Expires ${new Date(inv.expiresAt).toLocaleDateString()}`}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        inv.status === "redeemed"
                          ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                          : inv.status === "revoked"
                          ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          : inv.isExpired
                          ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300"
                          : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                      }`}
                    >
                      {inv.isExpired && inv.status === "pending"
                        ? "EXPIRED"
                        : inv.status.toUpperCase()}
                    </span>

                    {isPending && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-destructive hover:bg-destructive/10"
                        onClick={() => void handleRevoke(inv._id)}
                      >
                        <Ban className="size-3.5 mr-1" />
                        Revoke
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Staff Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-5 text-primary" />
              Add Staff Member
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">
                Full Name
              </label>
              <Input
                placeholder="e.g. Ramesh Kumar"
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">
                Email Address
              </label>
              <Input
                type="email"
                placeholder="ramesh@restaurant.com"
                value={addForm.email}
                onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">
                Assigned Role
              </label>
              <select
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                value={addForm.role}
                onChange={(e) =>
                  setAddForm((f) => ({
                    ...f,
                    role: e.target.value as "manager" | "staff",
                  }))
                }
              >
                <option value="staff">Staff (Orders, Waiter Requests)</option>
                <option value="manager">Manager (Billing &amp; Payments + Staff ops)</option>
              </select>
              <p className="text-[11px] text-muted-foreground">
                {addForm.role === "manager"
                  ? "Managers can record payments, close sessions, and manage orders."
                  : "Staff can view and fulfill orders, but cannot record payments or close sessions."}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">
                Temporary Password
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Min. 8 characters"
                  value={addForm.temporaryPassword}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, temporaryPassword: e.target.value }))
                  }
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Share this password securely (e.g. in person or via a one-time secure channel).
                Ask the staff member to change it after first sign-in.
              </p>
            </div>

            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3">
              <div className="flex items-start gap-2">
                <ShieldCheck className="size-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  The account is created immediately and ready to use. Share the email and password
                  securely. Passwords are stored hashed — they cannot be recovered after creation.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setShowAddModal(false);
                setAddForm({ name: "", email: "", role: "staff", temporaryPassword: "" });
              }}
              disabled={submittingAdd}
            >
              Cancel
            </Button>
            <Button onClick={handleAddStaff} disabled={submittingAdd}>
              {submittingAdd ? "Creating Account..." : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate / Reactivate Confirmation */}
      <Dialog
        open={!!deactivateTarget}
        onOpenChange={(open) => !open && setDeactivateTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deactivateTarget?.currentActive
                ? `Deactivate ${deactivateTarget?.name}?`
                : `Reactivate ${deactivateTarget?.name}?`}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {deactivateTarget?.currentActive
              ? "Deactivated accounts immediately lose all access to the management dashboard. Any active sessions will be rejected."
              : "Reactivating will restore this user's ability to sign in and perform their assigned role tasks."}
          </p>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setDeactivateTarget(null)}
              disabled={updatingStatus}
            >
              Cancel
            </Button>
            <Button
              variant={deactivateTarget?.currentActive ? "destructive" : "default"}
              onClick={handleToggleActive}
              disabled={updatingStatus}
            >
              {updatingStatus
                ? "Updating..."
                : deactivateTarget?.currentActive
                ? "Deactivate Account"
                : "Reactivate Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
