import React, { useState } from "react";
import Link from "next/link";
import {
  Activity,
  FolderKanban,
  ShieldCheck,
  CreditCard,
  Users,
  Code,
  Shield,
  KeyRound,
} from "lucide-react";
import { NotificationCenter } from "./NotificationCenter";
import { AccountSecurityModal } from "./AccountSecurityModal";

interface NavbarProps {
  organizationId?: string;
  organizationName?: string;
  activeTab?:
    "projects" | "activity" | "billing" | "members" | "developer" | "security";
}

export function Navbar({
  organizationId,
  organizationName,
  activeTab = "projects",
}: NavbarProps) {
  const [showSecurityModal, setShowSecurityModal] = useState(false);

  return (
    <>
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-lg group-hover:scale-105 transition-transform">
                W
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-lg tracking-tight text-white leading-none">
                  WorkSpace
                </span>
                <span className="text-[10px] text-slate-400 font-mono tracking-wider uppercase">
                  Multi-Tenant SaaS
                </span>
              </div>
            </Link>

            {organizationId && (
              <div className="hidden md:flex items-center gap-2 pl-4 border-l border-slate-800">
                <div className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>{organizationName || "Active Organization"}</span>
                </div>
              </div>
            )}
          </div>

          {organizationId && (
            <nav className="flex items-center gap-2">
              <Link
                href={`/organizations/${organizationId}/projects`}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === "projects"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
              >
                <FolderKanban className="w-4 h-4" />
                <span>Projects</span>
              </Link>

              <Link
                href={`/organizations/${organizationId}/members`}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === "members"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Team</span>
              </Link>

              <Link
                href={`/organizations/${organizationId}/activity`}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === "activity"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
              >
                <Activity className="w-4 h-4" />
                <span>Activity Log</span>
              </Link>

              <Link
                href={`/organizations/${organizationId}/billing`}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === "billing"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span>Billing</span>
              </Link>

              <Link
                href={`/organizations/${organizationId}/developer`}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === "developer"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
              >
                <Code className="w-4 h-4" />
                <span>Developer</span>
              </Link>

              <Link
                href={`/organizations/${organizationId}/security`}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === "security"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
              >
                <Shield className="w-4 h-4" />
                <span>Security</span>
              </Link>
            </nav>
          )}

          <div className="flex items-center gap-3">
            {organizationId && (
              <NotificationCenter organizationId={organizationId} />
            )}

            <button
              onClick={() => setShowSecurityModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
              title="Account Security & 2FA"
            >
              <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Account Security</span>
            </button>

            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-mono bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">RLS Protected</span>
            </div>
          </div>
        </div>
      </header>

      <AccountSecurityModal
        isOpen={showSecurityModal}
        onClose={() => setShowSecurityModal(false)}
      />
    </>
  );
}
