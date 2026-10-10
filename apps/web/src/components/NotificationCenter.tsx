"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Bell,
  Check,
  CheckCheck,
  FolderKanban,
  CheckSquare,
  ArrowRightLeft,
  MessageSquare,
  UserPlus,
  Loader2,
  AlertCircle,
  BellOff,
  ExternalLink,
} from "lucide-react";
import type { NotificationResponse } from "@workspace/contracts";
import { apiClient } from "../lib/api-client";

interface NotificationCenterProps {
  organizationId: string;
}

export function NotificationCenter({ organizationId }: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationResponse[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Formatter for relative time
  const formatTime = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return "just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return isoString;
    }
  };

  // Poll unread count
  const fetchUnreadCount = useCallback(async () => {
    if (!organizationId) return;
    try {
      const res = await apiClient.getUnreadNotificationCount(organizationId);
      setUnreadCount(res.unreadCount);
    } catch {
      // Non-intrusive polling failure
    }
  }, [organizationId]);

  // Fetch full notifications list
  const fetchNotifications = useCallback(async () => {
    if (!organizationId) return;
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiClient.getNotifications(organizationId, { limit: 20 });
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load notifications");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  // Periodic polling interval (45 seconds) when page is active
  useEffect(() => {
    fetchUnreadCount();

    const intervalId = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchUnreadCount();
      }
    }, 45000);

    return () => clearInterval(intervalId);
  }, [fetchUnreadCount]);

  // Load notifications list when dropdown opens
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  // Close on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Mark single notification read
  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await apiClient.markNotificationAsRead(organizationId, id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Non-blocking
    }
  };

  // Mark all notifications read
  const handleMarkAllRead = async () => {
    try {
      setIsMarkingAll(true);
      await apiClient.markAllNotificationsAsRead(organizationId);
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })),
      );
      setUnreadCount(0);
    } catch {
      // Non-blocking
    } finally {
      setIsMarkingAll(false);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "ORG_INVITATION":
        return <UserPlus className="w-4 h-4 text-emerald-400" />;
      case "TASK_ASSIGNED":
        return <CheckSquare className="w-4 h-4 text-blue-400" />;
      case "TASK_REASSIGNED":
        return <ArrowRightLeft className="w-4 h-4 text-indigo-400" />;
      case "COMMENT_MENTION":
        return <MessageSquare className="w-4 h-4 text-purple-400" />;
      default:
        return <FolderKanban className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Open notifications menu"
        aria-expanded={isOpen}
        className={`relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/40 ${
          isOpen ? "bg-slate-900 text-white" : ""
        }`}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-bold flex items-center justify-center shadow-sm">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl z-50 overflow-hidden flex flex-col max-h-[500px] animate-in fade-in zoom-in-95 duration-100">
          {/* Header */}
          <div className="p-3.5 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/60">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  {unreadCount} unread
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={isMarkingAll}
                className="text-xs text-slate-400 hover:text-emerald-400 transition-colors flex items-center gap-1 font-medium disabled:opacity-50"
              >
                {isMarkingAll ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCheck className="w-3.5 h-3.5" />
                )}
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50">
            {isLoading ? (
              <div className="p-8 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                <span>Loading notifications...</span>
              </div>
            ) : error ? (
              <div className="p-6 text-center">
                <div className="inline-flex p-2 rounded-full bg-rose-500/10 text-rose-400 mb-2">
                  <AlertCircle className="w-4 h-4" />
                </div>
                <p className="text-xs text-rose-400 mb-3">{error}</p>
                <button
                  type="button"
                  onClick={fetchNotifications}
                  className="px-3 py-1 rounded-md text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white"
                >
                  Retry
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-10 flex flex-col items-center justify-center text-center">
                <div className="w-10 h-10 rounded-full bg-slate-800/50 flex items-center justify-center text-slate-500 mb-3">
                  <BellOff className="w-5 h-5" />
                </div>
                <p className="text-sm font-medium text-slate-300">All caught up!</p>
                <p className="text-xs text-slate-500 mt-1 max-w-[200px]">
                  You have no notifications in this organization.
                </p>
              </div>
            ) : (
              notifications.map((notif) => {
                const isUnread = !notif.readAt;
                const metadata = notif.metadata as Record<string, string> | null;
                const targetPath =
                  metadata?.projectId && metadata?.taskId
                    ? `/organizations/${organizationId}/projects/${metadata.projectId}`
                    : metadata?.projectId
                    ? `/organizations/${organizationId}/projects/${metadata.projectId}`
                    : null;

                return (
                  <div
                    key={notif.id}
                    className={`p-3.5 flex items-start gap-3 transition-colors ${
                      isUnread
                        ? "bg-slate-800/40 hover:bg-slate-800/60"
                        : "hover:bg-slate-800/20"
                    }`}
                  >
                    <div className="mt-0.5 p-1.5 rounded-lg bg-slate-800 border border-slate-700/50 shrink-0">
                      {getNotificationIcon(notif.type)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className={`text-xs font-medium truncate ${isUnread ? "text-white font-semibold" : "text-slate-300"}`}>
                          {notif.title}
                        </p>
                        <span className="text-[10px] text-slate-500 whitespace-nowrap shrink-0">
                          {formatTime(notif.createdAt)}
                        </span>
                      </div>

                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                        {notif.body}
                      </p>

                      <div className="mt-2 flex items-center gap-3">
                        {targetPath && (
                          <Link
                            href={targetPath}
                            onClick={() => {
                              if (isUnread) handleMarkAsRead(notif.id);
                              setIsOpen(false);
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
                          >
                            <span>View item</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        )}

                        {isUnread && (
                          <button
                            type="button"
                            onClick={(e) => handleMarkAsRead(notif.id, e)}
                            className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors"
                          >
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span>Mark read</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
