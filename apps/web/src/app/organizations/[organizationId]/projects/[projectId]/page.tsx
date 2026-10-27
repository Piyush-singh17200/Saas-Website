"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
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
  CheckCircle2,
  Calendar,
  Tag as TagIcon,
} from "lucide-react";

import type {
  ProjectResponse,
  TaskResponse,
  CreateTaskInput,
  UpdateTaskInput,
  MembershipResponse,
  MembershipRoleType,
  TagResponse,
} from "@workspace/contracts";
import { apiClient, ApiError } from "../../../../../lib/api-client";
import { Navbar } from "../../../../../components/Navbar";
import { TaskModal } from "../../../../../components/TaskModal";
import { TaskDetailModal } from "../../../../../components/TaskDetailModal";
import { ProjectSettingsModal } from "../../../../../components/ProjectSettingsModal";
import { TagManagerModal } from "../../../../../components/TagManagerModal";
import { AccessRestrictedState } from "../../../../../components/AccessRestrictedState";

const KANBAN_COLUMNS: Array<{
  id: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
  label: string;
  color: string;
  activeBorder: string;
}> = [
  {
    id: "TODO",
    label: "To Do",
    color: "border-slate-800 bg-slate-900/40",
    activeBorder: "border-slate-500 bg-slate-900/70",
  },
  {
    id: "IN_PROGRESS",
    label: "In Progress",
    color: "border-indigo-500/20 bg-indigo-500/5",
    activeBorder: "border-indigo-500/60 bg-indigo-500/10",
  },
  {
    id: "IN_REVIEW",
    label: "In Review",
    color: "border-purple-500/20 bg-purple-500/5",
    activeBorder: "border-purple-500/60 bg-purple-500/10",
  },
  {
    id: "DONE",
    label: "Done",
    color: "border-emerald-500/20 bg-emerald-500/5",
    activeBorder: "border-emerald-500/60 bg-emerald-500/10",
  },
];

