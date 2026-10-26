"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home, Shield } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log unexpected client exceptions
    console.error("Application runtime error caught by boundary:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-6 selection:bg-rose-500 selection:text-white relative overflow-hidden">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[350px] bg-rose-500/10 rounded-full blur-3xl pointer-events-none -z-10" />

      <div className="max-w-md w-full text-center space-y-6">
        <div className="inline-flex p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 mb-2">
          <AlertTriangle className="w-10 h-10" />
        </div>

        <div className="space-y-2">
          <span className="text-xs uppercase tracking-widest font-mono text-rose-400 font-semibold">
            System Error — Safe Boundary
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            Something unexpected occurred
          </h1>
          <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
            Our security and stability sandbox caught an unhandled exception.
            Your session and tenant data remain safe.
          </p>
        </div>

        {error?.message && (
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-left font-mono text-[11px] text-slate-400 break-all max-h-32 overflow-y-auto">
            {error.message}
          </div>
        )}

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-semibold text-sm transition-all shadow-lg shadow-emerald-500/25"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Try Again</span>
          </button>
          <Link
            href="/organizations"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white font-medium text-sm transition-all"
          >
            <Home className="w-4 h-4" />
            <span>Go to WorkSpace</span>
          </Link>
        </div>

        <div className="pt-6 border-t border-slate-900 text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-emerald-500/70" />
          <span>WorkSpace Enterprise Security Shield Active</span>
        </div>
      </div>
    </div>
  );
}
