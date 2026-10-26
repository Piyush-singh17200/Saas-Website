"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Users,
  UserPlus,
  Mail,
  Shield,
  Search,
  Trash2,
  RefreshCw,
  XCircle,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Clock,
  ArrowLeft,
  ChevronRight,
} from "lucide-react";

import type {
  MembershipResponse,
  InvitationResponse,
  BillingSummaryResponse,
  MembershipRoleType,
} from "@workspace/contracts";
import { apiClient } from "../../../../lib/api-client";
import { Navbar } from "../../../../components/Navbar";
import { InviteMemberModal } from "../../../../components/InviteMemberModal";

export default function OrganizationMembersPage() {
  const params = useParams();
  const organizationId = params.organizationId as string;

  const [members, setMembers] = useState<MembershipResponse[]>([]);
  const [invitations, setInvitations] = useState<InvitationResponse[]>([]);
  const [billing, setBilling] = useState<BillingSummaryResponse | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] =
    useState<MembershipRoleType>("MEMBER");

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modals & Action States
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [confirmDeleteMember, setConfirmDeleteMember] =
    useState<MembershipResponse | null>(null);
  const [confirmRevokeInvite, setConfirmRevokeInvite] =
    useState<InvitationResponse | null>(null);
  const [copiedInviteUrl, setCopiedInviteUrl] = useState<string | null>(null);

  // Keyboard accessibility for confirmation dialogs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmDeleteMember) setConfirmDeleteMember(null);
        if (confirmRevokeInvite) setConfirmRevokeInvite(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmDeleteMember, confirmRevokeInvite]);

  const loadData = useCallback(async () => {
    if (!organizationId) return;
    try {
      setIsLoading(true);
      setError(null);

      // 1. Current user
      let myId: string | null = null;
      try {
        const me = await apiClient.getMe();
        myId = me.user.id;
        setCurrentUserId(me.user.id);
      } catch {
        // Fallback
      }

      // 2. Organization members
      const membersRes = await apiClient.getMembers(organizationId);
      setMembers(membersRes.members);

      // Determine current user's role
      if (myId) {
        const myMembership = membersRes.members.find((m) => m.userId === myId);
        if (myMembership) {
          setCurrentUserRole(myMembership.role);
        }
      }

      // 3. Billing summary (for seat limits)
      try {
        const billingRes = await apiClient.getBillingSummary(organizationId);
        setBilling(billingRes);
      } catch {
        // Non-blocking
      }

      // 4. Pending invitations (only accessible to OWNER / ADMIN)
      try {
        const invitesRes = await apiClient.getInvitations(organizationId);
        setInvitations(invitesRes.invitations);
      } catch {
        // Ignored if current user is MEMBER
        setInvitations([]);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load organization members",
      );
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Can manage members (OWNER or ADMIN)
  const canManage = currentUserRole === "OWNER" || currentUserRole === "ADMIN";
  const isOwner = currentUserRole === "OWNER";

  // Filter members by name, email, role, and status
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      if (roleFilter && m.role !== roleFilter) return false;
      if (statusFilter && m.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = m.user?.displayName?.toLowerCase().includes(q);
        const matchesEmail = m.user?.email?.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail) return false;
      }
      return true;
    });
  }, [members, searchQuery, roleFilter, statusFilter]);

  // Member role update
  const handleUpdateRole = async (
    targetUserId: string,
    newRole: "ADMIN" | "MEMBER",
  ) => {
    try {
      setActionLoadingId(targetUserId);
      setError(null);
      await apiClient.updateMemberRole(organizationId, targetUserId, newRole);
      setMembers((prev) =>
        prev.map((m) =>
          m.userId === targetUserId ? { ...m, role: newRole } : m,
        ),
      );
      setSuccessMessage("Member role updated successfully");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to update member role",
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  // Remove member
  const handleRemoveMember = async () => {
    if (!confirmDeleteMember) return;
    try {
      setActionLoadingId(confirmDeleteMember.userId);
      setError(null);
      await apiClient.removeMember(organizationId, confirmDeleteMember.userId);
      setMembers((prev) =>
        prev.filter((m) => m.userId !== confirmDeleteMember.userId),
      );
      setConfirmDeleteMember(null);
      setSuccessMessage("Member removed from organization");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setActionLoadingId(null);
    }
  };

  // Revoke invitation
  const handleRevokeInvitation = async () => {
    if (!confirmRevokeInvite) return;
    try {
      setActionLoadingId(confirmRevokeInvite.id);
      setError(null);
      await apiClient.revokeInvitation(organizationId, confirmRevokeInvite.id);
      setInvitations((prev) =>
        prev.filter((inv) => inv.id !== confirmRevokeInvite.id),
      );
      setConfirmRevokeInvite(null);
      setSuccessMessage("Invitation revoked");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to revoke invitation",
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  // Resend invitation
  const handleResendInvitation = async (invitationId: string) => {
    try {
      setActionLoadingId(invitationId);
      setError(null);
      const res = await apiClient.resendInvitation(
        organizationId,
        invitationId,
      );
      setInvitations((prev) =>
        prev.map((inv) => (inv.id === invitationId ? res.invitation : inv)),
      );

      if (res.invitation.token && typeof window !== "undefined") {
        const fullUrl = `${window.location.origin}/invitations/${res.invitation.token}`;
        setCopiedInviteUrl(fullUrl);
        setSuccessMessage("Invitation resent! Copied fresh link to view.");
      } else {
        setSuccessMessage("Invitation resent with renewed expiry");
      }
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to resend invitation",
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "OWNER":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <Shield className="w-3 h-3" />
            <span>Owner</span>
          </span>
        );
      case "ADMIN":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
            <Shield className="w-3 h-3" />
            <span>Admin</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700/60">
            <span>Member</span>
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar
        organizationId={organizationId}
        organizationName="Organization"
        activeTab="members"
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-4">
          <Link
            href={`/organizations/${organizationId}/projects`}
            className="hover:text-emerald-400 transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Projects</span>
          </Link>
          <ChevronRight className="w-3 h-3 text-slate-600" />
          <span className="text-slate-200 font-medium">Team Members</span>
        </div>

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <Users className="w-7 h-7 text-emerald-400" />
              <span>Team & Members</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Manage organization memberships, roles, and pending invitations.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {billing && (
              <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 flex items-center gap-2">
                <span className="text-slate-400">Seats:</span>
                <span className="font-semibold text-white">
                  {members.length} / {billing.limits.maxMembers}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 uppercase">
                  {billing.subscription.plan}
                </span>
              </div>
            )}

            {canManage && (
              <button
                type="button"
                onClick={() => setIsInviteModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold transition-colors shadow-lg shadow-emerald-500/20"
              >
                <UserPlus className="w-4 h-4" />
                <span>Invite Member</span>
              </button>
            )}
          </div>
        </div>

        {/* Feedback Alerts */}
        {error && (
          <div className="mt-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-xs font-semibold underline hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {successMessage && (
          <div className="mt-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {copiedInviteUrl && (
          <div className="mt-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>
                <strong>Invitation Link:</strong> Share directly with the
                recipient:{" "}
                <code className="text-white font-mono bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                  {copiedInviteUrl}
                </code>
              </span>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(copiedInviteUrl);
                setSuccessMessage("Invitation link copied to clipboard!");
                setTimeout(() => setSuccessMessage(null), 2500);
              }}
              className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold shrink-0"
            >
              Copy Link
            </button>
          </div>
        )}

        {/* Search & Filter Toolbar */}
        <div className="mt-6 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name or email..."
                className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            {/* Role Filter */}
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              aria-label="Filter by member role"
              className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-medium text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
            >
              <option value="">All Roles</option>
              <option value="OWNER">Owner</option>
              <option value="ADMIN">Admin</option>
              <option value="MEMBER">Member</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by membership status"
              className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-medium text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
            </select>

            {(searchQuery || roleFilter || statusFilter) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setRoleFilter("");
                  setStatusFilter("");
                }}
                className="text-xs text-slate-400 hover:text-white underline transition-colors px-1"
              >
                Clear filters
              </button>
            )}
          </div>

          <div className="text-xs text-slate-400 shrink-0">
            Showing{" "}
            <span className="font-semibold text-white">
              {filteredMembers.length}
            </span>{" "}
            of {members.length} members
          </div>
        </div>

        {/* Active Members Table */}
        <div className="mt-6 rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden shadow-xl">
          <div className="px-5 py-4 border-b border-slate-800/80 bg-slate-900/80 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <span>Active Members</span>
              <span className="px-2 py-0.5 rounded-full text-xs bg-slate-800 text-slate-300 font-normal">
                {members.length}
              </span>
            </h2>
          </div>

          {isLoading ? (
            <div className="p-12 flex flex-col items-center justify-center gap-3 text-slate-400 text-sm">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              <span>Loading team members...</span>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm space-y-3">
              <Users className="w-8 h-8 text-slate-600 mx-auto" />
              <p>
                {searchQuery || roleFilter || statusFilter
                  ? "No team members match your selected filters."
                  : "No members currently enrolled in this organization."}
              </p>
              {(searchQuery || roleFilter || statusFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setRoleFilter("");
                    setStatusFilter("");
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white transition-colors"
                >
                  Reset all filters
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <caption className="sr-only">
                  Organization Active Members List
                </caption>
                <thead className="bg-slate-950/40 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-3.5">User</th>
                    <th className="px-6 py-3.5">Role</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Joined</th>
                    {canManage && (
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredMembers.map((member) => {
                    const isSelf = member.userId === currentUserId;
                    const isMemberOwner = member.role === "OWNER";
                    const isOwnerCountOne =
                      members.filter((m) => m.role === "OWNER").length === 1;
                    const canDemoteOrRemove =
                      isOwner && !(isMemberOwner && isOwnerCountOne);
                    const canAdminRemove =
                      currentUserRole === "ADMIN" && member.role === "MEMBER";

                    return (
                      <tr
                        key={member.id}
                        className="hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700/80 flex items-center justify-center font-bold text-slate-300 text-sm uppercase">
                              {member.user?.displayName?.charAt(0) || "U"}
                            </div>
                            <div>
                              <div className="font-medium text-white flex items-center gap-2">
                                <span>
                                  {member.user?.displayName || "Anonymous User"}
                                </span>
                                {isSelf && (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                    You
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400">
                                {member.user?.email}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          {getRoleBadge(member.role)}
                        </td>

                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            <span>Active</span>
                          </span>
                        </td>

                        <td className="px-6 py-4 text-xs text-slate-400">
                          {new Date(
                            member.joinedAt || member.createdAt,
                          ).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </td>

                        {canManage && (
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {/* Owner changing roles */}
                              {isOwner && !isMemberOwner && (
                                <select
                                  value={member.role}
                                  onChange={(e) =>
                                    handleUpdateRole(
                                      member.userId,
                                      e.target.value as "ADMIN" | "MEMBER",
                                    )
                                  }
                                  disabled={actionLoadingId === member.userId}
                                  className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs font-medium text-slate-200 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                                >
                                  <option value="MEMBER">Member</option>
                                  <option value="ADMIN">Admin</option>
                                </select>
                              )}

                              {/* Remove member button */}
                              {(canDemoteOrRemove || canAdminRemove) &&
                                !isSelf && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setConfirmDeleteMember(member)
                                    }
                                    disabled={actionLoadingId === member.userId}
                                    title="Remove member from organization"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}

                              {isMemberOwner && isOwnerCountOne && (
                                <span className="text-[11px] text-slate-500 italic">
                                  Primary Owner
                                </span>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pending Invitations Section (Visible to OWNER / ADMIN) */}
        {canManage && (
          <div className="mt-10 rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-800/80 bg-slate-900/80 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Mail className="w-4 h-4 text-slate-400" />
                <span>Pending Invitations</span>
                <span className="px-2 py-0.5 rounded-full text-xs bg-slate-800 text-slate-300 font-normal">
                  {invitations.length}
                </span>
              </h2>
            </div>

            {invitations.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No pending invitations. All invited members have either joined
                or invitations have expired.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <caption className="sr-only">
                    Pending Organization Invitations
                  </caption>
                  <thead className="bg-slate-950/40 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-3.5">Recipient Email</th>
                      <th className="px-6 py-3.5">Assigned Role</th>
                      <th className="px-6 py-3.5">Sent By</th>
                      <th className="px-6 py-3.5">Expires</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {invitations.map((inv) => (
                      <tr
                        key={inv.id}
                        className="hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="px-6 py-4 font-medium text-white">
                          {inv.email}
                        </td>

                        <td className="px-6 py-4">{getRoleBadge(inv.role)}</td>

                        <td className="px-6 py-4 text-xs text-slate-400">
                          {inv.inviter?.displayName ||
                            inv.inviter?.email ||
                            "Admin"}
                        </td>

                        <td className="px-6 py-4 text-xs text-slate-400">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                            <span>
                              {new Date(inv.expiresAt).toLocaleDateString(
                                undefined,
                                {
                                  month: "short",
                                  day: "numeric",
                                },
                              )}
                            </span>
                          </div>
                        </td>

                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleResendInvitation(inv.id)}
                              disabled={actionLoadingId === inv.id}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                            >
                              <RefreshCw
                                className={`w-3 h-3 ${actionLoadingId === inv.id ? "animate-spin" : ""}`}
                              />
                              <span>Resend</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setConfirmRevokeInvite(inv)}
                              disabled={actionLoadingId === inv.id}
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                              title="Revoke invitation"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Invite Member Modal */}
      <InviteMemberModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onSuccess={loadData}
        organizationId={organizationId}
        currentUserRole={currentUserRole}
        maxMembers={billing?.limits.maxMembers}
        currentMembersCount={members.length}
      />

      {/* Confirm Member Removal Modal */}
      {confirmDeleteMember && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-delete-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400 mb-3">
              <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/30">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3
                id="confirm-delete-title"
                className="text-base font-semibold text-white"
              >
                Remove Team Member?
              </h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mb-5">
              Are you sure you want to remove{" "}
              <strong className="text-white">
                {confirmDeleteMember.user?.displayName ||
                  confirmDeleteMember.user?.email}
              </strong>{" "}
              from the organization? They will immediately lose access to all
              projects, tasks, and data.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDeleteMember(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRemoveMember}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-500 hover:bg-rose-400 text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
              >
                Remove Member
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Revoke Invite Modal */}
      {confirmRevokeInvite && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-revoke-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400 mb-3">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <XCircle className="w-5 h-5" />
              </div>
              <h3
                id="confirm-revoke-title"
                className="text-base font-semibold text-white"
              >
                Revoke Invitation?
              </h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mb-5">
              Are you sure you want to revoke the pending invitation for{" "}
              <strong className="text-white">
                {confirmRevokeInvite.email}
              </strong>
              ? The invitation link will no longer be valid.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmRevokeInvite(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRevokeInvitation}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                Revoke Invitation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
