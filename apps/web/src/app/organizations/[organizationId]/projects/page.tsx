"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Search,
  Filter,
  FolderKanban,
  Archive,
  RefreshCw,
  ArrowRight,
  AlertCircle,
  Loader2,
  Layers,
} from "lucide-react";
import type {
  ProjectResponse,
  CreateProjectInput,
  OrganizationResponse,
} from "@workspace/contracts";
import { apiClient, ApiError } from "../../../../lib/api-client";
import { Navbar } from "../../../../components/Navbar";
import { ProjectModal } from "../../../../components/ProjectModal";

export default function OrganizationProjectsPage() {
  const params = useParams();
  const router = useRouter();
  const organizationId = params.organizationId as string;

  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [organization, setOrganization] = useState<OrganizationResponse | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPermissionDenied, setIsPermissionDenied] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "ARCHIVED" | "">(
    "",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Modals & Actions
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadData = useCallback(async () => {
    if (!organizationId) return;
    try {
      setIsLoading(true);
      setError(null);
      setIsPermissionDenied(false);

      // Fetch org info
      try {
        const org = await apiClient.getOrganization(organizationId);
        setOrganization(org);
      } catch {
        // Fallback if user is just member
      }

      // Fetch projects
      const res = await apiClient.getProjects(organizationId, {
        status: statusFilter ? statusFilter : undefined,
        search: debouncedSearch ? debouncedSearch : undefined,
        limit: 50,
      });
      setProjects(res.items);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 403) {
        setIsPermissionDenied(true);
      } else {
        const msg =
          err instanceof Error ? err.message : "Failed to load projects";
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, statusFilter, debouncedSearch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateProject = async (data: CreateProjectInput) => {
    const created = await apiClient.createProject(organizationId, data);
    setProjects((prev) => [created, ...prev]);
  };

  const handleArchiveProject = async (projectId: string) => {
    if (!window.confirm("Are you sure you want to archive this project?"))
      return;
    try {
      setIsActionLoading(projectId);
      const updated = await apiClient.archiveProject(organizationId, projectId);
      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? updated : p)),
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to archive project");
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleRestoreProject = async (projectId: string) => {
    try {
      setIsActionLoading(projectId);
      const updated = await apiClient.restoreProject(organizationId, projectId);
      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? updated : p)),
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to restore project");
    } finally {
      setIsActionLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar
        organizationId={organizationId}
        organizationName={organization?.name}
        activeTab="projects"
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Permission Denied Banner */}
        {isPermissionDenied && (
          <div className="mb-8 p-6 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300">
            <h3 className="text-lg font-semibold text-rose-200 mb-1">
              Access Restricted
            </h3>
            <p className="text-sm text-rose-300/80 mb-4">
              You do not have active membership in this organization or lack
              permission to view projects.
            </p>
            <button
              onClick={() => router.push("/")}
              className="px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold"
            >
              Back to Home
            </button>
          </div>
        )}

        {/* Header & Create Project CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Projects
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Manage organization workspaces, track tasks, and collaborate
              securely.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold transition-colors shadow-lg shadow-emerald-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>New Project</span>
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "ACTIVE" | "ARCHIVED" | "")
              }
              aria-label="Filter projects by status"
              className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-medium text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active Projects</option>
              <option value="ARCHIVED">Archived Projects</option>
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
              onClick={() => loadData()}
              className="text-xs font-semibold underline hover:text-white"
            >
              Retry
            </button>
          </div>
        )}

        {/* Projects Grid / List */}
        <div className="mt-6">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-500 text-sm">
              <Loader2 className="w-8 h-8 animate-spin mb-3 text-emerald-400" />
              <span>Loading workspace projects...</span>
            </div>
          ) : projects.length === 0 ? (
            <div className="py-20 border border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center text-center p-6">
              <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mb-4">
                <FolderKanban className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-white mb-1">
                No projects found
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mb-6">
                {searchQuery || statusFilter
                  ? "No projects match your current filters. Try resetting search query or status filter."
                  : "Get started by creating your organization's first project to manage tasks and collaborate."}
              </p>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create First Project</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition-colors flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                          project.status === "ACTIVE"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                        }`}
                      >
                        {project.status}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500">
                        /{project.slug}
                      </span>
                    </div>

                    <h3 className="text-lg font-semibold text-white group-hover:text-emerald-400 transition-colors line-clamp-1">
                      {project.name}
                    </h3>

                    <p className="text-xs text-slate-400 mt-2 line-clamp-2 min-h-[32px]">
                      {project.description || "No description provided."}
                    </p>
                  </div>

                  <div className="pt-6 mt-6 border-t border-slate-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Layers className="w-3.5 h-3.5 text-slate-500" />
                      <span>{project.taskCount ?? 0} tasks</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {project.status === "ACTIVE" ? (
                        <button
                          type="button"
                          disabled={isActionLoading === project.id}
                          onClick={() => handleArchiveProject(project.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                          title="Archive project"
                          aria-label="Archive project"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isActionLoading === project.id}
                          onClick={() => handleRestoreProject(project.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors"
                          title="Restore project"
                          aria-label="Restore project"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <Link
                        href={`/organizations/${organizationId}/projects/${project.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-200 text-xs font-semibold transition-colors"
                      >
                        <span>Workspace</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <ProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateProject}
        organizationId={organizationId}
      />
    </div>
  );
}
