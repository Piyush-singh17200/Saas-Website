"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, ShieldAlert } from "lucide-react";

interface AccessRestrictedStateProps {
  backHref?: string;
  backLabel?: string;
}

/**
 * A deliberately non-disclosing state shared by 403 and cross-tenant 404
 * responses. It never confirms whether the requested organization or project
 * exists in another tenant.
 */
export function AccessRestrictedState({
  backHref = "/",
  backLabel = "Back to Home",
}: AccessRestrictedStateProps) {
  return (
    <div
      role="alert"
      className="max-w-xl mx-auto my-12 p-8 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300"
    >
      <div className="w-12 h-12 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4">
        <ShieldAlert className="w-6 h-6" />
      </div>
      <h1 className="text-xl font-semibold text-rose-100">Access Restricted</h1>
      <p className="text-sm text-rose-200/80 mt-2">
        This workspace is unavailable. It may not exist, or you may not have
        access to it.
      </p>
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 mt-6 px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 text-white text-xs font-semibold transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>{backLabel}</span>
      </Link>
    </div>
  );
}
