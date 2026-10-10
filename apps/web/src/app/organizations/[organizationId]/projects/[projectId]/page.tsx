"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  User,
  MessageSquare,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Archive,
  ChevronRight,
  Trash2,
  Edit2,
  Settings,
  X,
} from "lucide-react";

import type {
  ProjectResponse,
  TaskResponse,
  CreateTaskInput,
  UpdateTaskInput,
  MembershipResponse,
} from "@workspace/contracts";
import { apiClient, ApiError } from "../../../../../lib/api-client";
import { Navbar } from "../../../../../components/Navbar";
import { TaskModal } from "../../../../../components/TaskModal";
import { TaskDetailModal } from "../../../../../components/TaskDetailModal";
import { ProjectSettingsModal } from "../../../../../components/ProjectSettingsModal";

const KANBAN_COLUMNS: Array<{
  id: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
  label: string;
  color: string;
}> = [
  { id: "TODO", label: "To Do", color: "border-slate-700 bg-slate-900/40" },
  {
    id: "IN_PROGRESS",
    label: "In Progress",
    color: "border-indigo-500/30 bg-indigo-500/5",
  },
  {
    id: "IN_REVIEW",
    label: "In Review",
    color: "border-purple-500/30 bg-purple-500/5",
  },
  {
    id: "DONE",
    label: "Done",
    color: "border-emerald-500/30 bg-emerald-500/5",
  },
];

