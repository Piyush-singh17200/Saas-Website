"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  FolderKanban,
  CreditCard,
  Zap,
  Lock,
  Server,
  Sparkles,
  ChevronDown,
  ExternalLink,
  Plus,
  Play,
} from "lucide-react";
import {
  buildInvitationAuthHref,
  getSafeInvitationRedirect,
} from "../lib/invitation-auth";

interface DemoCard {
  id: string;
  title: string;
  priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW";
  status: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
  assignee: string;
  tags: string[];
}

const INITIAL_DEMO_CARDS: DemoCard[] = [
  {
    id: "TASK-101",
    title: "Implement PostgreSQL Row-Level Security tenant isolation",
    priority: "URGENT",
    status: "DONE",
    assignee: "Alice Dev",
    tags: ["Security", "Database"],
  },
  {
    id: "TASK-102",
    title: "Configure BullMQ background worker & outbox processor",
    priority: "HIGH",
    status: "IN_REVIEW",
    assignee: "Bob Architect",
    tags: ["Worker", "Redis"],
  },
  {
    id: "TASK-103",
    title: "Stripe Webhooks & Atomic subscription entitlement gate",
    priority: "HIGH",
    status: "IN_PROGRESS",
    assignee: "Carol Eng",
    tags: ["Billing", "Stripe"],
  },
  {
    id: "TASK-104",
    title: "Design dynamic audit logging and TOTP 2FA flow",
    priority: "MEDIUM",
    status: "TODO",
    assignee: "Dave Sec",
    tags: ["Auth", "Audit"],
  },
];

