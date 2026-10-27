"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  Mail,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
  UserCheck,
  Clock,
  LogOut,
} from "lucide-react";
import type { PublicInvitationDetails } from "@workspace/contracts";
import { apiClient } from "../../../lib/api-client";
import { buildInvitationAuthHref } from "../../../lib/invitation-auth";

export default function AcceptInvitationPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [invitation, setInvitation] = useState<PublicInvitationDetails | null>(
    null,
  );
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    email: string;
    displayName: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      setIsLoading(true);
      setError(null);

      // 1. Fetch public invitation details
      const details = await apiClient.getInvitationByToken(token);
      setInvitation(details);

      // 2. Fetch authenticated user (if any)
      try {
        const me = await apiClient.getMe();
        setCurrentUser(me.user);
      } catch {
        // Unauthenticated visitor is valid at this stage
        setCurrentUser(null);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load invitation. The link may be invalid or expired.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAccept = async () => {
    try {
      setIsAccepting(true);
      setError(null);
      const res = await apiClient.acceptInvitation(token);
      setSuccess(
        `Welcome to ${res.organizationName}! Redirecting to workspace...`,
      );
      setTimeout(() => {
        router.push(`/organizations/${res.organizationId}/projects`);
      }, 1500);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to accept invitation",
      );
    } finally {
      setIsAccepting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiClient.logout();
      setCurrentUser(null);
      loadData();
    } catch {
      // Ignored
    }
  };

  const isEmailMatching =
    currentUser &&
    invitation &&
    currentUser.email.trim().toLowerCase() ===
      invitation.email.trim().toLowerCase();

  const invitationRedirect = `/invitations/${token}`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in duration-200">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 bg-slate-950/40 text-center">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mx-auto flex items-center justify-center mb-3">
            <Building2 className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Organization Invitation
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            You have been invited to join a collaborative workspace on
            WorkSpace.
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400 text-sm">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              <span>Verifying invitation token...</span>
            </div>
          ) : error && !invitation ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold">
                    Invalid or Expired Invitation
                  </h3>
                  <p className="text-xs mt-1 text-rose-300/90">{error}</p>
                </div>
              </div>
              <div className="text-center pt-2">
                <Link
                  href="/"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300"
                >
                  <span>Return to Home</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ) : invitation ? (
            <>
              {error && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{success}</span>
                </div>
              )}

              {/* Organization Info Box */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-slate-850">
                  <span className="text-xs text-slate-400">Organization</span>
                  <span className="text-sm font-semibold text-white">
                    {invitation.organization.name}
                  </span>
                </div>

                <div className="flex items-center justify-between pb-3 border-b border-slate-850">
                  <span className="text-xs text-slate-400">Role Assigned</span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                    <Shield className="w-3 h-3" />
                    <span>{invitation.role}</span>
                  </span>
                </div>

                <div className="flex items-center justify-between pb-3 border-b border-slate-850">
                  <span className="text-xs text-slate-400">Invited Email</span>
                  <span className="text-xs font-medium text-slate-300 flex items-center gap-1">
                    <Mail className="w-3 h-3 text-slate-500" />
                    <span>{invitation.email}</span>
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Invited by</span>
                  <span className="text-slate-300 font-medium">
                    {invitation.inviter.displayName}
                  </span>
                </div>
              </div>

              {/* Authentication Status & Actions */}
              {!currentUser ? (
                <div className="space-y-3 pt-2">
                  <p className="text-xs text-slate-400 text-center">
                    You must sign in to an account with email{" "}
                    <strong className="text-white">{invitation.email}</strong>{" "}
                    to accept this invitation.
                  </p>
                  <Link
                    href={buildInvitationAuthHref("/login", {
                      email: invitation.email,
                      redirect: invitationRedirect,
                    })}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-500/20"
                  >
                    <span>Sign In to Accept</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                  <Link
                    href={buildInvitationAuthHref("/register", {
                      email: invitation.email,
                      redirect: invitationRedirect,
                    })}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors border border-slate-700"
                  >
                    <span>Create an Account</span>
                  </Link>
                </div>
              ) : isEmailMatching ? (
                <div className="space-y-3 pt-2">
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
                    <UserCheck className="w-4 h-4 shrink-0" />
                    <span>
                      Signed in as{" "}
                      <strong className="text-white">
                        {currentUser.email}
                      </strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAccept}
                    disabled={isAccepting || Boolean(success)}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                  >
                    {isAccepting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Accepting Invitation...</span>
                      </>
                    ) : (
                      <>
                        <span>Accept Invitation & Join Organization</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              ) : (
                /* Logged in with different email */
                <div className="space-y-3 pt-2">
                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1.5">
                    <div className="font-semibold flex items-center gap-1.5 text-amber-400">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Account Mismatch</span>
                    </div>
                    <p className="text-slate-300">
                      You are currently signed in as{" "}
                      <strong className="text-white">
                        {currentUser.email}
                      </strong>
                      , but this invitation was sent to{" "}
                      <strong className="text-white">{invitation.email}</strong>
                      .
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors border border-slate-700"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out to Switch Account</span>
                  </button>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40 text-center text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
          <Clock className="w-3 h-3" />
          <span>
            Single-use invitation link protected by secure tenant verification.
          </span>
        </div>
      </div>
    </div>
  );
}