export default function ProjectWorkspacePage() {
  const params = useParams();
  const searchParams = useSearchParams();
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
  const [isAccessRestricted, setIsAccessRestricted] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // View state: 'kanban' or 'table' (initialized from URL if present)
  const [viewMode, setViewMode] = useState<"kanban" | "table">(
    (searchParams?.get("view") as "kanban" | "table") || "kanban",
  );

  // Filters (initialized from URL search parameters)
  const [searchQuery, setSearchQuery] = useState(
    searchParams?.get("search") || "",
  );
  const [statusFilter, setStatusFilter] = useState<string>(
    searchParams?.get("status") || "",
  );
  const [priorityFilter, setPriorityFilter] = useState<string>(
    searchParams?.get("priority") || "",
  );
  const [assigneeFilter, setAssigneeFilter] = useState<string>(
    searchParams?.get("assignee") || "",
  );
  const [tagFilter, setTagFilter] = useState<string>(
    searchParams?.get("tag") || "",
  );
  const [isOverdueFilter, setIsOverdueFilter] = useState<boolean>(
    searchParams?.get("overdue") === "true",
  );
  const [sortBy, setSortBy] = useState<string>(
    searchParams?.get("sortBy") || "position",
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(
    (searchParams?.get("sortOrder") as "asc" | "desc") || "asc",
  );

  // Available tags in organization
  const [availableTags, setAvailableTags] = useState<TagResponse[]>([]);
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);

  // Drag-and-drop state
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  // Moving task indicator for OCC duplicate prevention
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);
  const [occConflictNotice, setOccConflictNotice] = useState<string | null>(
    null,
  );

  // Modals
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskResponse | null>(null);
  const [detailTask, setDetailTask] = useState<TaskResponse | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [confirmDeleteTask, setConfirmDeleteTask] =
    useState<TaskResponse | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Synchronize filter parameters to URL without page reload
  useEffect(() => {
    const urlParams = new URLSearchParams();
    if (statusFilter) urlParams.set("status", statusFilter);
    if (priorityFilter) urlParams.set("priority", priorityFilter);
    if (assigneeFilter) urlParams.set("assignee", assigneeFilter);
    if (tagFilter) urlParams.set("tag", tagFilter);
    if (isOverdueFilter) urlParams.set("overdue", "true");
    if (searchQuery.trim()) urlParams.set("search", searchQuery.trim());
    if (sortBy !== "position") urlParams.set("sortBy", sortBy);
    if (sortOrder !== "asc") urlParams.set("sortOrder", sortOrder);
    if (viewMode !== "kanban") urlParams.set("view", viewMode);

    const qs = urlParams.toString();
    const newPath = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;

    window.history.replaceState(null, "", newPath);
  }, [
    statusFilter,
    priorityFilter,
    assigneeFilter,
    tagFilter,
    isOverdueFilter,
    searchQuery,
    sortBy,
    sortOrder,
    viewMode,
  ]);

  // Keyboard escape handler for modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && confirmDeleteTask) {
        setConfirmDeleteTask(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmDeleteTask]);

  // Load user, project, members, tags, tasks
  const loadData = useCallback(async () => {
    if (!organizationId || !projectId) return;
    try {
      setIsLoading(true);
      setError(null);
      setIsAccessRestricted(false);

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

      // Tags
      try {
        const tagsRes = await apiClient.getTags(organizationId);
        setAvailableTags(tagsRes.tags);
      } catch {
        // Continue
      }

      // Tasks
      const tasksRes = await apiClient.getTasks(organizationId, projectId, {
        limit: 100,
      });
      setTasks(tasksRes.items);
    } catch (err: unknown) {
      if (
        err instanceof ApiError &&
        (err.status === 403 || err.status === 404)
      ) {
        setIsAccessRestricted(true);
      } else {
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to load project workspace";
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, projectId]);

  const loadTags = async () => {
    try {
      const tagsRes = await apiClient.getTags(organizationId);
      setAvailableTags(tagsRes.tags);
    } catch {
      // Continue
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Current user's membership role
  const currentUserRole: MembershipRoleType = useMemo(() => {
    if (!currentUserId || !members.length) return "MEMBER";
    const mem = members.find((m) => m.userId === currentUserId);
    return mem ? mem.role : "MEMBER";
  }, [currentUserId, members]);

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
      setSuccessMessage("Task updated successfully");
      setTimeout(() => setSuccessMessage(null), 3000);
    } else {
      const created = await apiClient.createTask(
        organizationId,
        projectId,
        data as CreateTaskInput,
      );
      setTasks((prev) => [...prev, created]);
      setSuccessMessage("Task created successfully");
      setTimeout(() => setSuccessMessage(null), 3000);
    }
  };

  // Delete task after modal confirmation
  const handleConfirmDelete = async () => {
    if (!confirmDeleteTask) return;
    try {
      setIsDeleting(true);
      await apiClient.deleteTask(
        organizationId,
        projectId,
        confirmDeleteTask.id,
      );
      setTasks((prev) => prev.filter((t) => t.id !== confirmDeleteTask.id));
      if (detailTask?.id === confirmDeleteTask.id) {
        setIsDetailModalOpen(false);
      }
      setConfirmDeleteTask(null);
      setSuccessMessage("Task deleted");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete task");
    } finally {
      setIsDeleting(false);
    }
  };

  // Move task status with Optimistic Concurrency Control (OCC)
  const handleQuickMove = async (
    task: TaskResponse,
    newStatus: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE",
  ) => {
    if (movingTaskId === task.id || task.status === newStatus) return;
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
          `Task "${task.title}" was updated concurrently by another user. Reloading latest task state...`,
        );
        handleReloadSingleTask(task.id);
      } else {
        setError(
          err instanceof Error ? err.message : "Failed to update task status",
        );
      }
    } finally {
      setMovingTaskId(null);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, task: TaskResponse) => {
    if (project?.status !== "ACTIVE") return;
    e.dataTransfer.setData("text/plain", task.id);
    e.dataTransfer.effectAllowed = "move";
    setDraggedTaskId(task.id);
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverColumn !== columnId) {
      setDragOverColumn(columnId);
    }
  };

  const handleDragLeave = (columnId: string) => {
    if (dragOverColumn === columnId) {
      setDragOverColumn(null);
    }
  };

  const handleDrop = async (
    columnId: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE",
  ) => {
    setDragOverColumn(null);
    if (!draggedTaskId) return;
    const task = tasks.find((t) => t.id === draggedTaskId);
    setDraggedTaskId(null);
    if (!task || task.status === columnId) return;
    await handleQuickMove(task, columnId);
  };

  // Filter & sort tasks
  const filteredTasks = useMemo(() => {
    const list = tasks.filter((t) => {
      if (statusFilter && t.status !== statusFilter) return false;
      if (priorityFilter && t.priority !== priorityFilter) return false;
      if (assigneeFilter) {
        if (assigneeFilter === "unassigned" && t.assigneeId) return false;
        if (assigneeFilter !== "unassigned" && t.assigneeId !== assigneeFilter)
          return false;
      }
      if (tagFilter && !t.tags?.some((tg) => tg.id === tagFilter)) {
        return false;
      }
      if (isOverdueFilter) {
        const isOv =
          t.isOverdue ||
          (t.dueDate &&
            t.status !== "DONE" &&
            new Date(t.dueDate) < new Date());
        if (!isOv) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesDesc = t.description?.toLowerCase().includes(q);
        const matchesId = t.id.toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc && !matchesId) return false;
      }
      return true;
    });

    // Deterministic sorting with stable tie-breaker
    return list.sort((a, b) => {
      if (sortBy === "dueDate") {
        if (!a.dueDate && !b.dueDate) return a.id.localeCompare(b.id);
        if (!a.dueDate) return sortOrder === "asc" ? 1 : -1;
        if (!b.dueDate) return sortOrder === "asc" ? -1 : 1;
        const diff =
          new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        if (diff !== 0) return sortOrder === "asc" ? diff : -diff;
      } else if (sortBy === "priority") {
        const priorityOrder: Record<string, number> = {
          URGENT: 4,
          HIGH: 3,
          MEDIUM: 2,
          LOW: 1,
        };
        const diff =
          (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
        if (diff !== 0) return sortOrder === "asc" ? -diff : diff;
      } else if (sortBy === "title") {
        const diff = a.title.localeCompare(b.title);
        if (diff !== 0) return sortOrder === "asc" ? diff : -diff;
      } else if (sortBy === "createdAt") {
        const diff =
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        if (diff !== 0) return sortOrder === "asc" ? diff : -diff;
      } else {
        const diff = a.position - b.position;
        if (diff !== 0) return sortOrder === "asc" ? diff : -diff;
      }
      return a.id.localeCompare(b.id);
    });
  }, [
    tasks,
    statusFilter,
    priorityFilter,
    assigneeFilter,
    tagFilter,
    isOverdueFilter,
    searchQuery,
    sortBy,
    sortOrder,
  ]);

  const hasActiveFilters = Boolean(
    statusFilter ||
    priorityFilter ||
    assigneeFilter ||
    tagFilter ||
    isOverdueFilter ||
    searchQuery.trim() ||
    sortBy !== "position" ||
    sortOrder !== "asc",
  );

  const clearAllFilters = () => {
    setStatusFilter("");
    setPriorityFilter("");
    setAssigneeFilter("");
    setTagFilter("");
    setIsOverdueFilter(false);
    setSearchQuery("");
    setSortBy("position");
    setSortOrder("asc");
  };

  const priorityStyles = {
    LOW: "bg-sky-500/10 text-sky-400 border-sky-500/30",
    MEDIUM: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    HIGH: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    URGENT: "bg-rose-500/10 text-rose-400 border-rose-500/30",
  };

  if (isAccessRestricted) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <Navbar activeTab="projects" />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <AccessRestrictedState
            backHref={`/organizations/${organizationId}/projects`}
            backLabel="Back to Projects"
          />
        </main>
      </div>
    );
  }

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
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                title="Project Settings & Lifecycle"
              >
                <Settings className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">Settings</span>
              </button>
            )}

            {project?.status === "ARCHIVED" && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium">
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
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold transition-colors shadow-lg shadow-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <Plus className="w-4 h-4" />
                <span>Create Task</span>
              </button>
            )}
          </div>
        </div>

        {/* OCC Conflict Notice */}
        {occConflictNotice && (
          <div className="mt-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{occConflictNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setOccConflictNotice(null)}
              className="text-xs underline hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Success Alert */}
        {successMessage && (
          <div className="mt-4 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mt-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center justify-between">
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

        {/* Control Toolbar */}
        <div className="mt-6 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            {/* Search */}
            <div className="relative w-full sm:w-60">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search task title or description..."
                aria-label="Search tasks"
                className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter tasks by status"
              className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-medium text-slate-200 focus:outline-none focus:border-emerald-500"
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
              className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-medium text-slate-200 focus:outline-none focus:border-emerald-500"
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
              className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-medium text-slate-200 focus:outline-none focus:border-emerald-500 max-w-[170px]"
            >
              <option value="">All Assignees</option>
              <option value="unassigned">Unassigned</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.user?.displayName || m.user?.email}
                </option>
              ))}
            </select>

            {/* Tag filter */}
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              aria-label="Filter tasks by tag"
              className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-medium text-slate-200 focus:outline-none focus:border-emerald-500 max-w-[140px]"
            >
              <option value="">All Tags</option>
              {availableTags.map((tg) => (
                <option key={tg.id} value={tg.id}>
                  {tg.name}
                </option>
              ))}
            </select>

            {/* Overdue filter toggle */}
            <button
              type="button"
              onClick={() => setIsOverdueFilter((prev) => !prev)}
              aria-pressed={isOverdueFilter}
              className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 border ${
                isOverdueFilter
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/50 ring-1 ring-rose-500/40"
                  : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800"
              }`}
            >
              <AlertTriangle
                className={`w-3.5 h-3.5 ${
                  isOverdueFilter ? "text-rose-400" : "text-slate-500"
                }`}
              />
              <span>Overdue</span>
            </button>

            {/* Sort controls */}
            <select
              value={`${sortBy}:${sortOrder}`}
              onChange={(e) => {
                const parts = e.target.value.split(":");
                const sb = parts[0] || "position";
                const so = (parts[1] as "asc" | "desc") || "asc";
                setSortBy(sb);
                setSortOrder(so);
              }}
              aria-label="Sort tasks"
              className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-medium text-slate-200 focus:outline-none focus:border-emerald-500 max-w-[170px]"
            >
              <option value="position:asc">Sort: Board Order</option>
              <option value="dueDate:asc">Sort: Due Date (Earliest)</option>
              <option value="dueDate:desc">Sort: Due Date (Latest)</option>
              <option value="priority:asc">
                Sort: Priority (Urgent first)
              </option>
              <option value="title:asc">Sort: Title (A-Z)</option>
              <option value="createdAt:desc">Sort: Newest First</option>
            </select>

            {/* Manage Tags button */}
            <button
              type="button"
              onClick={() => setIsTagManagerOpen(true)}
              title="Manage Organization Tags"
              className="px-2.5 py-2 rounded-xl text-xs text-slate-400 hover:text-white bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-colors flex items-center gap-1.5"
            >
              <TagIcon className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Tags</span>
            </button>

            {/* Clear filters button */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800 transition-colors flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear filters</span>
              </button>
            )}
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 hidden sm:inline">
              Showing{" "}
              <strong className="text-white">{filteredTasks.length}</strong> of{" "}
              {tasks.length} tasks
            </span>

            <div className="flex items-center p-1 bg-slate-900 border border-slate-800 rounded-xl shrink-0">
              <button
                type="button"
                onClick={() => setViewMode("kanban")}
                aria-pressed={viewMode === "kanban"}
                aria-label="Kanban board view"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
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
                aria-pressed={viewMode === "table"}
                aria-label="Table list view"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
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
        </div>

        {/* Workspace Content */}
        <div className="mt-6 flex-1">
          {isLoading ? (
            <div className="py-24 flex flex-col items-center justify-center text-slate-500 text-sm">
              <Loader2 className="w-8 h-8 animate-spin mb-3 text-emerald-400" />
              <span>Loading project tasks...</span>
            </div>
          ) : tasks.length === 0 ? (
            /* Empty State: No tasks in project */
            <div className="py-20 rounded-2xl border border-dashed border-slate-800 bg-slate-900/20 text-center flex flex-col items-center justify-center p-6 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <LayoutGrid className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-white">
                No tasks created yet
              </h3>
              <p className="text-xs text-slate-400 max-w-sm">
                Get started by creating your first task to plan, track, and
                collaborate on this project.
              </p>
              {project?.status === "ACTIVE" && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingTask(null);
                    setIsTaskModalOpen(true);
                  }}
                  className="mt-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold transition-colors shadow-lg shadow-emerald-500/20 flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create First Task</span>
                </button>
              )}
            </div>
          ) : filteredTasks.length === 0 ? (
            /* Empty State: No tasks match filters */
            <div className="py-16 rounded-2xl border border-dashed border-slate-800 bg-slate-900/20 text-center flex flex-col items-center justify-center p-6 space-y-3">
              <Search className="w-8 h-8 text-slate-600" />
              <h3 className="text-base font-semibold text-white">
                No tasks match your filters
              </h3>
              <p className="text-xs text-slate-400 max-w-sm">
                Try adjusting your search terms, status, priority, or assignee
                filter to find what you&apos;re looking for.
              </p>
              <button
                type="button"
                onClick={clearAllFilters}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white transition-colors"
              >
                Clear all filters
              </button>
            </div>
          ) : viewMode === "kanban" ? (
            /* KANBAN BOARD VIEW WITH ACCESSIBLE DRAG & DROP AND KEYBOARD CONTROLS */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
              {KANBAN_COLUMNS.map((column) => {
                const columnTasks = filteredTasks.filter(
                  (t) => t.status === column.id,
                );
                const isColumnActive = dragOverColumn === column.id;

                return (
                  <div
                    key={column.id}
                    onDragOver={(e) => handleDragOver(e, column.id)}
                    onDragLeave={() => handleDragLeave(column.id)}
                    onDrop={() => handleDrop(column.id)}
                    className={`rounded-2xl border transition-all p-4 flex flex-col min-h-[520px] ${
                      isColumnActive ? column.activeBorder : column.color
                    }`}
                  >
                    {/* Column Header */}
                    <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-slate-800/80">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-white">
                          {column.label}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-slate-800 text-slate-300">
                          {columnTasks.length}
                        </span>
                      </div>
                    </div>

                    {/* Column Cards */}
                    <div className="space-y-3 flex-1">
                      {columnTasks.length === 0 ? (
                        <div className="py-12 text-center text-xs text-slate-600 italic border border-dashed border-slate-800/60 rounded-xl">
                          No tasks in {column.label}
                        </div>
                      ) : (
                        columnTasks.map((task) => {
                          const isOverdue =
                            task.dueDate &&
                            task.status !== "DONE" &&
                            new Date(task.dueDate) < new Date();
                          const isCardMoving = movingTaskId === task.id;

                          return (
                            <div
                              key={task.id}
                              draggable={
                                project?.status === "ACTIVE" && !isCardMoving
                              }
                              onDragStart={(e) => handleDragStart(e, task)}
                              onClick={() => {
                                setDetailTask(task);
                                setIsDetailModalOpen(true);
                              }}
                              className={`bg-slate-900 border border-slate-800 rounded-xl p-3.5 hover:border-slate-700 transition-all shadow-md cursor-pointer group space-y-3 ${
                                isCardMoving
                                  ? "opacity-50 pointer-events-none"
                                  : ""
                              } ${
                                draggedTaskId === task.id
                                  ? "opacity-40 border-dashed border-emerald-500"
                                  : ""
                              }`}
                            >
                              {/* Top Meta: Priority, Overdue & OCC Version */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${priorityStyles[task.priority]}`}
                                  >
                                    {task.priority}
                                  </span>
                                  {isOverdue && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-0.5">
                                      <AlertTriangle className="w-2.5 h-2.5" />
                                      Overdue
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] font-mono text-slate-500">
                                  v{task.version}
                                </span>
                              </div>

                              {/* Title & Tags */}
                              <div>
                                <h4 className="text-sm font-medium text-slate-100 group-hover:text-emerald-400 transition-colors line-clamp-2">
                                  {task.title}
                                </h4>
                                {task.tags && task.tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {task.tags.map((tg) => (
                                      <span
                                        key={tg.id}
                                        className="px-1.5 py-0.5 rounded text-[10px] font-medium border"
                                        style={{
                                          backgroundColor: `${tg.color}15`,
                                          borderColor: `${tg.color}40`,
                                          color: tg.color,
                                        }}
                                      >
                                        {tg.name}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Description Preview */}
                              {task.description && (
                                <p className="text-xs text-slate-400 line-clamp-2">
                                  {task.description}
                                </p>
                              )}

                              {/* Footer Meta: Assignee, Due Date, Comments */}
                              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                                <div className="flex items-center gap-1.5">
                                  <User className="w-3.5 h-3.5 text-slate-500" />
                                  <span className="text-[11px] line-clamp-1 max-w-[90px]">
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
                                      {isOverdue ? (
                                        <AlertTriangle className="w-3 h-3 shrink-0" />
                                      ) : (
                                        <Calendar className="w-3 h-3 shrink-0" />
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

                              {/* Accessible Status Change Controls (Keyboard-First + Click Alternative) */}
                              {project?.status === "ACTIVE" && (
                                <div
                                  className="pt-2 border-t border-slate-800/60 flex items-center justify-between gap-2"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {/* Accessible native select */}
                                  <div className="flex items-center gap-1.5 flex-1">
                                    <label
                                      htmlFor={`select-status-${task.id}`}
                                      className="sr-only"
                                    >
                                      Change status for {task.title}
                                    </label>
                                    <select
                                      id={`select-status-${task.id}`}
                                      value={task.status}
                                      disabled={isCardMoving}
                                      onChange={(e) =>
                                        handleQuickMove(
                                          task,
                                          e.target.value as any,
                                        )
                                      }
                                      className="w-full px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-[11px] font-medium text-slate-300 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                                    >
                                      <option value="TODO">To Do</option>
                                      <option value="IN_PROGRESS">
                                        In Progress
                                      </option>
                                      <option value="IN_REVIEW">
                                        In Review
                                      </option>
                                      <option value="DONE">Done</option>
                                    </select>
                                  </div>

                                  {/* Delete task button */}
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteTask(task)}
                                    title="Delete task"
                                    aria-label={`Delete task ${task.title}`}
                                    className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-400"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
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
            <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-900/40 shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <caption className="sr-only">Project Tasks List View</caption>
                  <thead className="bg-slate-950/60 text-slate-400 font-medium uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3.5 px-5">Title</th>
                      <th className="py-3.5 px-5">Status</th>
                      <th className="py-3.5 px-5">Priority</th>
                      <th className="py-3.5 px-5">Assignee</th>
                      <th className="py-3.5 px-5">Due Date</th>
                      <th className="py-3.5 px-5">Version</th>
                      <th className="py-3.5 px-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredTasks.map((task) => {
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
                          className="hover:bg-slate-800/30 cursor-pointer transition-colors"
                        >
                          <td className="py-3.5 px-5 font-medium text-slate-200">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <span>{task.title}</span>
                                {(task.commentCount ?? 0) > 0 && (
                                  <span className="flex items-center gap-0.5 text-[10px] text-slate-500">
                                    <MessageSquare className="w-3 h-3" />
                                    <span>{task.commentCount}</span>
                                  </span>
                                )}
                              </div>
                              {task.tags && task.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {task.tags.map((tg) => (
                                    <span
                                      key={tg.id}
                                      className="px-1.5 py-0.2 rounded text-[10px] font-medium border"
                                      style={{
                                        backgroundColor: `${tg.color}15`,
                                        borderColor: `${tg.color}40`,
                                        color: tg.color,
                                      }}
                                    >
                                      {tg.name}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                          <td
                            className="py-3.5 px-5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <select
                              value={task.status}
                              disabled={
                                movingTaskId === task.id ||
                                project?.status !== "ACTIVE"
                              }
                              onChange={(e) =>
                                handleQuickMove(task, e.target.value as any)
                              }
                              aria-label={`Change status for ${task.title}`}
                              className="px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs font-medium text-slate-200 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                            >
                              <option value="TODO">To Do</option>
                              <option value="IN_PROGRESS">In Progress</option>
                              <option value="IN_REVIEW">In Review</option>
                              <option value="DONE">Done</option>
                            </select>
                          </td>
                          <td className="py-3.5 px-5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${priorityStyles[task.priority]}`}
                            >
                              {task.priority}
                            </span>
                          </td>
                          <td className="py-3.5 px-5 text-slate-400">
                            {task.assignee?.displayName || "Unassigned"}
                          </td>
                          <td className="py-3.5 px-5">
                            {task.dueDate ? (
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={
                                    isOverdue
                                      ? "text-rose-400 font-semibold"
                                      : "text-slate-400"
                                  }
                                >
                                  {new Date(task.dueDate).toLocaleDateString()}
                                </span>
                                {isOverdue && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                    Overdue
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="py-3.5 px-5 font-mono text-slate-500">
                            v{task.version}
                          </td>
                          <td
                            className="py-3.5 px-5 text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingTask(task);
                                  setIsTaskModalOpen(true);
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
                                aria-label={`Edit task ${task.title}`}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteTask(task)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-400"
                                aria-label={`Delete task ${task.title}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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
        availableTags={availableTags}
        onReloadTask={handleReloadSingleTask}
      />

      {/* Task Details Drawer / Modal with Comments, Attachments & Activity */}
      <TaskDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        task={detailTask}
        organizationId={organizationId}
        projectId={projectId}
        currentUserId={currentUserId}
        availableTags={availableTags}
        onTaskUpdated={(updated: TaskResponse) => {
          setTasks((prev) =>
            prev.map((t) => (t.id === updated.id ? updated : t)),
          );
          setDetailTask(updated);
        }}
        onEditTask={(t: TaskResponse) => {
          setIsDetailModalOpen(false);
          setEditingTask(t);
          setIsTaskModalOpen(true);
        }}
      />

      {/* Organization Tag Manager Modal */}
      <TagManagerModal
        isOpen={isTagManagerOpen}
        onClose={() => setIsTagManagerOpen(false)}
        organizationId={organizationId}
        tags={availableTags}
        onTagsUpdated={loadTags}
      />

      {/* Project Settings Modal */}
      {project && (
        <ProjectSettingsModal
          isOpen={isProjectSettingsOpen}
          onClose={() => setIsProjectSettingsOpen(false)}
          project={project}
          organizationId={organizationId}
          currentUserRole={currentUserRole}
          onProjectUpdated={(updated) => {
            setProject(updated);
          }}
        />
      )}

      {/* Confirm Task Delete Modal */}
      {confirmDeleteTask && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-task-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400 mb-3">
              <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/30">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3
                id="delete-task-modal-title"
                className="text-base font-semibold text-white"
              >
                Delete Task?
              </h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mb-5">
              Are you sure you want to permanently delete{" "}
              <strong className="text-white">
                &quot;{confirmDeleteTask.title}&quot;
              </strong>
              ? This action cannot be undone and will delete all task comments.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDeleteTask(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-500 hover:bg-rose-400 text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 flex items-center gap-1.5"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete Task</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