export default function HomePage() {
  const router = useRouter();
  const [cards, setCards] = useState<DemoCard[]>(INITIAL_DEMO_CARDS);
  const [isAnnual, setIsAnnual] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "rls" | "worker" | "security" | "billing"
  >("rls");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Older invitation emails linked to the landing page with onboarding query
  // parameters. Preserve them by handing the visitor to the auth flow instead
  // of silently dropping the token/email/redirect context.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirect = getSafeInvitationRedirect(params.get("redirect"));
    if (!redirect) return;

    router.replace(
      buildInvitationAuthHref("/login", {
        email: params.get("email"),
        redirect,
      }),
    );
  }, [router]);

  const moveCard = (id: string, targetStatus: DemoCard["status"]) => {
    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: targetStatus } : c)),
    );
  };

  const addQuickCard = () => {
    const id = `TASK-${Math.floor(Math.random() * 800) + 200}`;
    const newCard: DemoCard = {
      id,
      title: "Explore real-time collaborative workspace canvas",
      priority: "HIGH",
      status: "TODO",
      assignee: "You",
      tags: ["Workspace"],
    };
    setCards([newCard, ...cards]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-slate-950 font-sans">
      {/* Glow Orbs */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-b from-emerald-500/15 via-teal-500/5 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Navigation Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/70 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-[1px] shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
                <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center text-emerald-400 font-bold text-lg">
                  W
                </div>
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-lg tracking-tight text-white leading-none">
                  WorkSpace
                </span>
                <span className="text-[10px] text-slate-400 font-mono tracking-wider uppercase">
                  Multi-Tenant SaaS
                </span>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-300">
              <a
                href="#demo"
                className="hover:text-emerald-400 transition-colors"
              >
                Interactive Kanban
              </a>
              <a
                href="#architecture"
                className="hover:text-emerald-400 transition-colors"
              >
                Architecture
              </a>
              <a
                href="#features"
                className="hover:text-emerald-400 transition-colors"
              >
                Features
              </a>
              <a
                href="#pricing"
                className="hover:text-emerald-400 transition-colors"
              >
                Pricing
              </a>
              <a
                href="#faq"
                className="hover:text-emerald-400 transition-colors"
              >
                FAQ
              </a>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-mono bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Production Ready</span>
            </div>

            <Link
              href="/login"
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-colors"
            >
              Sign In
            </Link>

            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors shadow-md shadow-emerald-500/20"
            >
              <span>Get Started</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-20 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium bg-slate-900/90 border border-slate-700/80 text-slate-300 mb-8 backdrop-blur shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          <span>
            Next-Generation Multi-Tenant Architecture with Row-Level Security
          </span>
        </div>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-4xl leading-[1.1] sm:leading-[1.1]">
          Engineered for{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">
            Guaranteed Isolation
          </span>{" "}
          and Peak Team Velocity.
        </h1>

        <p className="mt-6 text-base sm:text-lg text-slate-400 max-w-2xl leading-relaxed">
          WorkSpace combines interactive Kanban project management, BullMQ
          background queues, Stripe subscription entitlements, and PostgreSQL
          Row-Level Security into a unified, enterprise-grade platform.
        </p>

        {/* Call to action buttons */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-sm transition-all shadow-xl shadow-emerald-500/20 hover:scale-[1.02]"
          >
            <span>Launch Free Workspace</span>
            <ArrowRight className="w-4 h-4" />
          </Link>

          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-white font-medium text-sm transition-all backdrop-blur"
          >
            <Play className="w-4 h-4 text-emerald-400 fill-emerald-400/20" />
            <span>Sign In to Organization</span>
          </Link>

          <a
            href="#demo"
            className="inline-flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-mono text-slate-400 hover:text-emerald-400 transition-colors"
          >
            <span>Try Live Kanban ↓</span>
          </a>
        </div>

        {/* Feature Pills */}
        <div className="mt-12 flex flex-wrap justify-center items-center gap-3 sm:gap-6 text-xs text-slate-400 font-mono">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>PostgreSQL RLS Zero-Leakage</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Stripe Customer Portal & Entitlements</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>BullMQ Redis Queues</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>2FA TOTP & Audit Logs</span>
          </div>
        </div>
      </section>

      {/* Interactive Live Kanban Canvas Demo */}
      <section
        id="demo"
        className="py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full"
      >
        <div className="rounded-3xl bg-slate-900/70 border border-slate-800 p-6 sm:p-8 backdrop-blur shadow-2xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 mb-1">
                <FolderKanban className="w-4 h-4" />
                <span>INTERACTIVE WORKSPACE PREVIEW</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-white">
                Live Kanban Board Simulator
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Click any task&apos;s status pill to move it across columns in
                real-time.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={addQuickCard}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-400" />
                <span>Add Demo Card</span>
              </button>

              <Link
                href="/register"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors shadow-md shadow-emerald-500/20"
              >
                <span>Create Production Board</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Kanban Columns Grid */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
            {(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const).map(
              (col) => {
                const colCards = cards.filter((c) => c.status === col);
                const colTitle =
                  col === "TODO"
                    ? "To Do"
                    : col === "IN_PROGRESS"
                      ? "In Progress"
                      : col === "IN_REVIEW"
                        ? "In Review"
                        : "Done";

                const colBorder =
                  col === "DONE"
                    ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400"
                    : col === "IN_PROGRESS"
                      ? "border-indigo-500/30 bg-indigo-500/5 text-indigo-400"
                      : col === "IN_REVIEW"
                        ? "border-amber-500/30 bg-amber-500/5 text-amber-400"
                        : "border-slate-800 bg-slate-950/60 text-slate-400";

                return (
                  <div
                    key={col}
                    className={`rounded-2xl border p-4 flex flex-col min-h-[300px] ${colBorder}`}
                  >
                    <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800/60">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                        {colTitle}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-800 text-slate-400">
                        {colCards.length}
                      </span>
                    </div>

                    <div className="space-y-3 flex-1">
                      {colCards.map((card) => (
                        <div
                          key={card.id}
                          className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all shadow-sm group"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-mono text-emerald-400">
                              {card.id}
                            </span>
                            <span
                              className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                                card.priority === "URGENT"
                                  ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                                  : card.priority === "HIGH"
                                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                    : "bg-slate-800 text-slate-400"
                              }`}
                            >
                              {card.priority}
                            </span>
                          </div>

                          <p className="text-xs font-medium text-slate-200 group-hover:text-white leading-snug mb-3">
                            {card.title}
                          </p>

                          <div className="flex flex-wrap gap-1 mb-3">
                            {card.tags.map((tag) => (
                              <span
                                key={tag}
                                className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 font-mono"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>

                          <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between">
                            <span className="text-[11px] text-slate-400">
                              {card.assignee}
                            </span>

                            {/* Quick Move Selector */}
                            <select
                              value={card.status}
                              onChange={(e) =>
                                moveCard(
                                  card.id,
                                  e.target.value as DemoCard["status"],
                                )
                              }
                              className="bg-slate-950 border border-slate-700/80 rounded-lg text-[10px] text-slate-300 py-0.5 px-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            >
                              <option value="TODO">To Do</option>
                              <option value="IN_PROGRESS">In Progress</option>
                              <option value="IN_REVIEW">In Review</option>
                              <option value="DONE">Done</option>
                            </select>
                          </div>
                        </div>
                      ))}

                      {colCards.length === 0 && (
                        <div className="h-24 border border-dashed border-slate-800/60 rounded-xl flex items-center justify-center text-xs text-slate-600">
                          No tasks
                        </div>
                      )}
                    </div>
                  </div>
                );
              },
            )}
          </div>
        </div>
      </section>

      {/* Architecture Deep Dive Interactive Tabs */}
      <section
        id="architecture"
        className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full"
      >
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mb-3">
            <Server className="w-3.5 h-3.5" />
            <span>Under The Hood</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Production Architecture Deep Dive
          </h2>
          <p className="text-sm sm:text-base text-slate-400 mt-2">
            Engineered to enterprise standards with strict separation of
            concerns across web, API, database, and background workers.
          </p>
        </div>

        {/* Tabs switcher */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
          {[
            { id: "rls", label: "PostgreSQL RLS", icon: ShieldCheck },
            { id: "worker", label: "BullMQ & Redis", icon: Zap },
            { id: "security", label: "MFA & Audit Logs", icon: Lock },
            { id: "billing", label: "Stripe Entitlements", icon: CreditCard },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  active
                    ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20"
                    : "bg-slate-900/80 hover:bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content Box */}
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-6 sm:p-8 backdrop-blur">
          {activeTab === "rls" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div className="space-y-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-2xl font-bold text-white">
                  PostgreSQL Row-Level Security (RLS)
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Unlike traditional apps that rely solely on application-level
                  filtering, WorkSpace sets{" "}
                  <code className="text-emerald-400 bg-slate-950 px-1 py-0.5 rounded font-mono">
                    app.current_organization_id
                  </code>{" "}
                  on every single database transaction.
                </p>
                <ul className="space-y-2 text-xs text-slate-300">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      Unprivileged role <code>workspace_app</code> with{" "}
                      <code>FORCE ROW LEVEL SECURITY</code>
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      Zero possibility of cross-tenant data leaks, even if SQL
                      is altered
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      Validated by automated cross-tenant injection test suites
                    </span>
                  </li>
                </ul>
              </div>

              <div className="bg-slate-950 rounded-xl border border-slate-800 p-4 font-mono text-xs overflow-x-auto text-slate-300">
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800 text-[10px] text-slate-500">
                  <span>postgres_rls_policy.sql</span>
                  <span className="text-emerald-400">ENFORCED</span>
                </div>
                <pre className="text-slate-400 leading-relaxed">
                  {`CREATE POLICY tenant_isolation_policy ON projects
  FOR ALL
  TO workspace_app
  USING (
    organization_id = NULLIF(
      current_setting('app.current_organization_id', true),
      ''
    )::uuid
  );

ALTER TABLE projects FORCE ROW LEVEL SECURITY;`}
                </pre>
              </div>
            </div>
          )}

          {activeTab === "worker" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div className="space-y-4">
                <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center">
                  <Zap className="w-5 h-5" />
                </div>
                <h3 className="text-2xl font-bold text-white">
                  BullMQ & Redis Background Queues
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Asynchronous jobs (email notifications, invitation expiry
                  sweeps, transactional outbox relays, and webhook deliveries)
                  are dispatched through Redis-backed queues.
                </p>
                <ul className="space-y-2 text-xs text-slate-300">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                    <span>
                      Transactional Outbox Pattern guarantees at-least-once
                      delivery
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                    <span>
                      Automatic exponential backoff retries with dead-letter
                      queue isolation
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                    <span>
                      Redis fail-closed rate limiter preventing API abuse
                    </span>
                  </li>
                </ul>
              </div>

              <div className="bg-slate-950 rounded-xl border border-slate-800 p-4 font-mono text-xs overflow-x-auto text-slate-300">
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800 text-[10px] text-slate-500">
                  <span>worker_dispatcher.ts</span>
                  <span className="text-teal-400">ACTIVE</span>
                </div>
                <pre className="text-slate-400 leading-relaxed">
                  {`export const notificationWorker = new Worker(
  "notifications",
  async (job) => {
    const { organizationId, userId, payload } = job.data;
    await executeTenantTx(organizationId, async (tx) => {
      await tx.notification.create({ ...payload });
    });
  },
  { connection: redisConnection, concurrency: 5 }
);`}
                </pre>
              </div>
            </div>
          )}

          {activeTab === "security" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div className="space-y-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
                  <Lock className="w-5 h-5" />
                </div>
                <h3 className="text-2xl font-bold text-white">
                  Enterprise Security & TOTP MFA
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Protect every team member with RFC 6238 TOTP two-factor
                  authentication, hashed recovery codes, immediate active
                  session revocation, and immutable audit logs.
                </p>
                <ul className="space-y-2 text-xs text-slate-300">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>
                      Google Authenticator & 1Password TOTP compliance
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>
                      Active session revocation across devices in real-time
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>
                      Complete audit trail capturing actors, IP origins, and
                      resources
                    </span>
                  </li>
                </ul>
              </div>

              <div className="bg-slate-950 rounded-xl border border-slate-800 p-4 font-mono text-xs overflow-x-auto text-slate-300">
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800 text-[10px] text-slate-500">
                  <span>security_audit.ts</span>
                  <span className="text-indigo-400">RECORDING</span>
                </div>
                <pre className="text-slate-400 leading-relaxed">
                  {`await auditService.recordEvent({
  organizationId,
  actorId: user.id,
  action: "auth.mfa.verified",
  targetType: "user",
  outcome: "SUCCESS",
  metadata: { ip: req.ip, userAgent: req.headers["user-agent"] }
});`}
                </pre>
              </div>
            </div>
          )}

          {activeTab === "billing" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div className="space-y-4">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
                  <CreditCard className="w-5 h-5" />
                </div>
                <h3 className="text-2xl font-bold text-white">
                  Stripe Subscriptions & Entitlements
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Robust subscription management with Stripe Checkout and
                  Customer Portal. Server-side entitlements gate projects and
                  team member limits with optimistic concurrency control.
                </p>
                <ul className="space-y-2 text-xs text-slate-300">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>
                      Server-side quota checks before creating projects or
                      invitations
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>Zero race conditions using OCC version counters</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>
                      Self-serve Stripe billing portal for invoices & card
                      changes
                    </span>
                  </li>
                </ul>
              </div>

              <div className="bg-slate-950 rounded-xl border border-slate-800 p-4 font-mono text-xs overflow-x-auto text-slate-300">
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800 text-[10px] text-slate-500">
                  <span>entitlement_engine.ts</span>
                  <span className="text-cyan-400">ENFORCING</span>
                </div>
                <pre className="text-slate-400 leading-relaxed">
                  {`export async function assertCanCreateProject(orgId: string) {
  const { currentCount, maxAllowed } = await getProjectQuota(orgId);
  if (currentCount >= maxAllowed) {
    throw new EntitlementError(
      "Plan project limit reached. Upgrade to Pro."
    );
  }
}`}
                </pre>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Pricing Table Section */}
      <section
        id="pricing"
        className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full"
      >
        <div className="text-center max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mb-3">
            <CreditCard className="w-3.5 h-3.5" />
            <span>Transparent Pricing</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Simple, Transparent Plans
          </h2>
          <p className="text-sm sm:text-base text-slate-400 mt-2">
            Scale seamlessly from agile teams to enterprise deployments with
            dedicated database isolation.
          </p>

          {/* Monthly / Annual Toggle */}
          <div className="mt-6 inline-flex items-center gap-3 p-1 rounded-xl bg-slate-900 border border-slate-800">
            <button
              onClick={() => setIsAnnual(false)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                !isAnnual
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Monthly Billing
            </button>
            <button
              onClick={() => setIsAnnual(true)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                isAnnual
                  ? "bg-emerald-500 text-slate-950 font-bold shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <span>Annual Billing</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${isAnnual ? "bg-slate-950 text-emerald-300" : "bg-emerald-500/20 text-emerald-400"}`}
              >
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Free Starter */}
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6 flex flex-col justify-between hover:border-slate-700 transition-colors">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Starter</h3>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                  Always Free
                </span>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-extrabold text-white">$0</span>
                <span className="text-xs text-slate-400 font-mono">
                  {" "}
                  / forever
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                Essential tools for early-stage teams wanting guaranteed tenant
                data isolation.
              </p>
              <ul className="space-y-3 text-xs text-slate-300 pb-6 border-b border-slate-800/80">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Up to 3 Active Projects</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Up to 5 Team Members</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Interactive Kanban & Table views</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>PostgreSQL Row-Level Security</span>
                </li>
              </ul>
            </div>

            <Link
              href="/register"
              className="mt-6 w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs text-center transition-colors border border-slate-700/80"
            >
              Get Started Free
            </Link>
          </div>

          {/* Pro Plan (Highlighted) */}
          <div className="rounded-2xl bg-gradient-to-b from-slate-900 to-slate-900/90 border-2 border-emerald-500/50 p-6 flex flex-col justify-between shadow-xl shadow-emerald-500/10 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-bold text-[10px] uppercase tracking-wider rounded-full shadow-md">
              Most Popular
            </div>

            <div>
              <div className="flex items-center justify-between mb-4 mt-2">
                <h3 className="text-lg font-bold text-white flex items-center gap-1.5">
                  <span>Professional</span>
                  <Zap className="w-4 h-4 text-emerald-400 fill-emerald-400" />
                </h3>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Stripe Powered
                </span>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-extrabold text-white">
                  {isAnnual ? "$24" : "$29"}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {" "}
                  / month
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                Full-throttle productivity for scaling companies with advanced
                security and background queues.
              </p>
              <ul className="space-y-3 text-xs text-slate-300 pb-6 border-b border-slate-800/80">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="font-semibold text-white">
                    Up to 25 Active Projects
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="font-semibold text-white">
                    Up to 50 Team Members
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>BullMQ High-Priority Processing</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Enterprise MFA TOTP & Session Revocation</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Webhooks & Developer API Keys</span>
                </li>
              </ul>
            </div>

            <Link
              href="/register"
              className="mt-6 w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs text-center transition-all shadow-md shadow-emerald-500/25"
            >
              Start 14-Day Free Trial
            </Link>
          </div>

          {/* Enterprise */}
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6 flex flex-col justify-between hover:border-slate-700 transition-colors">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Enterprise</h3>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                  Custom SLA
                </span>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-extrabold text-white">
                  {isAnnual ? "$159" : "$199"}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {" "}
                  / month
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                Dedicated infrastructure, custom data retention, and custom
                contracts for regulated industries.
              </p>
              <ul className="space-y-3 text-xs text-slate-300 pb-6 border-b border-slate-800/80">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Unlimited Projects & Seats</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Dedicated PostgreSQL Schema / DB</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Custom Webhook Retry Schedules</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>99.99% Uptime Guarantee</span>
                </li>
              </ul>
            </div>

            <Link
              href="/register"
              className="mt-6 w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs text-center transition-colors border border-slate-700/80"
            >
              Contact Sales
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ Accordion */}
      <section
        id="faq"
        className="py-16 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto w-full"
      >
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-white">
            Frequently Asked Questions
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-2">
            Everything you need to know about tenant isolation, billing, and
            system operations.
          </p>
        </div>

        <div className="space-y-3">
          {[
            {
              q: "How does WorkSpace guarantee zero cross-tenant data leakage?",
              a: "WorkSpace uses PostgreSQL Row-Level Security (RLS) policies at the database level. When an authenticated request arrives, the API initiates a tenant transaction and sets 'app.current_organization_id'. All queries are executed by the unprivileged 'workspace_app' database user who cannot bypass RLS.",
            },
            {
              q: "How does Stripe billing and server-side entitlement enforcement work?",
              a: "When a user upgrades or manages their plan, WorkSpace provisions a Stripe Checkout or Customer Portal session. Webhooks securely update the tenant's entitlement state in the database. When users create projects or invite team members, server-side entitlement assertions verify quotas atomically.",
            },
            {
              q: "What role does BullMQ and Redis play in this monorepo?",
              a: "BullMQ processes background jobs including notification delivery, invitation expiry sweeps, and webhook dispatching. By employing the Transactional Outbox pattern, database transactions record intent immediately and BullMQ relays messages asynchronously with automatic retries.",
            },
            {
              q: "Can I self-host WorkSpace on my own infrastructure?",
              a: "Yes! WorkSpace is built with Docker Compose and standard environment variables. You only need a Node.js runtime, PostgreSQL 16+, and Redis.",
            },
          ].map((item, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div
                key={idx}
                className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full p-4 text-left flex items-center justify-between text-sm font-semibold text-white hover:text-emerald-300 transition-colors"
                >
                  <span>{item.q}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 transition-transform ${
                      isOpen ? "rotate-180 text-emerald-400" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 text-xs text-slate-400 leading-relaxed border-t border-slate-800/60 pt-3">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA Footer Banner */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        <div className="rounded-3xl bg-gradient-to-r from-emerald-950/60 via-slate-900 to-teal-950/60 border border-emerald-500/30 p-8 sm:p-12 text-center relative overflow-hidden shadow-2xl">
          <div className="max-w-2xl mx-auto space-y-4">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
              Ready to deploy your tenant workspace?
            </h2>
            <p className="text-sm text-slate-400">
              Join engineering-first organizations operating with deterministic
              data safety, fast workflows, and modern tooling.
            </p>
            <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/register"
                className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-emerald-500/20"
              >
                Create Free Workspace
              </Link>
              <Link
                href="/login"
                className="px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-medium text-sm transition-all"
              >
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-10 px-4 sm:px-6 lg:px-8 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-xs">
              W
            </div>
            <span>
              © {new Date().getFullYear()} WorkSpace Multi-Tenant SaaS. All
              rights reserved.
            </span>
          </div>

          <div className="flex items-center gap-6">
            <Link
              href="/login"
              className="hover:text-slate-300 transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="hover:text-slate-300 transition-colors"
            >
              Sign Up
            </Link>
            <Link
              href="/organizations"
              className="hover:text-slate-300 transition-colors"
            >
              Organizations Hub
            </Link>
            <Link
              href="/privacy"
              className="hover:text-slate-300 transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="hover:text-slate-300 transition-colors"
            >
              Terms of Service
            </Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="hover:text-slate-300 transition-colors flex items-center gap-1"
            >
              <span>GitHub</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
