"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Activity,
  Calendar,
  User,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type {
  ActivityLogResponse,
  OrganizationResponse,
} from "@workspace/contracts";
import { apiClient } from "../../../../lib/api-client";
import { Navbar } from "../../../../components/Navbar";

export default function OrganizationActivityPage() {
  const params = useParams();
  const organizationId = params.organizationId as string;

  const [activities, setActivities] = useState<ActivityLogResponse[]>([]);
  const [organization, setOrganization] = useState<OrganizationResponse | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Filter
  const [eventTypeFilter, setEventTypeFilter] = useState("");

  const loadActivities = useCallback(async () => {
    if (!organizationId) return;
    try {
      setIsLoading(true);
      setError(null);

      try {
        const org = await apiClient.getOrganization(organizationId);
        setOrganization(org);
      } catch {
        // fallback
      }

      const res = await apiClient.getActivity(organizationId, {
        eventType: eventTypeFilter ? eventTypeFilter : undefined,
        page,
        limit: 25,
      });

      setActivities(res.items);
      setTotalPages(res.totalPages);
      setTotalCount(res.total);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to load audit activity log";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, page, eventTypeFilter]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar
        organizationId={organizationId}
        organizationName={organization?.name}
        activeTab="activity"
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <Activity className="w-6 h-6 text-emerald-400" />
              <span>Activity History</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Immutable audit timeline of project changes, task workflows, and
              team interactions.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={eventTypeFilter}
              onChange={(e) => {
                setEventTypeFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter activity by event type"
              className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-medium text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="">All Event Types</option>
              <option value="project.created">Project Created</option>
              <option value="project.archived">Project Archived</option>
              <option value="task.created">Task Created</option>
              <option value="task.completed">Task Completed</option>
              <option value="task.assigned">Task Assigned</option>
              <option value="comment.created">Comment Added</option>
            </select>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mt-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => loadActivities()}
              className="text-xs font-semibold underline hover:text-white"
            >
              Retry
            </button>
          </div>
        )}

        {/* Timeline Content */}
        <div className="mt-6 flex-1">
          {isLoading ? (
            <div className="py-24 flex flex-col items-center justify-center text-slate-500 text-sm">
              <Loader2 className="w-8 h-8 animate-spin mb-3 text-emerald-400" />
              <span>Loading audit logs...</span>
            </div>
          ) : activities.length === 0 ? (
            <div className="py-20 border border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center text-center p-6">
              <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mb-4">
                <Activity className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-white mb-1">
                No activity records found
              </h3>
              <p className="text-xs text-slate-400 max-w-sm">
                Activity events will automatically appear here as projects and
                tasks are modified.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activities.map((act) => (
                <div
                  key={act.id}
                  className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-emerald-400 shrink-0 mt-0.5">
                      <Activity className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-white">
                          {act.eventType.replace(".", " → ").replace(/_/g, " ")}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 border border-slate-700 text-slate-400 uppercase">
                          {act.entityType}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-500" />
                          <span>
                            Actor:{" "}
                            {act.actorId ? (
                              <span className="font-mono text-slate-300">
                                {act.actorId}
                              </span>
                            ) : (
                              "System"
                            )}
                          </span>
                        </div>
                        <div>
                          Entity ID:{" "}
                          <span className="font-mono text-slate-300">
                            {act.entityId}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-500 font-mono flex items-center gap-1.5 self-end sm:self-center">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{new Date(act.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>
              Showing page <strong className="text-white">{page}</strong> of{" "}
              <strong className="text-white">{totalPages}</strong> ({totalCount}{" "}
              total events)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={page >= totalPages || isLoading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
