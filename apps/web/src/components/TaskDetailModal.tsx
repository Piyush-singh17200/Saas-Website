"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  Calendar,
  User,
  Clock,
  MessageSquare,
  Activity,
  Send,
  Trash2,
  Edit2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import type {
  TaskResponse,
  CommentResponse,
  ActivityLogResponse,
} from "@workspace/contracts";
import { apiClient } from "../lib/api-client";

interface TaskDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: TaskResponse | null;
  organizationId: string;
  projectId: string;
  currentUserId?: string;
  onEditTask: (task: TaskResponse) => void;
}

export function TaskDetailModal({
  isOpen,
  onClose,
  task,
  organizationId,
  projectId,
  currentUserId,
  onEditTask,
}: TaskDetailModalProps) {
  const [activeTab, setActiveTab] = useState<"comments" | "activity">(
    "comments",
  );
  const [comments, setComments] = useState<CommentResponse[]>([]);
  const [activities, setActivities] = useState<ActivityLogResponse[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);

  // New comment
  const [newCommentBody, setNewCommentBody] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  // Edit comment
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [isEditingComment, setIsEditingComment] = useState(false);

  const fetchComments = useCallback(async () => {
    if (!task) return;
    try {
      setIsLoadingComments(true);
      const res = await apiClient.getComments(
        organizationId,
        projectId,
        task.id,
      );
      setComments(res.items);
    } catch {
      // silently handle or log
    } finally {
      setIsLoadingComments(false);
    }
  }, [organizationId, projectId, task]);

  const fetchActivities = useCallback(async () => {
    if (!task) return;
    try {
      setIsLoadingActivities(true);
      const res = await apiClient.getActivity(organizationId, {
        taskId: task.id,
        limit: 50,
      });
      setActivities(res.items);
    } catch {
      // silently handle
    } finally {
      setIsLoadingActivities(false);
    }
  }, [organizationId, task]);

  useEffect(() => {
    if (isOpen && task) {
      fetchComments();
      fetchActivities();
    }
  }, [isOpen, task, fetchComments, fetchActivities]);

  if (!isOpen || !task) return null;

  const isOverdue =
    task.dueDate &&
    task.status !== "DONE" &&
    new Date(task.dueDate) < new Date();

  const handleCreateComment = async (e: React.FormEvent) => {
    e.preventDefault();
    setCommentError(null);
    const trimmed = newCommentBody.trim();
    if (!trimmed) {
      setCommentError("Comment cannot be empty.");
      return;
    }

    try {
      setIsSubmittingComment(true);
      const created = await apiClient.createComment(
        organizationId,
        projectId,
        task.id,
        {
          body: trimmed,
        },
      );
      setComments((prev) => [created, ...prev]);
      setNewCommentBody("");
      // Refresh activities to show comment event
      fetchActivities();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to post comment";
      setCommentError(msg);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleUpdateComment = async (commentId: string) => {
    const trimmed = editBody.trim();
    if (!trimmed) return;

    try {
      setIsEditingComment(true);
      const updated = await apiClient.updateComment(
        organizationId,
        projectId,
        task.id,
        commentId,
        { body: trimmed },
      );
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? updated : c)),
      );
      setEditingCommentId(null);
      setEditBody("");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to update comment";
      setCommentError(msg);
    } finally {
      setIsEditingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm("Are you sure you want to delete this comment?"))
      return;

    try {
      await apiClient.deleteComment(
        organizationId,
        projectId,
        task.id,
        commentId,
      );
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      fetchActivities();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to delete comment";
      setCommentError(msg);
    }
  };

  const priorityStyles = {
    LOW: "bg-sky-500/10 text-sky-400 border-sky-500/30",
    MEDIUM: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    HIGH: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    URGENT: "bg-rose-500/10 text-rose-400 border-rose-500/30",
  };

  const statusStyles = {
    TODO: "bg-slate-800 text-slate-300 border-slate-700",
    IN_PROGRESS: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
    IN_REVIEW: "bg-purple-500/10 text-purple-400 border-purple-500/30",
    DONE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 text-slate-100 max-h-[90vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-detail-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-800 shrink-0">
          <div className="space-y-2 pr-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusStyles[task.status]}`}
              >
                {task.status.replace("_", " ")}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${priorityStyles[task.priority]}`}
              >
                {task.priority} Priority
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 border border-slate-700 text-slate-400">
                v{task.version}
              </span>
              {task.completedAt && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="w-3 h-3" />
                  Completed
                </span>
              )}
              {isOverdue && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <AlertTriangle className="w-3 h-3" />
                  Overdue
                </span>
              )}
            </div>
            <h2
              id="task-detail-title"
              className="text-xl font-bold text-white tracking-tight"
            >
              {task.title}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onEditTask(task)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Metadata Bar */}
        <div className="py-3 border-b border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs shrink-0 bg-slate-950/40 px-3 rounded-lg my-3">
          <div>
            <span className="text-slate-500 block mb-0.5">Assignee</span>
            <div className="flex items-center gap-1.5 text-slate-200 font-medium">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>
                {task.assignee?.displayName ||
                  task.assignee?.email ||
                  "Unassigned"}
              </span>
            </div>
          </div>

          <div>
            <span className="text-slate-500 block mb-0.5">Due Date</span>
            <div
              className={`flex items-center gap-1.5 font-medium ${
                isOverdue ? "text-rose-400" : "text-slate-200"
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>
                {task.dueDate
                  ? new Date(task.dueDate).toLocaleDateString()
                  : "None"}
              </span>
            </div>
          </div>

          <div>
            <span className="text-slate-500 block mb-0.5">Created By</span>
            <div className="flex items-center gap-1.5 text-slate-200 font-medium">
              <span>{task.createdBy?.displayName || "Member"}</span>
            </div>
          </div>

          <div>
            <span className="text-slate-500 block mb-0.5">Created At</span>
            <div className="flex items-center gap-1.5 text-slate-400">
              <Clock className="w-3.5 h-3.5" />
              <span>{new Date(task.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        {/* Task Description */}
        <div className="mb-4 shrink-0">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            Description
          </h4>
          <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-lg text-sm text-slate-300 whitespace-pre-wrap min-h-[60px] max-h-36 overflow-y-auto">
            {task.description ? (
              task.description
            ) : (
              <span className="italic text-slate-600">
                No description provided.
              </span>
            )}
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-4 border-b border-slate-800 mb-3 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("comments")}
            className={`pb-2 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === "comments"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Comments ({comments.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("activity")}
            className={`pb-2 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === "activity"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Activity History</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto pr-1">
          {activeTab === "comments" ? (
            <div className="space-y-4">
              {/* Comment submission form */}
              <form onSubmit={handleCreateComment} className="space-y-2">
                {commentError && (
                  <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{commentError}</span>
                  </div>
                )}
                <div className="relative">
                  <textarea
                    rows={2}
                    value={newCommentBody}
                    onChange={(e) => setNewCommentBody(e.target.value)}
                    placeholder="Write a comment..."
                    className="w-full px-3 py-2 pr-12 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors resize-none"
                  />
                  <button
                    type="submit"
                    disabled={isSubmittingComment || !newCommentBody.trim()}
                    className="absolute right-2 bottom-3 p-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors disabled:opacity-30"
                    aria-label="Post comment"
                  >
                    {isSubmittingComment ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </form>

              {/* Comments list */}
              {isLoadingComments ? (
                <div className="py-8 flex justify-center text-slate-500 text-xs">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading
                  comments...
                </div>
              ) : comments.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  No comments yet. Start the conversation!
                </div>
              ) : (
                <div className="space-y-3">
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-lg space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-200">
                            {comment.author?.displayName ||
                              comment.author?.email ||
                              "Team Member"}
                          </span>
                          <span className="text-slate-500 text-[11px]">
                            {new Date(comment.createdAt).toLocaleString()}
                          </span>
                        </div>

                        {currentUserId &&
                          comment.authorId === currentUserId && (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCommentId(comment.id);
                                  setEditBody(comment.body);
                                }}
                                className="text-slate-500 hover:text-slate-300 p-0.5"
                                aria-label="Edit comment"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteComment(comment.id)}
                                className="text-slate-500 hover:text-rose-400 p-0.5"
                                aria-label="Delete comment"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                      </div>

                      {editingCommentId === comment.id ? (
                        <div className="pt-1 space-y-2">
                          <textarea
                            rows={2}
                            value={editBody}
                            onChange={(e) => setEditBody(e.target.value)}
                            className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                          />
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              type="button"
                              onClick={() => setEditingCommentId(null)}
                              className="px-2 py-1 text-[11px] rounded text-slate-400 hover:text-white"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={isEditingComment}
                              onClick={() => handleUpdateComment(comment.id)}
                              className="px-2.5 py-1 text-[11px] rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Plain text safe rendering to prevent XSS injection */
                        <p className="text-xs text-slate-300 whitespace-pre-wrap break-words leading-relaxed">
                          {comment.body}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Activity History tab */
            <div>
              {isLoadingActivities ? (
                <div className="py-8 flex justify-center text-slate-500 text-xs">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading
                  audit timeline...
                </div>
              ) : activities.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  No activity records for this task.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {activities.map((act) => (
                    <div
                      key={act.id}
                      className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs flex items-start gap-3"
                    >
                      <div className="p-1.5 rounded-full bg-slate-800 text-emerald-400 shrink-0 mt-0.5">
                        <Activity className="w-3 h-3" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-200">
                            {act.eventType
                              .replace(".", " → ")
                              .replace(/_/g, " ")}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {new Date(act.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-slate-400 text-[11px] mt-0.5">
                          Actor:{" "}
                          <span className="text-slate-300 font-mono">
                            {act.actorId || "System"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
