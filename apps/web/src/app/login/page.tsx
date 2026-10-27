"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Loader2,
  KeyRound,
  Eye,
  EyeOff,
} from "lucide-react";
import { apiClient, ApiError } from "../../lib/api-client";
import {
  buildInvitationAuthHref,
  getSafeInvitationRedirect,
  normalizeInvitationEmail,
} from "../../lib/invitation-auth";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams.get("email");
  const redirectParam = searchParams.get("redirect");
  const safeRedirect = getSafeInvitationRedirect(redirectParam);
  const initialEmail = normalizeInvitationEmail(emailParam);

  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // MFA Challenge State
  const [mfaChallenge, setMfaChallenge] = useState<{
    challengeToken: string;
    expiresAt?: string;
  } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [isUsingRecovery, setIsUsingRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");

  const redirectAfterAuthentication = async () => {
    if (safeRedirect) {
      router.push(safeRedirect);
      return;
    }

    // Check organizations to redirect
    try {
      const orgRes = await apiClient.getOrganizations();
      const firstOrg = orgRes?.organizations?.[0];
      if (firstOrg?.id) {
        router.push(`/organizations/${firstOrg.id}/projects`);
      } else {
        router.push("/organizations");
      }
    } catch {
      router.push("/organizations");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Please fill in both your email and password.");
      return;
    }

    try {
      setIsLoading(true);
      const res = await apiClient.login({ email, password });

      // Check if MFA is required
      if ((res as any)?.mfaRequired || (res as any)?.data?.mfaRequired) {
        const challengeData = (res as any).data || res;
        setMfaChallenge({
          challengeToken: challengeData.challengeToken,
          expiresAt: challengeData.expiresAt,
        });
        return;
      }

      await redirectAfterAuthentication();
    } catch (err) {
      if (err instanceof ApiError) {
        const errDetails = err.details as any;
        if (errDetails?.mfaRequired) {
          setMfaChallenge({
            challengeToken: errDetails.challengeToken,
          });
          return;
        }
        setError(err.message || "Invalid email or password.");
      } else {
        setError("Failed to connect to authentication service.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaChallenge) return;
    setError(null);

    try {
      setIsLoading(true);
      if (isUsingRecovery) {
        await apiClient.verifyMfaRecovery(
          mfaChallenge.challengeToken,
          recoveryCode,
        );
      } else {
        await apiClient.verifyMfaChallenge(
          mfaChallenge.challengeToken,
          mfaCode,
        );
      }

      await redirectAfterAuthentication();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "Invalid verification code.");
      } else {
        setError("MFA verification failed. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8 selection:bg-emerald-500 selection:text-slate-950 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-10 right-10 w-[300px] h-[300px] bg-teal-500/5 rounded-full blur-2xl pointer-events-none -z-10" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Link
          href="/"
          className="flex items-center justify-center gap-3 group mb-2"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-[1px] shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
            <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center text-emerald-400 font-bold text-xl">
              W
            </div>
          </div>
          <span className="font-extrabold text-2xl tracking-tight text-white">
            WorkSpace
          </span>
        </Link>
        <h2 className="mt-4 text-center text-2xl font-bold tracking-tight text-white">
          {mfaChallenge ? "Two-Factor Verification" : "Sign in to your account"}
        </h2>
        <p className="mt-1 text-center text-xs text-slate-400">
          {mfaChallenge
            ? "Enter the 6-digit authenticator code or backup key"
            : "Enterprise Multi-Tenant Project Management"}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-slate-900/80 backdrop-blur-md py-8 px-6 sm:px-8 shadow-2xl rounded-2xl border border-slate-800">
          {error && (
            <div className="mb-6 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!mfaChallenge ? (
            <form onSubmit={handleLogin} className="space-y-5">
              {safeRedirect && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    Sign in
                    {initialEmail ? (
                      <>
                        {" "}
                        with{" "}
                        <strong className="text-white">{initialEmail}</strong>
                      </>
                    ) : null}{" "}
                    to continue to your workspace invitation.
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    name="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-slate-300">
                    Password
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-semibold text-sm transition-all shadow-lg shadow-emerald-500/25 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* MFA Challenge Form */
            <form onSubmit={handleMfaSubmit} className="space-y-5">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>
                  Two-Factor Authentication is active on this account.
                </span>
              </div>

              {!isUsingRecovery ? (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Authenticator Code (6-digit)
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      name="mfaCode"
                      autoFocus
                      maxLength={6}
                      pattern="[0-9]{6}"
                      required
                      value={mfaCode}
                      onChange={(e) =>
                        setMfaCode(e.target.value.replace(/\D/g, ""))
                      }
                      placeholder="6-digit code"
                      className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white font-mono tracking-widest text-center text-lg placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Backup Recovery Code
                  </label>
                  <input
                    type="text"
                    name="recoveryCode"
                    autoFocus
                    required
                    value={recoveryCode}
                    onChange={(e) => setRecoveryCode(e.target.value)}
                    placeholder="xxxx-xxxx-xxxx"
                    className="w-full px-3.5 py-2.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white font-mono text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-semibold text-sm transition-all shadow-lg shadow-emerald-500/25 disabled:opacity-60"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying Code...</span>
                  </>
                ) : (
                  <>
                    <span>Confirm Verification</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                <button
                  type="button"
                  onClick={() => setIsUsingRecovery(!isUsingRecovery)}
                  className="hover:text-emerald-400 underline underline-offset-4"
                >
                  {isUsingRecovery
                    ? "Use Authenticator App instead"
                    : "Use emergency recovery code"}
                </button>
                <button
                  type="button"
                  onClick={() => setMfaChallenge(null)}
                  className="hover:text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="mt-6 text-center text-xs text-slate-400">
            Don&apos;t have an account?{" "}
            <Link
              href={buildInvitationAuthHref("/register", {
                email: email || emailParam,
                redirect: redirectParam,
              })}
              className="text-emerald-400 hover:text-emerald-300 font-semibold underline underline-offset-4"
            >
              Sign up for free
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