export default function ProjectWorkspacePage() {
  const params = useParams();
  const organizationId = params.organizationId as string;
  const projectId = params.projectId as string;

  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [members, setMembers] = useState<MembershipResponse[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(
    undefined,
  );

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View state: 'kanban' or 'table'
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("");

  // Moving task indicator for OCC duplicate prevention
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);
  const [occConflictNotice, setOccConflictNotice] = useState<string | null>(null);

  // Modals
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskResponse | null>(null);
  const [detailTask, setDetailTask] = useState<TaskResponse | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);


  // Load user, project, members, tasks
  const loadData = useCallback(async () => {
    if (!organizationId || !projectId) return;
    try {
      setIsLoading(true);
      setError(null);

      // Current user
      try {
        const me = await apiClient.getMe();
        setCurrentUserId(me.user.id);
      } catch {
        // Continue
      }

      // Project info
      const proj = await apiClient.getProject(organizationId, projectId);
      setProject(proj);

      // Members
      try {
        const mems = await apiClient.getMembers(organizationId);
        setMembers(mems.members);
      } catch {
        // Continue
      }

      // Tasks
      const tasksRes = await apiClient.getTasks(organizationId, projectId, {
        limit: 100,
      });
      setTasks(tasksRes.items);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to load project workspace";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reload single task (useful for OCC 409 conflict resolution)
  const handleReloadSingleTask = async (
    taskId: string,
  ): Promise<TaskResponse | null> => {
    try {
      const updated = await apiClient.getTask(
        organizationId,
        projectId,
        taskId,
      );
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
      if (detailTask && detailTask.id === taskId) {
        setDetailTask(updated);
      }
      return updated;
    } catch {
      return null;
    }
  };

  // Submit create or edit task
  const handleTaskSubmit = async (data: CreateTaskInput | UpdateTaskInput) => {
    if (editingTask) {
      const updated = await apiClient.updateTask(
        organizationId,
        projectId,
        editingTask.id,
        data as UpdateTaskInput,
      );
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      if (detailTask?.id === updated.id) {
        setDetailTask(updated);
      }
    } else {
      const created = await apiClient.createTask(
        organizationId,
        projectId,
        data as CreateTaskInput,
      );
      setTasks((prev) => [...prev, created]);
    }
  };

  // Delete task
  const handleDeleteTask = async (taskId: string) => {
    if (
      !window.confirm("Are you sure you want to permanently delete this task?")
    )
      return;
    try {
      await apiClient.deleteTask(organizationId, projectId, taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      if (detailTask?.id === taskId) {
        setIsDetailModalOpen(false);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete task");
    }
  };

  // Quick move status
  const handleQuickMove = async (
    task: TaskResponse,
    newStatus: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE",
  ) => {
    if (movingTaskId === task.id) return;
    try {
      setMovingTaskId(task.id);
      setOccConflictNotice(null);
      const updated = await apiClient.moveTask(
        organizationId,
        projectId,
        task.id,
        {
          status: newStatus,
          position: task.position,
          version: task.version,
        },
      );
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
      if (detailTask?.id === task.id) {
        setDetailTask(updated);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setOccConflictNotice(
          `Task "${task.title}" was modified concurrently by another user. Reloading latest task state...`,
        );
        handleReloadSingleTask(task.id);
      } else {
        alert(err instanceof Error ? err.message : "Failed to move task");
      }
    } finally {
      setMovingTaskId(null);
    }
  };

  // Filter tasks locally
  const filteredTasks = tasks.filter((t) => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (priorityFilter && t.priority !== priorityFilter) return false;
    if (assigneeFilter) {
      if (assigneeFilter === "unassigned" && t.assigneeId) return false;
      if (assigneeFilter !== "unassigned" && t.assigneeId !== assigneeFilter)
        return false;
    }
    if (
      searchQuery &&
      !t.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !t.description?.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const hasActiveFilters = Boolean(
    statusFilter || priorityFilter || assigneeFilter || searchQuery,
  );

  const clearAllFilters = () => {
    setStatusFilter("");
    setPriorityFilter("");
    setAssigneeFilter("");
    setSearchQuery("");
  };

  const priorityStyles = {
    LOW: "bg-sky-500/10 text-sky-400 border-sky-500/30",
    MEDIUM: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    HIGH: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    URGENT: "bg-rose-500/10 text-rose-400 border-rose-500/30",
  };


  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar
        organizationId={organizationId}
        organizationName="Organization"
        activeTab="projects"
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
          <span className="text-slate-200 font-medium">
            {project?.name || "Workspace"}
          </span>
        </div>

        {/* Project Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                {project?.name || "Loading..."}
              </h1>
              {project && (
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                    project.status === "ACTIVE"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                  }`}
                >
                  {project.status}
                </span>
              )}
            </div>
            {project?.description && (
              <p className="text-sm text-slate-400 mt-1 max-w-2xl">
                {project.description}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {project && (
              <button
                type="button"
                onClick={() => setIsProjectSettingsOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-medium transition-colors"
                title="Project Settings & Lifecycle"
              >
                <Settings className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">Settings</span>
              </button>
            )}

            {project?.status === "ARCHIVED" && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium">
                <Archive className="w-4 h-4" />
                <span>Archived (Read-Only)</span>
              </div>
            )}

            {project?.status === "ACTIVE" && (
              <button
                type="button"
                onClick={() => {
                  setEditingTask(null);
                  setIsTaskModalOpen(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold transition-colors shadow-lg shadow-emerald-500/20"
              >
                <Plus className="w-4 h-4" />
                <span>New Task</span>
              </button>
            )}
          </div>
        </div>

        {/* OCC Conflict Notice */}
        {occConflictNotice && (
          <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{occConflictNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setOccConflictNotice(null)}
              className="text-[11px] underline hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Control Toolbar */}
        <div className="mt-6 flex flex-col lg:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            {/* Search */}
            <div className="relative w-full sm:w-56">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter tasks by status"
              className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-medium text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="">All Statuses</option>
              <option value="TODO">To Do</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="IN_REVIEW">In Review</option>
              <option value="DONE">Done</option>
            </select>

            {/* Priority filter */}
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              aria-label="Filter tasks by priority"
              className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-medium text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="">All Priorities</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>

            {/* Assignee filter */}
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              aria-label="Filter tasks by assignee"
              className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-medium text-slate-200 focus:outline-none focus:border-emerald-500 max-w-[160px]"
            >
              <option value="">All Assignees</option>
              <option value="unassigned">Unassigned</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.user?.displayName || m.user?.email}
                </option>
              ))}
            </select>

            {/* Clear filters button */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 transition-colors flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                <span>Clear filters</span>
              </button>
            )}
          </div>


          {/* View Mode Toggle */}
          <div className="flex items-center p-1 bg-slate-900 border border-slate-800 rounded-lg shrink-0">
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === "kanban"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Board</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === "table"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
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

        {/* Workspace Content */}
        <div className="mt-6 flex-1">
          {isLoading ? (
            <div className="py-24 flex flex-col items-center justify-center text-slate-500 text-sm">
              <Loader2 className="w-8 h-8 animate-spin mb-3 text-emerald-400" />
              <span>Loading project tasks...</span>
            </div>
          ) : viewMode === "kanban" ? (
            /* KANBAN BOARD VIEW */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
              {KANBAN_COLUMNS.map((column) => {
                const columnTasks = filteredTasks.filter(
                  (t) => t.status === column.id,
                );
                return (
                  <div
                    key={column.id}
                    className={`rounded-xl border ${column.color} p-4 flex flex-col min-h-[500px]`}
                  >
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800/80">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-white">
                          {column.label}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-slate-800 text-slate-400">
                          {columnTasks.length}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3 flex-1">
                      {columnTasks.length === 0 ? (
                        <div className="py-8 text-center text-xs text-slate-600 italic">
                          No tasks
                        </div>
                      ) : (
                        columnTasks.map((task) => {
                          const isOverdue =
                            task.dueDate &&
                            task.status !== "DONE" &&
                            new Date(task.dueDate) < new Date();

                          return (
                            <div
                              key={task.id}
                              onClick={() => {
                                setDetailTask(task);
                                setIsDetailModalOpen(true);
                              }}
                              className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 hover:border-slate-700 transition-all shadow-sm cursor-pointer group space-y-2.5"
                            >
                              <div className="flex items-center justify-between">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${priorityStyles[task.priority]}`}
                                >
                                  {task.priority}
                                </span>
                                <span className="text-[10px] font-mono text-slate-500">
                                  v{task.version}
                                </span>
                              </div>

                              <h4 className="text-sm font-medium text-slate-100 group-hover:text-emerald-400 transition-colors line-clamp-2">
                                {task.title}
                              </h4>

                              {task.description && (
                                <p className="text-xs text-slate-400 line-clamp-2">
                                  {task.description}
                                </p>
                              )}

                              <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
                                <div className="flex items-center gap-1.5">
                                  <User className="w-3.5 h-3.5 text-slate-500" />
                                  <span className="text-[11px] line-clamp-1 max-w-[100px]">
                                    {task.assignee?.displayName || "Unassigned"}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  {task.dueDate && (
                                    <div
                                      className={`flex items-center gap-1 text-[11px] ${
                                        isOverdue
                                          ? "text-rose-400 font-semibold"
                                          : "text-slate-500"
                                      }`}
                                    >
                                      {isOverdue && (
                                        <AlertTriangle className="w-3 h-3" />
                                      )}
                                      <span>
                                        {new Date(
                                          task.dueDate,
                                        ).toLocaleDateString(undefined, {
                                          month: "short",
                                          day: "numeric",
                                        })}
                                      </span>
                                    </div>
                                  )}

                                  {(task.commentCount ?? 0) > 0 && (
                                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                                      <MessageSquare className="w-3 h-3" />
                                      <span>{task.commentCount}</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Quick Move Status Buttons */}
                              {project?.status === "ACTIVE" && (
                                <div
                                  className="pt-1 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {column.id !== "TODO" && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleQuickMove(task, "TODO")
                                      }
                                      className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300"
                                      title="Move to To Do"
                                    >
                                      ← Todo
                                    </button>
                                  )}
                                  {column.id !== "IN_PROGRESS" && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleQuickMove(task, "IN_PROGRESS")
                                      }
                                      className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300"
                                      title="Move to In Progress"
                                    >
                                      Progress
                                    </button>
                                  )}
                                  {column.id !== "DONE" && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleQuickMove(task, "DONE")
                                      }
                                      className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300"
                                      title="Mark Done"
                                    >
                                      Done ✓
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* TABLE VIEW */
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 font-medium uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Title</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Priority</th>
                      <th className="py-3 px-4">Assignee</th>
                      <th className="py-3 px-4">Due Date</th>
                      <th className="py-3 px-4">Version</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredTasks.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="py-12 text-center text-slate-500"
                        >
                          No tasks match current filters.
                        </td>
                      </tr>
                    ) : (
                      filteredTasks.map((task) => {
                        const isOverdue =
                          task.dueDate &&
                          task.status !== "DONE" &&
                          new Date(task.dueDate) < new Date();

                        return (
                          <tr
                            key={task.id}
                            onClick={() => {
                              setDetailTask(task);
                              setIsDetailModalOpen(true);
                            }}
                            className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                          >
                            <td className="py-3 px-4 font-medium text-slate-200">
                              <div className="flex items-center gap-2">
                                <span>{task.title}</span>
                                {(task.commentCount ?? 0) > 0 && (
                                  <span className="flex items-center gap-0.5 text-[10px] text-slate-500">
                                    <MessageSquare className="w-3 h-3" />
                                    <span>{task.commentCount}</span>
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-300">
                                {task.status.replace("_", " ")}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${priorityStyles[task.priority]}`}
                              >
                                {task.priority}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-400">
                              {task.assignee?.displayName || "Unassigned"}
                            </td>
                            <td className="py-3 px-4">
                              {task.dueDate ? (
                                <span
                                  className={
                                    isOverdue
                                      ? "text-rose-400 font-semibold"
                                      : "text-slate-400"
                                  }
                                >
                                  {new Date(task.dueDate).toLocaleDateString()}
                                </span>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-500">
                              v{task.version}
                            </td>
                            <td
                              className="py-3 px-4 text-right"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingTask(task);
                                    setIsTaskModalOpen(true);
                                  }}
                                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
                                  aria-label="Edit task"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTask(task.id)}
                                  className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800"
                                  aria-label="Delete task"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Create / Edit Task Modal */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setEditingTask(null);
        }}
        onSubmit={handleTaskSubmit}
        initialTask={editingTask}
        members={members}
        onReloadTask={handleReloadSingleTask}
      />

      {/* Task Details Drawer / Modal with Comments & Activity */}
      <TaskDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setDetailTask(null);
        }}
        task={detailTask}
        organizationId={organizationId}
        projectId={projectId}
        currentUserId={currentUserId}
        onEditTask={(t) => {
          setIsDetailModalOpen(false);
          setEditingTask(t);
          setIsTaskModalOpen(true);
        }}
      />

      {/* Project Settings & Lifecycle Modal */}
      {project && (
        <ProjectSettingsModal
          isOpen={isProjectSettingsOpen}
          onClose={() => setIsProjectSettingsOpen(false)}
          project={project}
          organizationId={organizationId}
          onProjectUpdated={(updated) => setProject(updated)}
        />
      )}
    </div>
  );
}

