import React from "react";
import Link from "next/link";
import { Shield, Lock, Eye, Database, Trash2, ArrowLeft } from "lucide-react";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-slate-950">
      {/* Navigation Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm group-hover:scale-105 transition-transform">
              W
            </div>
            <span className="font-semibold text-white tracking-tight">WorkSpace</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Home</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-12">
        <div className="space-y-4 mb-10 pb-8 border-b border-slate-800">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
            <Shield className="w-3.5 h-3.5" />
            <span>Enterprise Privacy & Trust Standards</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-sm text-slate-400">
            Last updated: October 2026 • Effective immediately for all WorkSpace tenants and users.
          </p>
        </div>

        <div className="space-y-10 text-slate-300 text-sm leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-400" />
              <span>1. Tenant Isolation & Data Boundary</span>
            </h2>
            <p>
              WorkSpace is engineered with strict cryptographic and database isolation. Every organization&apos;s data is governed by PostgreSQL Row-Level Security (RLS) policies. Your tasks, attachments, projects, API keys, and audit trails cannot be queried or accessed by users outside your verified organization boundary.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Eye className="w-4 h-4 text-emerald-400" />
              <span>2. Information We Collect</span>
            </h2>
            <p>We collect only the minimum required information to provide secure service:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
              <li><strong className="text-slate-200">Account Credentials:</strong> Email address, cryptographically hashed passwords (Argon2id/bcrypt), and Multi-Factor Authentication keys.</li>
              <li><strong className="text-slate-200">Security & Session Metadata:</strong> IP address, user-agent headers, and authentication timestamps for session tracking and threat prevention.</li>
              <li><strong className="text-slate-200">Workspace Content:</strong> Projects, tasks, comments, and uploaded attachments you create within your organization.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-400" />
              <span>3. How We Secure Your Data</span>
            </h2>
            <p>
              All traffic between your client and our services is secured via TLS 1.3 encryption. Passwords and recovery keys are never stored in plaintext. Sensitive session tokens are dispatched over HTTP-only, SameSite strict cookies. API keys are hashed with SHA-256 before storage in the database.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-emerald-400" />
              <span>4. Right to Deletion & Account Erasure</span>
            </h2>
            <p>
              In accordance with GDPR, CCPA, and global privacy standards, you have the right to completely and permanently delete your account at any time through the Account Security modal. Deletion cascades through all personal records and active sessions immediately.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>5. Contact Our Data Protection Office</span>
            </h2>
            <p>
              For privacy inquiries, audit disclosures, or data portability requests, contact our security team at <span className="text-emerald-400 font-mono text-xs">privacy@workspace.internal</span>.
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500">
        © 2026 WorkSpace SaaS Platform. All rights reserved.
      </footer>
    </div>
  );
}
