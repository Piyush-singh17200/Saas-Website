"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ConflictBannerProps {
  onReload: () => void;
  isReloading?: boolean;
}

export function ConflictBanner({ onReload, isReloading }: ConflictBannerProps) {
  return (
    <div
      role="alert"
      className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in duration-200"
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0 mt-0.5 sm:mt-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-semibold text-white">
            Concurrency Conflict (HTTP 409)
          </h4>
          <p className="text-xs text-amber-300/90 mt-0.5">
            This task was modified by another team member while you were editing
            it. To prevent accidentally overwriting their work, your changes
            were not applied.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onReload}
        disabled={isReloading}
        className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors shrink-0 disabled:opacity-50"
      >
        <RefreshCw
          className={`w-3.5 h-3.5 ${isReloading ? "animate-spin" : ""}`}
        />
        <span>Reload Latest Version</span>
      </button>
    </div>
  );
}
