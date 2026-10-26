"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Mail,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  KeyRound,
} from "lucide-react";
import { apiClient, ApiError } from "../../lib/api-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !email.includes("@")) {
      setError("Please provide a valid email address.");
      return;
    }

    try {
      setIsLoading(true);
      const res = await apiClient.forgotPassword({ email });
      setIsSubmitted(true);
      setSuccessMessage(res.message);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "Failed to process password reset request.");
      } else {
        setError("An unexpected error occurred. Please try again later.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 selection:bg-emerald-500 selection:text-slate-950">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl shadow-emerald-950/20">
        <div className="text-center mb-8">
          <div className="inline-flex p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-4">
            <KeyRound className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Reset your password
          </h1>
          <p className="text-sm text-slate-400 mt-2">
            Enter your email and we&apos;ll send you single-use instructions to
            reset your account password.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="leading-snug">{error}</p>
          </div>
        )}

        {isSubmitted ? (
          <div className="space-y-6">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" />
              <div className="space-y-1">
                <p className="font-semibold text-emerald-200">
                  Request Dispatched
                </p>
                <p className="text-slate-300 leading-snug">{successMessage}</p>
              </div>
            </div>

            <p className="text-xs text-slate-500 text-center">
              Didn&apos;t receive an email? Check your spam folder or wait a few
              minutes before submitting another request.
            </p>

            <div className="pt-2">
              <Link
                href="/login"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition text-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                Return to Login
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2"
              >
                Work Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@company.com"
                  disabled={isLoading}
                  required
                  className="w-full pl-10 pr-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 text-sm transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold text-sm transition shadow-lg shadow-emerald-500/20"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating secure link...
                </>
              ) : (
                <>
                  Send Reset Link
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="text-center pt-2">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
