"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Mail,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { apiClient, ApiError } from "../../lib/api-client";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<
    "idle" | "verifying" | "success" | "error"
  >(token ? "verifying" : "idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Resend state
  const [resendEmail, setResendEmail] = useState("");
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    let isMounted = true;
    const executeVerification = async () => {
      try {
        await apiClient.verifyEmail({ token });
        if (isMounted) {
          setStatus("success");
        }
      } catch (err) {
        if (isMounted) {
          setStatus("error");
          if (err instanceof ApiError) {
            setErrorMessage(
              err.message || "Invalid or expired verification link.",
            );
          } else {
            setErrorMessage(
              "Failed to verify email. Please try again or request a new link.",
            );
          }
        }
      }
    };

    executeVerification();

    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setResendError(null);
    setResendSuccess(false);

    if (!resendEmail.trim()) {
      setResendError("Please enter your email address.");
      return;
    }

    try {
      setIsResending(true);
      await apiClient.resendVerification({ email: resendEmail.trim() });
      setResendSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setResendError(err.message || "Failed to resend verification email.");
      } else {
        setResendError("Network error. Please try again.");
      }
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8 selection:bg-emerald-500 selection:text-slate-950 relative overflow-hidden">
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
          Email Verification
        </h2>
        <p className="mt-1 text-center text-xs text-slate-400">
          Confirm your account email address for trusted access
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-slate-900/80 backdrop-blur-md py-8 px-6 sm:px-8 shadow-2xl rounded-2xl border border-slate-800">
          {/* Automatic verification in progress */}
          {status === "verifying" && (
            <div className="text-center py-6 space-y-4">
              <Loader2 className="w-10 h-10 animate-spin text-emerald-400 mx-auto" />
              <h3 className="text-base font-semibold text-white">
                Verifying your email...
              </h3>
              <p className="text-xs text-slate-400">
                Please wait while we confirm your security verification token.
              </p>
            </div>
          )}

          {/* Verification succeeded */}
          {status === "success" && (
            <div className="text-center space-y-5">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">
                  Email Confirmed!
                </h3>
                <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                  Your email address has been successfully verified. Your
                  account is now fully trusted and ready for collaboration.
                </p>
              </div>
              <div className="pt-2">
                <Link
                  href="/login"
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-semibold text-sm transition-all shadow-lg shadow-emerald-500/25"
                >
                  <span>Continue to Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          )}

          {/* Verification error or no token provided */}
          {(status === "error" || status === "idle") && (
            <div className="space-y-6">
              {status === "error" && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <span>
                    {errorMessage || "Invalid or expired verification link."}
                  </span>
                </div>
              )}

              {status === "idle" && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-amber-300 text-xs">
                  <Mail className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                  <span>
                    No verification token was detected in your URL. You can
                    request a new verification link below.
                  </span>
                </div>
              )}

              {/* Resend Verification Form */}
              <div className="pt-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Resend Verification Email</span>
                </h4>
                <p className="text-xs text-slate-400 mb-4">
                  Enter your email address and we&apos;ll send you a fresh
                  verification link.
                </p>

                {resendSuccess && (
                  <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      A new verification link has been dispatched to your inbox.
                    </span>
                  </div>
                )}

                {resendError && (
                  <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{resendError}</span>
                  </div>
                )}

                <form onSubmit={handleResend} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Your Email Address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        required
                        value={resendEmail}
                        onChange={(e) => setResendEmail(e.target.value)}
                        placeholder="name@company.com"
                        className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isResending}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-medium text-xs transition-all disabled:opacity-60"
                  >
                    {isResending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                        <span>Sending Link...</span>
                      </>
                    ) : (
                      <>
                        <span>Send Verification Email</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </form>
              </div>

              <div className="pt-2 border-t border-slate-800 text-center">
                <Link
                  href="/login"
                  className="text-xs text-slate-400 hover:text-emerald-400 transition-colors"
                >
                  Return to sign in
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
