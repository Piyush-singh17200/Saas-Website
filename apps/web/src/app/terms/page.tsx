import React from "react";
import Link from "next/link";
import { ShieldCheck, FileCheck, AlertCircle, Scale, ArrowLeft } from "lucide-react";

export default function TermsOfServicePage() {
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
            <Scale className="w-3.5 h-3.5" />
            <span>Enterprise Terms of Service</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Terms of Service
          </h1>
          <p className="text-sm text-slate-400">
            Last updated: October 2026 • Governing terms for all organizations, accounts, and API consumers.
          </p>
        </div>

        <div className="space-y-10 text-slate-300 text-sm leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-emerald-400" />
              <span>1. Acceptance & Authorized Usage</span>
            </h2>
            <p>
              By accessing WorkSpace, creating an account, or registering an organization, you agree to be bound by these Terms of Service. You affirm that you are at least 18 years of age and authorized to bind your entity or organization to these terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>2. Security & Account Responsibilities</span>
            </h2>
            <p>
              You are responsible for safeguarding your login credentials, API secrets, and two-factor authentication recovery codes. You must immediately notify WorkSpace of any suspected unauthorized access or compromise of your organization&apos;s workspace.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-emerald-400" />
              <span>3. Prohibited Activities</span>
            </h2>
            <p>Users and automated API integrations agree NOT to:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
              <li>Attempt to bypass or reverse-engineer Row-Level Security (RLS) tenant isolation.</li>
              <li>Execute automated denial-of-service attacks, port scans, or API rate limit abuses.</li>
              <li>Upload malicious payloads, viruses, or unauthorized attachments.</li>
              <li>Use webhooks or event streams to distribute spam or unauthorized telemetry.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Scale className="w-4 h-4 text-emerald-400" />
              <span>4. Service Availability & SLA</span>
            </h2>
            <p>
              WorkSpace strives to maintain 99.9% uptime for core collaboration and API services. Scheduled maintenance windows will be communicated in advance via in-app notices or status advisories.
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
