"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Settings,
  Archive,
  RotateCcw,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Info,
  ShieldAlert,
} from "lucide-react";
import type {
  ProjectResponse,
  UpdateProjectInput,
  MembershipRoleType,
} from "@workspace/contracts";
import { apiClient } from "../lib/api-client";

interface ProjectSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectResponse;
  organizationId: string;
  currentUserRole?: MembershipRoleType;
  onProjectUpdated: (updated: ProjectResponse) => void;
}

export function ProjectSettingsModal({
  isOpen,
  onClose,
  project,
  organizationId,
  currentUserRole,
  onProjectUpdated,
}: ProjectSettingsModalProps) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  const canManageLifecycle =
    currentUserRole === undefined ||
    currentUserRole === "OWNER" ||
    currentUserRole === "ADMIN";

  useEffect(() => {
    setName(project.name);
    setDescription(project.description || "");
  }, [project]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSaving && !isArchiving) {
        if (showArchiveConfirm) {
          setShowArchiveConfirm(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSaving, isArchiving, showArchiveConfirm, onClose]);

  if (!isOpen) return null;

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Project name cannot be empty");
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);

      const input: UpdateProjectInput = {
        name: name.trim(),
        description: description.trim() || null,
      };

      const updated = await apiClient.updateProject(
        organizationId,
        project.id,
        input,
      );
      onProjectUpdated(updated);
      setSuccess("Project details updated successfully");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to update project details",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleArchive = async () => {
    try {
      setIsArchiving(true);
      setError(null);
      setSuccess(null);

      let updated: ProjectResponse;
      if (project.status === "ACTIVE") {
        updated = await apiClient.archiveProject(organizationId, project.id);
        setSuccess("Project archived successfully");
      } else {
        updated = await apiClient.restoreProject(organizationId, project.id);
        setSuccess("Project restored to active state");
      }

      onProjectUpdated(updated);
      setShowArchiveConfirm(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to change project archive status",
      );
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-settings-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700/80 flex items-center justify-center text-slate-300">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="project-settings-title"
                className="text-base font-semibold text-white"
              >
                Project Settings
              </h2>
              <p className="text-xs text-slate-400">
                Configure project details and lifecycle status
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close project settings"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-6">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Edit Details Form */}
          <form onSubmit={handleSaveDetails} className="space-y-4">
            <div>
              <label
                htmlFor="settings-proj-name"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                Project Name <span className="text-rose-400">*</span>
              </label>
              <input
                id="settings-proj-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
                disabled={isSaving || project.status === "ARCHIVED"}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors disabled:opacity-50"
              />
            </div>

            <div>
              <label
                htmlFor="settings-proj-desc"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                Description
              </label>
              <textarea
                id="settings-proj-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={1000}
                disabled={isSaving || project.status === "ARCHIVED"}
                placeholder="Brief summary of project goals..."
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors disabled:opacity-50"
              />
            </div>

            {project.status === "ARCHIVED" ? (
              <p className="text-[11px] text-amber-400 italic">
                This project is currently archived (read-only). Restore it to
                make edits.
              </p>
            ) : (
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving || !name.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            )}
          </form>

          {/* Project Lifecycle Section */}
          <div className="pt-6 border-t border-slate-800 space-y-4">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Project Lifecycle
            </h3>

            {!canManageLifecycle ? (
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-300">
                    Restricted Management:
                  </span>{" "}
                  Archiving and restoring projects requires Organization Owner
                  or Admin privileges.
                </div>
              </div>
            ) : project.status === "ACTIVE" ? (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-white">
                    Archive Project
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Archived projects become read-only and no longer count
                    toward your active plan project limit. All tasks and
                    comments are preserved.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowArchiveConfirm(true)}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-amber-400 border border-amber-500/30 hover:bg-amber-500/10 transition-colors shrink-0 flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>Archive</span>
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-white">
                    Restore Project
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Restore this project to active status. Tasks and
                    collaboration will be re-enabled.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleToggleArchive}
                  disabled={isArchiving}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/10 transition-colors shrink-0 flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                  {isArchiving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5" />
                  )}
                  <span>Restore</span>
                </button>
              </div>
            )}

            {/* Deletion Retention Policy Banner */}
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold text-slate-300">
                  Data Retention & Deletion Policy:
                </span>
                <p>
                  Permanent project deletion is restricted across organizations
                  to protect regulatory audit trails, compliance history, and
                  billing entitlement records. Please archive projects when not
                  in active use.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            Close
          </button>
        </div>
      </div>

      {/* Archive Confirmation Dialog */}
      {showArchiveConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="archive-dialog-title"
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm animate-in fade-in duration-100"
        >
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400 mb-3">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <Archive className="w-5 h-5" />
              </div>
              <h3
                id="archive-dialog-title"
                className="text-base font-semibold text-white"
              >
                Archive Project?
              </h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mb-5">
              Archiving <strong className="text-white">{project.name}</strong>{" "}
              will place it in read-only mode. No new tasks or comments can be
              added until restored.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowArchiveConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleToggleArchive}
                disabled={isArchiving}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                {isArchiving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>Confirm Archive</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
