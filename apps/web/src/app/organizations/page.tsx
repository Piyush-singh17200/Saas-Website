"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  Plus,
  ArrowRight,
  ShieldCheck,
  Loader2,
  LogOut,
  AlertCircle,
} from "lucide-react";
import type { OrganizationResponse } from "@workspace/contracts";
import { apiClient, ApiError } from "../../lib/api-client";

export default function OrganizationsPage() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<OrganizationResponse[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Organization Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const loadOrganizations = React.useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiClient.getOrganizations();
      setOrganizations(res.organizations || []);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.push("/login");
        return;
      }
      setError(
        "Failed to load organizations. Please ensure you are logged in.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadOrganizations();
  }, [loadOrganizations]);

  const handleNameChange = (val: string) => {
    setName(val);
    setSlug(
      val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
    );
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!name || !slug) {
      setModalError("Please provide both organization name and unique slug.");
      return;
    }

    try {
      setIsCreating(true);
      const res = await apiClient.createOrganization({ name, slug });
      setIsModalOpen(false);
      setName("");
      setSlug("");
      router.push(`/organizations/${res.organization.id}/projects`);
    } catch (err) {
      if (err instanceof ApiError) {
        setModalError(err.message || "Failed to create organization.");
      } else {
        setModalError("An unexpected error occurred.");
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiClient.logout();
    } catch {
      // ignore
    }
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-lg group-hover:scale-105 transition-transform">
              W
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-lg tracking-tight text-white leading-none">
                WorkSpace
              </span>
              <span className="text-[10px] text-slate-400 font-mono tracking-wider uppercase">
                Organizations Hub
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors shadow-md shadow-emerald-500/20"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Organization</span>
            </button>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-10">
        <div className="max-w-3xl mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Your Organizations
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Select a tenant workspace or create a new organization with isolated
            Row-Level Security.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between text-rose-300 text-sm">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
            <Link
              href="/login"
              className="px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs rounded-lg font-medium transition-colors"
            >
              Go to Login
            </Link>
          </div>
        )}

        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-7 h-7 animate-spin text-emerald-400" />
            <span className="text-sm">Fetching tenant workspaces...</span>
          </div>
        ) : organizations.length === 0 ? (
          <div className="p-10 rounded-2xl bg-slate-900/50 border border-slate-800/80 text-center max-w-md mx-auto my-12">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-white">
              No organizations found
            </h3>
            <p className="text-xs text-slate-400 mt-1 mb-6">
              Create your first organization to set up isolated projects, invite
              your team, and configure billing.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm transition-colors shadow-lg shadow-emerald-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>Create First Organization</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {organizations.map((org) => (
              <div
                key={org.id}
                className="group p-5 rounded-2xl bg-slate-900/60 hover:bg-slate-900/90 border border-slate-800/80 hover:border-emerald-500/40 transition-all flex flex-col justify-between shadow-sm"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-base">
                        {org.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h2 className="text-base font-semibold text-white group-hover:text-emerald-300 transition-colors">
                          {org.name}
                        </h2>
                        <span className="text-xs font-mono text-slate-500">
                          slug: {org.slug}
                        </span>
                      </div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                      {org.role || "MEMBER"}
                    </span>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between mt-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>RLS Protected Tenant</span>
                  </div>

                  <Link
                    href={`/organizations/${org.id}/projects`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 group-hover:text-emerald-300"
                  >
                    <span>Open Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Organization Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-lg font-bold text-white mb-1">
              Create New Organization
            </h2>
            <p className="text-xs text-slate-400 mb-5">
              Set up a new isolated organization workspace with dedicated team
              access.
            </p>

            {modalError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateOrg} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Organization Name
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Acme Corporation"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Organization Slug (Identifier)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="acme-corp"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase())}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Used for unique tenant identification and routing.
                </p>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors shadow-md shadow-emerald-500/20 disabled:opacity-60"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create Organization</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
