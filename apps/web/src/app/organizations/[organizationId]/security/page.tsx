"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Shield,
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  Lock,
} from "lucide-react";
import { Navbar } from "../../../../components/Navbar";
import { apiClient } from "../../../../lib/api-client";
import type {
  OrganizationSecurityPolicyResponse,
  AuditLogEventItem,
} from "@workspace/contracts";

export default function OrganizationSecurityPage() {
  const params = useParams();
  const organizationId = params.organizationId as string;

  const [policy, setPolicy] =
    useState<OrganizationSecurityPolicyResponse | null>(null);
  const [requireMfa, setRequireMfa] = useState(false);
  const [sessionMaxAgeHours, setSessionMaxAgeHours] = useState(720); // 30 days = 720 hours

  // Audit Logs State
  const [logs, setLogs] = useState<AuditLogEventItem[]>([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedActionFilter, setSelectedActionFilter] = useState<string>("");
  const [selectedOutcomeFilter, setSelectedOutcomeFilter] =
    useState<string>("");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Status & Feedback
  const [loadingPolicy, setLoadingPolicy] = useState(true);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [policySuccess, setPolicySuccess] = useState<string | null>(null);

  const loadPolicy = useCallback(async () => {
    setLoadingPolicy(true);
    setPolicyError(null);
    try {
      const res = await apiClient.getOrganizationSecurityPolicy(organizationId);
      setPolicy(res.policy);
      setRequireMfa(res.policy.requireMfa);
      setSessionMaxAgeHours(Math.round(res.policy.sessionMaxAgeMinutes / 60));
    } catch (err: any) {
      setPolicyError(
        err.message || "Failed to load organization security policy",
      );
    } finally {
      setLoadingPolicy(false);
    }
  }, [organizationId]);

  const loadAuditLogs = useCallback(
    async (page = 1) => {
      setLoadingLogs(true);
      try {
        const res = await apiClient.getOrganizationAuditLogs(organizationId, {
          page,
          limit: 15,
          action: selectedActionFilter || undefined,
          outcome:
            (selectedOutcomeFilter as "SUCCESS" | "FAILURE") || undefined,
        });
        setLogs(res.items);
        setTotalLogs(res.total);
        setCurrentPage(res.page);
        setTotalPages(res.totalPages);
      } catch (err: any) {
        console.error("Failed to load audit logs:", err);
      } finally {
        setLoadingLogs(false);
      }
    },
    [organizationId, selectedActionFilter, selectedOutcomeFilter],
  );

  useEffect(() => {
    loadPolicy();
    loadAuditLogs(1);
  }, [loadPolicy, loadAuditLogs]);

  async function savePolicy() {
    setSavingPolicy(true);
    setPolicyError(null);
    setPolicySuccess(null);
    try {
      const res = await apiClient.updateOrganizationSecurityPolicy(
        organizationId,
        {
          requireMfa,
          sessionMaxAgeMinutes: sessionMaxAgeHours * 60,
        },
      );
      setPolicy(res.policy);
      setPolicySuccess("Organization security policy updated successfully!");
      loadAuditLogs(1); // Refresh audit logs to show policy modification event
    } catch (err: any) {
      setPolicyError(
        err.message || "Failed to save security policy. Admin rights required.",
      );
    } finally {
      setSavingPolicy(false);
    }
  }

  function handleFilterApply(action: string, outcome: string) {
    setSelectedActionFilter(action);
    setSelectedOutcomeFilter(outcome);
    setLoadingLogs(true);
    apiClient
      .getOrganizationAuditLogs(organizationId, {
        page: 1,
        limit: 15,
        action: action || undefined,
        outcome: (outcome as "SUCCESS" | "FAILURE") || undefined,
      })
      .then((res) => {
        setLogs(res.items);
        setTotalLogs(res.total);
        setCurrentPage(1);
        setTotalPages(res.totalPages);
      })
      .finally(() => setLoadingLogs(false));
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar organizationId={organizationId} activeTab="security" />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono uppercase tracking-wider">
              <Shield className="w-4 h-4" />
              <span>Enterprise Account Protection</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white mt-1">
              Organization Security & Audit Logs
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Manage organization-wide MFA requirements, session duration
              policies, and inspect immutable audit events.
            </p>
          </div>
        </div>

        {/* Section 1: Security Policies */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">
                  Security Policies
                </h2>
                <p className="text-xs text-slate-400">
                  Enforce baseline security configurations for all members of
                  this organization.
                  {policy && (
                    <span className="block mt-0.5 text-[10px] text-slate-500 font-mono">
                      Policy ID: {policy.id} · Last updated:{" "}
                      {new Date(policy.updatedAt).toLocaleDateString()}
                    </span>
                  )}
                </p>
              </div>
            </div>

            <button
              onClick={savePolicy}
              disabled={savingPolicy || loadingPolicy}
              className="px-4 py-2 rounded-lg bg-emerald-500 text-slate-950 text-xs font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {savingPolicy ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5" />
              )}
              <span>
                {savingPolicy ? "Saving Policy..." : "Save Policy Settings"}
              </span>
            </button>
          </div>

          {policyError && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{policyError}</span>
            </div>
          )}

          {policySuccess && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{policySuccess}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* MFA Enforcement Toggle */}
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/40 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">
                    Require Multi-Factor Authentication
                  </span>
                  {requireMfa && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Enforced
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Require all organization members to enroll in TOTP two-factor
                  authentication. Members without active MFA will be blocked
                  from accessing organization resources.
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                <input
                  type="checkbox"
                  checked={requireMfa}
                  onChange={(e) => setRequireMfa(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>

            {/* Session Max Age Lifetime */}
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/40 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-medium text-white">
                    Maximum Session Duration
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Automatically invalidate member sessions that exceed this
                  lifetime, requiring re-authentication.
                </p>
              </div>

              <select
                value={sessionMaxAgeHours}
                onChange={(e) =>
                  setSessionMaxAgeHours(parseInt(e.target.value, 10))
                }
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value={8}>8 Hours</option>
                <option value={24}>24 Hours (1 Day)</option>
                <option value={168}>7 Days</option>
                <option value={720}>30 Days (Default)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 2: Security Audit Logs */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/80 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">
                  Security Audit Log
                </h2>
                <p className="text-xs text-slate-400">
                  Tamper-resistant ledger of security-critical actions,
                  authentication events, and administrative mutations.
                </p>
              </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2">
              <select
                value={selectedActionFilter}
                onChange={(e) =>
                  handleFilterApply(e.target.value, selectedOutcomeFilter)
                }
                className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
              >
                <option value="">All Actions</option>
                <option value="auth.login.success">Logins (Success)</option>
                <option value="auth.login.failure">Logins (Failure)</option>
                <option value="auth.mfa.enabled">MFA Enabled</option>
                <option value="auth.mfa.disabled">MFA Disabled</option>
                <option value="auth.session.revoked">Session Revoked</option>
                <option value="organization.security_policy.updated">
                  Policy Updates
                </option>
                <option value="api_key.created">API Key Created</option>
                <option value="webhook.created">Webhook Created</option>
              </select>

              <select
                value={selectedOutcomeFilter}
                onChange={(e) =>
                  handleFilterApply(selectedActionFilter, e.target.value)
                }
                className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
              >
                <option value="">All Outcomes</option>
                <option value="SUCCESS">Success Only</option>
                <option value="FAILURE">Failures Only</option>
              </select>

              <button
                onClick={() => loadAuditLogs(currentPage)}
                disabled={loadingLogs}
                className="p-1.5 rounded-lg border border-slate-800 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                title="Refresh audit logs"
              >
                <RefreshCw
                  className={`w-4 h-4 ${loadingLogs ? "animate-spin" : ""}`}
                />
              </button>
            </div>
          </div>

          {/* Audit Logs Table */}
          {loadingLogs ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Loading security audit records...
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Shield className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-sm text-slate-400">
                No audit records found matching criteria
              </p>
              <p className="text-xs text-slate-500">
                Security actions performed in this organization will appear here
                automatically.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Security and Audit Activity Log</caption>
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono">
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Timestamp</th>
                    <th className="py-3 px-3">Action Event</th>
                    <th className="py-3 px-3">Actor</th>
                    <th className="py-3 px-3">IP Address</th>
                    <th className="py-3 px-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {logs.map((log) => {
                    const isSuccess = log.outcome === "SUCCESS";
                    const isExpanded = expandedLogId === log.id;

                    return (
                      <React.Fragment key={log.id}>
                        <tr className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-3">
                            {isSuccess ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                <CheckCircle2 className="w-3 h-3" />
                                SUCCESS
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/30">
                                <XCircle className="w-3 h-3" />
                                FAILURE
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-slate-300">
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                          <td className="py-3 px-3 font-semibold text-white">
                            {log.action}
                          </td>
                          <td className="py-3 px-3 text-slate-300">
                            {log.actor ? (
                              <div>
                                <span className="text-white font-sans">
                                  {log.actor.displayName}
                                </span>
                                <span className="text-[10px] text-slate-500 block">
                                  {log.actor.email}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-500">
                                System / Anonymous
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-slate-400">
                            {log.ipAddress || "127.0.0.1"}
                          </td>
                          <td className="py-3 px-3">
                            {log.metadata &&
                            Object.keys(log.metadata).length > 0 ? (
                              <button
                                onClick={() =>
                                  setExpandedLogId(isExpanded ? null : log.id)
                                }
                                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] flex items-center gap-1 transition-colors"
                              >
                                <Eye className="w-3 h-3" />
                                <span>{isExpanded ? "Hide" : "Inspect"}</span>
                              </button>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                        </tr>

                        {isExpanded && log.metadata && (
                          <tr className="bg-slate-950/60">
                            <td
                              colSpan={6}
                              className="p-4 border-b border-slate-800"
                            >
                              <div className="space-y-1">
                                <div className="text-[11px] font-semibold text-slate-400">
                                  Sanitized Event Context (Secrets Redacted):
                                </div>
                                <pre className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-emerald-400 overflow-x-auto">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-800/80 pt-4 text-xs text-slate-400">
              <div>
                Showing page {currentPage} of {totalPages} ({totalLogs} total
                events)
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => loadAuditLogs(currentPage - 1)}
                  disabled={currentPage <= 1 || loadingLogs}
                  className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-950 hover:bg-slate-800 disabled:opacity-40 transition-colors flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>
                <button
                  onClick={() => loadAuditLogs(currentPage + 1)}
                  disabled={currentPage >= totalPages || loadingLogs}
                  className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-950 hover:bg-slate-800 disabled:opacity-40 transition-colors flex items-center gap-1"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
