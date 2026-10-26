"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  UploadCloud,
  File,
  FileText,
  FileImage,
  FileArchive,
  Download,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Paperclip,
} from "lucide-react";
import type { AttachmentResponse } from "@workspace/contracts";
import { apiClient } from "../lib/api-client";

interface TaskAttachmentsProps {
  organizationId: string;
  projectId: string;
  taskId: string;
  currentUserId?: string;
  onAttachmentCountChange?: (count: number) => void;
}

export function TaskAttachments({
  organizationId,
  projectId,
  taskId,
  currentUserId,
  onAttachmentCountChange,
}: TaskAttachmentsProps) {
  const [attachments, setAttachments] = useState<AttachmentResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAttachments = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiClient.listAttachments(organizationId, { taskId });
      setAttachments(res.attachments);
      if (onAttachmentCountChange) {
        onAttachmentCountChange(res.attachments.length);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load attachments",
      );
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, taskId, onAttachmentCountChange]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  const handleUploadFile = async (file: File) => {
    // 10MB client check
    const maxSizeBytes = 10 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setError(
        `File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds maximum allowed limit of 10 MB`,
      );
      return;
    }

    try {
      setIsUploading(true);
      setError(null);
      setSuccessMsg(null);

      const newAttachment = await apiClient.uploadAttachment(
        organizationId,
        file,
        {
          taskId,
          projectId,
        },
      );

      setAttachments((prev) => [newAttachment, ...prev]);
      if (onAttachmentCountChange) {
        onAttachmentCountChange(attachments.length + 1);
      }
      setSuccessMsg(`"${file.name}" uploaded successfully`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUploadFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleUploadFile(file);
    }
  };

  const handleDownload = async (attachment: AttachmentResponse) => {
    try {
      const res = await apiClient.getAttachmentDownloadUrl(
        organizationId,
        attachment.id,
      );
      if (res.downloadUrl) {
        window.open(res.downloadUrl, "_blank");
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to generate download link",
      );
    }
  };

  const handleDelete = async (attachmentId: string) => {
    try {
      setDeletingId(attachmentId);
      setError(null);
      await apiClient.deleteAttachment(organizationId, attachmentId);
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
      if (onAttachmentCountChange) {
        onAttachmentCountChange(Math.max(0, attachments.length - 1));
      }
      setConfirmDeleteId(null);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to delete attachment",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) {
      return <FileImage className="w-4 h-4 text-emerald-400" />;
    }
    if (mimeType.includes("pdf")) {
      return <FileText className="w-4 h-4 text-rose-400" />;
    }
    if (mimeType.includes("zip")) {
      return <FileArchive className="w-4 h-4 text-amber-400" />;
    }
    return <File className="w-4 h-4 text-blue-400" />;
  };

  return (
    <div className="space-y-4">
      {/* Upload Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`p-5 rounded-xl border-2 border-dashed transition-all cursor-pointer text-center flex flex-col items-center justify-center gap-2 ${
          isDragging
            ? "border-emerald-500 bg-emerald-500/10 scale-[1.01]"
            : "border-slate-800 hover:border-slate-700 bg-slate-950/40 hover:bg-slate-900/60"
        } ${isUploading ? "opacity-60 pointer-events-none" : ""}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          className="hidden"
          accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.csv,.json,.docx,.xlsx,.zip"
        />

        <div className="w-10 h-10 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-300">
          {isUploading ? (
            <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
          ) : (
            <UploadCloud className="w-5 h-5 text-emerald-400" />
          )}
        </div>

        <div>
          <p className="text-xs font-medium text-slate-200">
            {isUploading
              ? "Uploading file..."
              : "Click or drag files here to upload"}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Images, PDF, Office docs, text, ZIP (Max 10 MB)
          </p>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Attachments List */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
          <Paperclip className="w-3.5 h-3.5" />
          <span>Attached Files ({attachments.length})</span>
        </h4>

        {isLoading ? (
          <div className="py-6 flex items-center justify-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
            <span>Loading attachments...</span>
          </div>
        ) : attachments.length === 0 ? (
          <div className="py-6 px-4 text-center border border-slate-800/60 rounded-xl bg-slate-950/20">
            <p className="text-xs text-slate-500">
              No attachments yet for this task.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 hover:border-slate-700/80 transition-colors flex items-center justify-between gap-3 group"
              >
                <figure className="flex items-center gap-2.5 min-w-0 m-0">
                  <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0" aria-label={`Icon for ${att.fileName}`}>
                    {getFileIcon(att.mimeType)}
                  </div>
                  <figcaption className="min-w-0">
                    <p className="text-xs font-medium text-slate-200 truncate group-hover:text-white transition-colors" title={att.fileName}>
                      {att.fileName}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      <span className="sr-only">Caption: </span>
                      {formatFileSize(att.fileSize)} • Uploaded by{" "}
                      {att.uploader?.displayName || "Member"}
                    </p>
                  </figcaption>
                </figure>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleDownload(att)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    title="Download attachment"
                    aria-label={`Download ${att.fileName}`}
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>

                  {/* Delete button & confirmation */}
                  {(!currentUserId || att.uploaderId === currentUserId) &&
                    (confirmDeleteId === att.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDelete(att.id)}
                          disabled={deletingId === att.id}
                          className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-[11px] text-white font-medium transition-colors"
                        >
                          {deletingId === att.id ? "Deleting..." : "Confirm"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(att.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                        title="Delete attachment"
                        aria-label={`Delete ${att.fileName}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
