"use client";

import React, { useState, useEffect } from "react";
import { X, Loader2, AlertCircle } from "lucide-react";
import type {
  TaskResponse,
  CreateTaskInput,
  UpdateTaskInput,
  MembershipResponse,
} from "@workspace/contracts";
import { ConflictBanner } from "./ConflictBanner";

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateTaskInput | UpdateTaskInput) => Promise<void>;
  initialTask?: TaskResponse | null;
  members: MembershipResponse[];
  onReloadTask?: (taskId: string) => Promise<TaskResponse | null>;
}

export function TaskModal({
  isOpen,
  onClose,
  onSubmit,
  initialTask,
  members,
  onReloadTask,
}: TaskModalProps) {
  const [title, setTitle] = useState(initialTask?.title || "");
  const [description, setDescription] = useState(
    initialTask?.description || "",
  );
  const [status, setStatus] = useState<
    "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE"
  >(initialTask?.status || "TODO");
  const [priority, setPriority] = useState<
    "LOW" | "MEDIUM" | "HIGH" | "URGENT"
  >(initialTask?.priority || "MEDIUM");
  const [assigneeId, setAssigneeId] = useState<string>(
    initialTask?.assigneeId || "",
  );
  const [dueDate, setDueDate] = useState<string>(
    initialTask?.dueDate
      ? new Date(initialTask.dueDate).toISOString().slice(0, 10)
      : "",
  );
  const [version, setVersion] = useState<number>(initialTask?.version || 1);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasConflict, setHasConflict] = useState(false);
  const [isReloading, setIsReloading] = useState(false);

  useEffect(() => {
    if (initialTask) {
      setTitle(initialTask.title);
      setDescription(initialTask.description || "");
      setStatus(initialTask.status);
      setPriority(initialTask.priority);
      setAssigneeId(initialTask.assigneeId || "");
      setDueDate(
        initialTask.dueDate
          ? new Date(initialTask.dueDate).toISOString().slice(0, 10)
          : "",
      );
      setVersion(initialTask.version);
      setHasConflict(false);
      setError(null);
    } else {
      setTitle("");
      setDescription("");
      setStatus("TODO");
      setPriority("MEDIUM");
      setAssigneeId("");
      setDueDate("");
      setVersion(1);
      setHasConflict(false);
      setError(null);
    }
  }, [initialTask, isOpen]);

  if (!isOpen) return null;

  const handleReload = async () => {
    if (!initialTask || !onReloadTask) return;
    try {
      setIsReloading(true);
      const updated = await onReloadTask(initialTask.id);
      if (updated) {
        setTitle(updated.title);
        setDescription(updated.description || "");
        setStatus(updated.status);
        setPriority(updated.priority);
        setAssigneeId(updated.assigneeId || "");
        setDueDate(
          updated.dueDate
            ? new Date(updated.dueDate).toISOString().slice(0, 10)
            : "",
        );
        setVersion(updated.version);
        setHasConflict(false);
        setError(null);
      }
    } catch {
      setError("Failed to reload latest task version.");
    } finally {
      setIsReloading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setHasConflict(false);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Task title is required.");
      return;
    }

    try {
      setIsSubmitting(true);
      if (initialTask) {
        const updatePayload: UpdateTaskInput = {
          title: trimmedTitle,
          description: description.trim() ? description.trim() : null,
          status,
          priority,
          assigneeId: assigneeId ? assigneeId : null,
          dueDate: dueDate ? new Date(dueDate).toISOString() : null,
          version,
        };
        await onSubmit(updatePayload);
      } else {
        const createPayload: CreateTaskInput = {
          title: trimmedTitle,
          description: description.trim() ? description.trim() : null,
          status,
          priority,
          assigneeId: assigneeId ? assigneeId : null,
          dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        };
        await onSubmit(createPayload);
      }
      onClose();
    } catch (err: unknown) {
      if (
        err &&
        typeof err === "object" &&
        "status" in err &&
        (err as { status: number }).status === 409
      ) {
        setHasConflict(true);
      } else {
        const msg = err instanceof Error ? err.message : "Failed to save task";
        setError(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 text-slate-100 max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
      >
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <h2
              id="task-modal-title"
              className="text-lg font-semibold text-white"
            >
              {initialTask ? "Edit Task" : "Create New Task"}
            </h2>
            {initialTask && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 border border-slate-700 text-slate-400">
                v{version}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {hasConflict && (
          <div className="mt-4">
            <ConflictBanner onReload={handleReload} isReloading={isReloading} />
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Title <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Implement Row-Level Security policies"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) =>
                  setStatus(
                    e.target.value as
                      "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE",
                  )
                }
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
              >
                <option value="TODO">To Do</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="IN_REVIEW">In Review</option>
                <option value="DONE">Done</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) =>
                  setPriority(
                    e.target.value as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
                  )
                }
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Assignee
              </label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.user?.displayName || m.user?.email || m.userId} ({m.role}
                    )
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Description{" "}
              <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed task specifications and acceptance criteria..."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors resize-none"
            />
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || hasConflict}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{initialTask ? "Update Task" : "Create Task"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
