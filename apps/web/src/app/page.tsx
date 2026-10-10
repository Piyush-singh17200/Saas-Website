import React from "react";
import {
  Layers,
  ShieldCheck,
  Database,
  ArrowRight,
  Activity,
  Terminal,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-slate-950">
      {/* Navigation Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/70 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-lg">
              W
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-lg tracking-tight text-white leading-none">
                WorkSpace
              </span>
              <span className="text-[10px] text-slate-400 font-mono tracking-wider uppercase">
                SaaS Engineering Foundation
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Phase 1: Foundation
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-6xl mx-auto px-4 py-16 sm:py-24 flex flex-col justify-center">
        <div className="max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-slate-800/80 border border-slate-700/60 text-slate-300">
            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
            <span>Monorepo Architecture Powered by Turborepo & pnpm</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-[1.1]">
            Multi-Tenant SaaS <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
              Project Management
            </span>
          </h1>

          <p className="text-lg text-slate-400 leading-relaxed">
            WorkSpace enables organizations to manage projects, workflows, and
            distributed teams with guaranteed data isolation, high scalability,
            and robust enterprise foundations.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-4">
            <a
              href="#architecture"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm transition-colors shadow-lg shadow-emerald-500/20"
            >
              Explore Architecture
              <ArrowRight className="w-4 h-4" />
            </a>
            <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 font-mono text-xs">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              API Probe: <span className="text-slate-200">/api/v1/health</span>
            </div>
          </div>
        </div>

        {/* Foundation Architecture Pillars */}
        <div
          id="architecture"
          className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h2 className="text-base font-semibold text-white mb-2">
              Isolated Multi-Tenancy
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Designed from the ground up for strict organizational boundaries,
              deterministic row/schema level isolation, and zero cross-tenant
              data leakage.
            </p>
          </div>

          <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 mb-4">
              <Layers className="w-5 h-5" />
            </div>
            <h2 className="text-base font-semibold text-white mb-2">
              Modular Monorepo Core
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Built with pnpm workspaces and Turborepo. Shared contracts,
              unified type definitions, and encapsulated database models.
            </p>
          </div>

          <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 mb-4">
              <Database className="w-5 h-5" />
            </div>
            <h2 className="text-base font-semibold text-white mb-2">
              PostgreSQL & Prisma
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Type-safe database interactions with automated migration
              pipelines, readiness telemetry, and containerized Docker
              infrastructure.
            </p>
          </div>
        </div>

        {/* Runtime Diagnostics Card */}
        <div className="mt-12 p-6 rounded-xl bg-slate-900/40 border border-slate-800 font-mono text-xs text-slate-400 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-slate-300 font-medium">
              Foundation Topology & Verification
            </span>
            <span className="text-emerald-400">READY</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-1">
            <div>
              <span className="text-slate-500 block">Frontend App</span>
              <span className="text-slate-200">Next.js 14 App Router</span>
            </div>
            <div>
              <span className="text-slate-500 block">Backend API</span>
              <span className="text-slate-200">Express + TypeScript</span>
            </div>
            <div>
              <span className="text-slate-500 block">Background Queue</span>
              <span className="text-slate-200">Dedicated Node Worker</span>
            </div>
            <div>
              <span className="text-slate-500 block">Persistence</span>
              <span className="text-slate-200">PostgreSQL + Prisma ORM</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-500 font-mono">
        WorkSpace SaaS Engineering Foundation &copy; 2026. All rights reserved.
      </footer>
    </div>
  );
}
