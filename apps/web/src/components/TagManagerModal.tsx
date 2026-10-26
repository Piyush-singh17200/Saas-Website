"use client";

import React, { useState } from "react";
import {
  X,
  Plus,
  Trash2,
  Edit2,
  Check,
  AlertCircle,
  Loader2,
  Tag as TagIcon,
} from "lucide-react";
import type { TagResponse } from "@workspace/contracts";
import { apiClient } from "../lib/api-client";

interface TagManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  tags: TagResponse[];
  onTagsUpdated: () => Promise<void>;
}

const PRESET_COLORS = [
  "#3B82F6", // Blue
  "#10B981", // Emerald
  "#6366F1", // Indigo
  "#8B5CF6", // Purple
  "#EC4899", // Pink
  "#F59E0B", // Amber
  "#EF4444", // Red
  "#06B6D4", // Cyan
  "#64748B", // Slate
];

export function TagManagerModal({
  isOpen,
  onClose,
  organizationId,
  tags,
  onTagsUpdated,
}: TagManagerModalProps) {
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState<string>(
    PRESET_COLORS[0] || "#3B82F6",
  );
  const [isCreating, setIsCreating] = useState(false);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editTagName, setEditTagName] = useState("");
  const [editTagColor, setEditTagColor] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [deletingTagId, setDeletingTagId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTagName.trim();
    if (!trimmed) return;

    try {
      setIsCreating(true);
      setError(null);
      await apiClient.createTag(organizationId, {
        name: trimmed,
        color: newTagColor,
      });
      setNewTagName("");
      await onTagsUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create tag");
    } finally {
      setIsCreating(false);
    }
  };

  const handleStartEdit = (tag: TagResponse) => {
    setEditingTagId(tag.id);
    setEditTagName(tag.name);
    setEditTagColor(tag.color);
    setError(null);
  };

  const handleSaveEdit = async (tagId: string) => {
    const trimmed = editTagName.trim();
    if (!trimmed) return;

    try {
      setIsUpdating(true);
      setError(null);
      await apiClient.updateTag(organizationId, tagId, {
        name: trimmed,
        color: editTagColor,
      });
      setEditingTagId(null);
      await onTagsUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update tag");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (tagId: string) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this tag? It will be removed from all tasks.",
      )
    ) {
      return;
    }

    try {
      setDeletingTagId(tagId);
      setError(null);
      await apiClient.deleteTag(organizationId, tagId);
      await onTagsUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete tag");
    } finally {
      setDeletingTagId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 text-slate-100 max-h-[85vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tag-manager-title"
      >
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <TagIcon className="w-5 h-5 text-emerald-400" />
            <h2
              id="tag-manager-title"
              className="text-lg font-semibold text-white"
            >
              Manage Tags & Labels
            </h2>
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

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Create Tag Form */}
        <form
          onSubmit={handleCreate}
          className="mt-4 pb-4 border-b border-slate-800 shrink-0 space-y-3"
        >
          <label className="block text-xs font-medium text-slate-300">
            Create New Organization Tag
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="Tag name (e.g. Frontend, Bug, Urgent)..."
              maxLength={50}
              className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
            <button
              type="submit"
              disabled={isCreating || !newTagName.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {isCreating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              <span>Add</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-slate-500 mr-1">Color:</span>
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNewTagColor(c)}
                style={{ backgroundColor: c }}
                className={`w-5 h-5 rounded-full transition-transform ${
                  newTagColor === c
                    ? "ring-2 ring-white scale-110"
                    : "opacity-80 hover:opacity-100"
                }`}
                title={c}
              />
            ))}
          </div>
        </form>

        {/* Existing Tags List */}
        <div className="mt-4 flex-1 overflow-y-auto space-y-2 pr-1">
          <span className="block text-xs font-medium text-slate-400 mb-2">
            Existing Tags ({tags.length})
          </span>

          {tags.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              No tags created yet. Add one above to organize tasks across your
              organization.
            </p>
          ) : (
            tags.map((tag) => {
              const isEditing = editingTagId === tag.id;

              if (isEditing) {
                return (
                  <div
                    key={tag.id}
                    className="p-2.5 rounded-lg bg-slate-950 border border-slate-700 flex flex-col gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editTagName}
                        onChange={(e) => setEditTagName(e.target.value)}
                        className="flex-1 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(tag.id)}
                        disabled={isUpdating}
                        className="p-1.5 rounded bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                        title="Save"
                      >
                        {isUpdating ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingTagId(null)}
                        className="p-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setEditTagColor(c)}
                          style={{ backgroundColor: c }}
                          className={`w-4 h-4 rounded-full ${
                            editTagColor === c
                              ? "ring-2 ring-white scale-110"
                              : "opacity-70"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={tag.id}
                  className="px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span
                      className="px-2 py-0.5 rounded text-xs font-medium"
                      style={{
                        backgroundColor: `${tag.color}20`,
                        color: tag.color,
                        border: `1px solid ${tag.color}40`,
                      }}
                    >
                      {tag.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(tag)}
                      className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                      title="Edit tag"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(tag.id)}
                      disabled={deletingTagId === tag.id}
                      className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Delete tag"
                    >
                      {deletingTagId === tag.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
