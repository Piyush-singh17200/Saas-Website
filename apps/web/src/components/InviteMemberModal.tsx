"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  Mail,
  Shield,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Copy,
  Check,
} from "lucide-react";
import type {
  CreateInvitationInput,
  MembershipRoleType,
} from "@workspace/contracts";
import { apiClient } from "../lib/api-client";

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  organizationId: string;
  currentUserRole: MembershipRoleType;
  maxMembers?: number;
  currentMembersCount?: number;
}

export function InviteMemberModal({
  isOpen,
  onClose,
  onSuccess,
  organizationId,
  currentUserRole,
  maxMembers,
  currentMembersCount,
}: InviteMemberModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const handleModalClose = useCallback(() => {
    setEmail("");
    setRole("MEMBER");
    setError(null);
    setCreatedInviteUrl(null);
    setIsCopied(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        handleModalClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, handleModalClose]);

  if (!isOpen) return null;

  const isLimitReached =
    maxMembers !== undefined &&
    currentMembersCount !== undefined &&
    currentMembersCount >= maxMembers;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const payload: CreateInvitationInput = {
        email: email.trim().toLowerCase(),
        role,
      };

      const res = await apiClient.createInvitation(organizationId, payload);
      onSuccess();

      if (res.invitation.token && typeof window !== "undefined") {
        const fullUrl = `${window.location.origin}/invitations/${res.invitation.token}`;
        setCreatedInviteUrl(fullUrl);
      } else {
        handleModalClose();
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to send invitation",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyLink = async () => {
    if (!createdInviteUrl) return;
    try {
      await navigator.clipboard.writeText(createdInviteUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="invite-modal-title"
                className="text-base font-semibold text-white"
              >
                Invite Team Member
              </h2>
              <p className="text-xs text-slate-400">
                Send an invitation to join this organization
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleModalClose}
            aria-label="Close dialog"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Success Step: Invite Link Generated */}
        {createdInviteUrl ? (
          <div className="p-5 space-y-4">
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              <div>
                <span className="font-semibold text-white">
                  Invitation Created!
                </span>
                <p className="mt-0.5 text-slate-300">
                  A secure, single-use invitation token was generated. Share
                  this link directly with{" "}
                  <strong className="text-white">
                    {email || "the recipient"}
                  </strong>
                  .
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Invitation Acceptance Link
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={createdInviteUrl}
                  className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 font-mono select-all focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
                >
                  {isCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 italic">
              Note: The link expires in 7 days and can only be accepted by the
              invited email address.
            </p>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={handleModalClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Input Form */
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {isLimitReached && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Seat Limit Reached:</span>{" "}
                  Your organization has reached its plan limit of {maxMembers}{" "}
                  members. Upgrade to Pro to add more team members.
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="invite-email"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                Email Address <span className="text-rose-400">*</span>
              </label>
              <input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@example.com"
                required
                disabled={isSubmitting}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors disabled:opacity-50"
              />
            </div>

            <div>
              <label
                htmlFor="invite-role"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                Organization Role
              </label>
              <div className="relative">
                <select
                  id="invite-role"
                  value={role}
                  onChange={(e) =>
                    setRole(e.target.value as "MEMBER" | "ADMIN")
                  }
                  disabled={isSubmitting || currentUserRole !== "OWNER"}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-50 appearance-none"
                >
                  <option value="MEMBER">
                    Member (Standard project & task access)
                  </option>
                  {currentUserRole === "OWNER" && (
                    <option value="ADMIN">
                      Admin (Can manage projects, billing & team members)
                    </option>
                  )}
                </select>
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <Shield className="w-4 h-4" />
                </div>
              </div>
              {currentUserRole === "ADMIN" && (
                <p className="text-[11px] text-slate-500 mt-1">
                  Admins can only invite Members. Only Organization Owners can
                  invite Admins.
                </p>
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleModalClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !email.trim()}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <span>Send Invitation</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
