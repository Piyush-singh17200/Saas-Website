"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Zap,
  Users,
  FolderKanban,
  ExternalLink,
  Loader2,
  AlertCircle,
  Clock,
  Sparkles,
} from "lucide-react";
import type {
  BillingSummaryResponse,
  OrganizationResponse,
} from "@workspace/contracts";
import { apiClient, ApiError } from "../../../../lib/api-client";
import { Navbar } from "../../../../components/Navbar";

export default function OrganizationBillingPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const organizationId = params.organizationId as string;

  const [billing, setBilling] = useState<BillingSummaryResponse | null>(null);
  const [organization, setOrganization] = useState<OrganizationResponse | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);

  // Check for checkout return flags
  useEffect(() => {
    if (searchParams.get("success") === "true") {
      setBannerNotice(
        "Checkout completed! Your subscription is being activated.",
      );
    } else if (searchParams.get("canceled") === "true") {
      setBannerNotice(
        "Checkout was canceled. No changes were made to your subscription.",
      );
    }
  }, [searchParams]);

  const loadBillingData = useCallback(async () => {
    if (!organizationId) return;
    try {
      setIsLoading(true);
      setError(null);

      const [orgData, billingData] = await Promise.all([
        apiClient.getOrganization(organizationId).catch(() => null),
        apiClient.getBillingSummary(organizationId),
      ]);

      setOrganization(orgData);
      setBilling(billingData);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load organization billing details.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadBillingData();
  }, [loadBillingData]);

  // Upgrade to Pro via Stripe Checkout
  const handleUpgrade = async () => {
    try {
      setIsActionLoading(true);
      setError(null);
      const res = await apiClient.createCheckoutSession(organizationId);
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      }
    } catch (err: unknown) {
      setIsActionLoading(false);
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to start Stripe checkout session. Please try again.");
      }
    }
  };

  // Open Stripe Customer Portal
  const handleManagePortal = async () => {
    try {
      setIsActionLoading(true);
      setError(null);
      const res = await apiClient.createPortalSession(organizationId);
      if (res.portalUrl) {
        window.location.href = res.portalUrl;
      }
    } catch (err: unknown) {
      setIsActionLoading(false);
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to open Stripe Customer Portal. Please try again.");
      }
    }
  };

  const isPro = billing?.subscription.plan === "PRO";
  const isPastDue =
    billing?.subscription.status === "PAST_DUE" ||
    billing?.subscription.status === "UNPAID";
  const isCanceled = billing?.subscription.status === "CANCELED";
  const cancelAtPeriodEnd = billing?.subscription.cancelAtPeriodEnd;

  const projectUsagePct = billing
    ? Math.min(
        100,
        Math.round(
          (billing.usage.activeProjects / billing.limits.maxActiveProjects) *
            100,
        ),
      )
    : 0;

  const memberUsagePct = billing
    ? Math.min(
        100,
        Math.round((billing.usage.members / billing.limits.maxMembers) * 100),
      )
    : 0;

  const isProjectsLimitReached =
    billing && billing.usage.activeProjects >= billing.limits.maxActiveProjects;

  const isMembersLimitReached =
    billing && billing.usage.members >= billing.limits.maxMembers;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-300">
      <Navbar
        organizationId={organizationId}
        organizationName={organization?.name}
        activeTab="billing"
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 mb-1">
              <CreditCard className="w-4 h-4" />
              <span>SUBSCRIPTION & ENTITLEMENTS</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Billing & Plans
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Manage organization subscription tier, view resource usage, and
              configure payment settings.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={`/organizations/${organizationId}/projects`}
              className="px-3.5 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors"
            >
              Back to Projects
            </Link>
          </div>
        </div>

        {/* Notice / Feedback Banners */}
        {bannerNotice && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
              <span>{bannerNotice}</span>
            </div>
            <button
              onClick={() => setBannerNotice(null)}
              className="text-xs text-slate-400 hover:text-white font-medium"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-xs text-slate-400 hover:text-white font-medium"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Payment Warning Banner */}
        {isPastDue && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <p className="font-semibold text-white">Payment Past Due</p>
                <p className="text-xs text-amber-300/90 mt-0.5">
                  Your last subscription invoice payment failed. Please update
                  your payment method in the Customer Portal to keep Pro access.
                </p>
              </div>
            </div>
            <button
              onClick={handleManagePortal}
              disabled={isActionLoading}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors shrink-0 flex items-center gap-1.5"
            >
              Update Payment Method
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Cancellation Notice Banner */}
        {cancelAtPeriodEnd && (
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-sm flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <span className="font-medium text-white">
                Scheduled Cancellation:
              </span>{" "}
              Your Pro subscription will expire at the end of the current
              billing cycle
              {billing?.subscription.currentPeriodEnd
                ? ` on ${new Date(billing.subscription.currentPeriodEnd).toLocaleDateString()}`
                : ""}
              . You will retain Pro features until that date.
            </div>
          </div>
        )}

        {/* Previously Canceled Notice */}
        {isCanceled && (
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-slate-400 shrink-0" />
              <div>
                <span className="font-medium text-white">
                  Subscription Canceled:
                </span>{" "}
                Your Pro subscription is no longer active. All existing projects
                and team data have been preserved. You can re-upgrade to Pro
                anytime.
              </div>
            </div>
            <button
              onClick={handleUpgrade}
              disabled={isActionLoading}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors shrink-0"
            >
              Re-activate Pro
            </button>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="py-24 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
            <span className="text-sm text-slate-400 font-mono">
              Fetching billing summary and entitlements...
            </span>
          </div>
        )}

        {!isLoading && billing && (
          <div className="space-y-8">
            {/* Top Grid: Current Plan Status & Resource Usage Meters */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Current Subscription Card */}
              <div className="lg:col-span-1 rounded-2xl bg-slate-900/60 border border-slate-800/80 p-6 flex flex-col justify-between backdrop-blur">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                      Active Subscription
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono uppercase font-semibold ${
                        isPro
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          : "bg-slate-800 text-slate-300 border border-slate-700"
                      }`}
                    >
                      {billing.subscription.plan} PLAN
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2 mb-2">
                    <h2 className="text-3xl font-extrabold text-white">
                      {isPro ? "WorkSpace Pro" : "WorkSpace Free"}
                    </h2>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed mb-6">
                    {isPro
                      ? "High-volume active projects, generous team seats, and premium SaaS capabilities."
                      : "Essential project tracking and task workflows for small teams."}
                  </p>

                  <div className="space-y-3 pt-4 border-t border-slate-800 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">
                        Subscription Status:
                      </span>
                      <span className="font-mono font-medium text-slate-200">
                        {billing.subscription.status}
                      </span>
                    </div>

                    {billing.subscription.currentPeriodEnd && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">
                          {cancelAtPeriodEnd ? "Expires On:" : "Renews On:"}
                        </span>
                        <span className="font-mono text-slate-300">
                          {new Date(
                            billing.subscription.currentPeriodEnd,
                          ).toLocaleDateString()}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">
                        Database Isolation:
                      </span>
                      <span className="font-mono text-emerald-400 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Row-Level Security
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-4 border-t border-slate-800">
                  {isPro ? (
                    <button
                      onClick={handleManagePortal}
                      disabled={isActionLoading}
                      className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs flex items-center justify-center gap-2 transition-all border border-slate-700 disabled:opacity-50"
                    >
                      {isActionLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4 text-emerald-400" />
                          Manage Billing & Invoices
                          <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={handleUpgrade}
                      disabled={isActionLoading}
                      className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                    >
                      {isActionLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Zap className="w-4 h-4 fill-slate-950" />
                          Upgrade to Pro Tier
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Resource Entitlement Usage Meters */}
              <div className="lg:col-span-2 rounded-2xl bg-slate-900/60 border border-slate-800/80 p-6 flex flex-col justify-between backdrop-blur space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                      Entitlement Usage
                    </span>
                    <span className="text-xs text-slate-400">
                      Server-Enforced Quotas
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-white">
                    Resource Allocations
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Limits are verified atomically on the server before project
                    creation or team member invitations.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Meter 1: Active Projects */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/90 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FolderKanban className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm font-medium text-slate-200">
                          Active Projects
                        </span>
                      </div>
                      {isProjectsLimitReached ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                          Limit Reached
                        </span>
                      ) : (
                        <span className="text-xs font-mono text-slate-400">
                          {projectUsagePct}%
                        </span>
                      )}
                    </div>

                    <div className="flex items-baseline justify-between text-xs">
                      <span className="text-2xl font-bold font-mono text-white">
                        {billing.usage.activeProjects}
                      </span>
                      <span className="text-slate-400 font-mono">
                        max {billing.limits.maxActiveProjects} active
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isProjectsLimitReached
                            ? "bg-rose-500"
                            : projectUsagePct > 75
                              ? "bg-amber-400"
                              : "bg-emerald-500"
                        }`}
                        style={{ width: `${projectUsagePct}%` }}
                      />
                    </div>

                    <p className="text-[11px] text-slate-500">
                      Archiving an active project frees up a slot immediately.
                    </p>
                  </div>

                  {/* Meter 2: Team Members */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/90 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm font-medium text-slate-200">
                          Team Members
                        </span>
                      </div>
                      {isMembersLimitReached ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                          Limit Reached
                        </span>
                      ) : (
                        <span className="text-xs font-mono text-slate-400">
                          {memberUsagePct}%
                        </span>
                      )}
                    </div>

                    <div className="flex items-baseline justify-between text-xs">
                      <span className="text-2xl font-bold font-mono text-white">
                        {billing.usage.members}
                      </span>
                      <span className="text-slate-400 font-mono">
                        max {billing.limits.maxMembers} members
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isMembersLimitReached
                            ? "bg-rose-500"
                            : memberUsagePct > 75
                              ? "bg-amber-400"
                              : "bg-emerald-500"
                        }`}
                        style={{ width: `${memberUsagePct}%` }}
                      />
                    </div>

                    <p className="text-[11px] text-slate-500">
                      Admins and Members combined count toward the seat limit.
                    </p>
                  </div>
                </div>

                {/* Safe Downgrade Policy Notice */}
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-400 flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-slate-200">
                      Data Preservation Guarantee:
                    </strong>{" "}
                    Downgrading or canceling your plan will never delete
                    existing projects, tasks, comments, or team members. Limits
                    apply strictly to new creation requests.
                  </span>
                </div>
              </div>
            </div>

            {/* Plan Comparison Section */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="text-xl font-bold text-white">
                    Compare WorkSpace Plans
                  </h3>
                  <p className="text-xs text-slate-400">
                    Transparent, predictable subscription tiers built for
                    growing organizations.
                  </p>
                </div>
                <div className="text-[11px] font-mono text-slate-400 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 flex items-center gap-1.5 self-start">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  Stripe Test Mode Enabled
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Free Plan Card */}
                <div
                  className={`rounded-2xl p-6 flex flex-col justify-between border transition-all ${
                    !isPro
                      ? "bg-slate-900/80 border-slate-700 shadow-lg"
                      : "bg-slate-900/40 border-slate-800"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="text-lg font-bold text-white">Free</h4>
                        <p className="text-xs text-slate-400">
                          For small teams & initial pilots
                        </p>
                      </div>
                      {!isPro && (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-mono uppercase bg-slate-800 text-slate-300 border border-slate-700 font-semibold">
                          Current Plan
                        </span>
                      )}
                    </div>

                    <div className="flex items-baseline gap-1 my-4">
                      <span className="text-3xl font-extrabold text-white">
                        $0
                      </span>
                      <span className="text-xs text-slate-400">/ month</span>
                    </div>

                    <ul className="space-y-3 text-xs text-slate-300 mt-6 border-t border-slate-800 pt-6">
                      <li className="flex items-center gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>
                          Up to {billing.limits.maxActiveProjects} active
                          projects
                        </span>
                      </li>
                      <li className="flex items-center gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>
                          Up to {billing.limits.maxMembers} organization members
                        </span>
                      </li>
                      <li className="flex items-center gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Full Kanban task board & status lifecycle</span>
                      </li>
                      <li className="flex items-center gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Activity logging and audit history</span>
                      </li>
                      <li className="flex items-center gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Multi-tenant PostgreSQL Row-Level Security</span>
                      </li>
                    </ul>
                  </div>

                  <div className="mt-8 pt-4 border-t border-slate-800">
                    <button
                      disabled
                      className="w-full py-2.5 rounded-xl bg-slate-800/60 text-slate-400 font-medium text-xs cursor-default"
                    >
                      {!isPro ? "Current Active Plan" : "Included by Default"}
                    </button>
                  </div>
                </div>

                {/* Pro Plan Card */}
                <div
                  className={`rounded-2xl p-6 flex flex-col justify-between border relative overflow-hidden transition-all ${
                    isPro
                      ? "bg-slate-900/90 border-emerald-500/40 shadow-xl shadow-emerald-500/5"
                      : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  {/* Pro Ribbon */}
                  <div className="absolute top-0 right-0 bg-gradient-to-l from-emerald-500 to-teal-500 text-slate-950 font-bold text-[10px] uppercase tracking-wider px-3 py-1 rounded-bl-lg flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Recommended
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="text-lg font-bold text-white flex items-center gap-2">
                          Pro
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        </h4>
                        <p className="text-xs text-slate-400">
                          For growing teams requiring scale
                        </p>
                      </div>
                      {isPro && (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-mono uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold mr-24">
                          Current Plan
                        </span>
                      )}
                    </div>

                    <div className="flex items-baseline gap-1 my-4">
                      <span className="text-3xl font-extrabold text-white">
                        $29
                      </span>
                      <span className="text-xs text-slate-400">
                        / month per organization
                      </span>
                    </div>

                    <ul className="space-y-3 text-xs text-slate-300 mt-6 border-t border-slate-800 pt-6">
                      <li className="flex items-center gap-2.5 font-medium text-white">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Up to 50 active projects (16x Free limit)</span>
                      </li>
                      <li className="flex items-center gap-2.5 font-medium text-white">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Up to 50 team members & collaborators</span>
                      </li>
                      <li className="flex items-center gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Stripe Customer Portal self-service billing</span>
                      </li>
                      <li className="flex items-center gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Automatic invoice generation & tax receipts</span>
                      </li>
                      <li className="flex items-center gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Priority support & early access features</span>
                      </li>
                    </ul>
                  </div>

                  <div className="mt-8 pt-4 border-t border-slate-800">
                    {isPro ? (
                      <button
                        onClick={handleManagePortal}
                        disabled={isActionLoading}
                        className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs flex items-center justify-center gap-2 transition-colors border border-slate-700"
                      >
                        {isActionLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            Manage Pro Subscription
                            <ExternalLink className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={handleUpgrade}
                        disabled={isActionLoading}
                        className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                      >
                        {isActionLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            Upgrade to Pro ($29/mo)
                            <ArrowRight className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
