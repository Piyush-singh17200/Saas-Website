import Link from "next/link";
import { ArrowLeft, Home, HelpCircle, ShieldAlert } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-6 selection:bg-emerald-500 selection:text-slate-950 relative overflow-hidden">
      {/* Background glow accents */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[350px] bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-10 right-10 w-[250px] h-[250px] bg-teal-500/5 rounded-full blur-2xl pointer-events-none -z-10" />

      <div className="max-w-md w-full text-center space-y-6">
        <div className="inline-flex p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-2">
          <ShieldAlert className="w-10 h-10" />
        </div>

        <div className="space-y-2">
          <span className="text-xs uppercase tracking-widest font-mono text-emerald-400 font-semibold">
            404 — Page Not Found
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Lost in the workspace?
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed max-w-sm mx-auto">
            The resource, project, or page you were looking for doesn&apos;t exist or has been moved to another location.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/organizations"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-semibold text-sm transition-all shadow-lg shadow-emerald-500/25"
          >
            <Home className="w-4 h-4" />
            <span>Go to WorkSpace</span>
          </Link>
          <Link
            href="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white font-medium text-sm transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </Link>
        </div>

        <div className="pt-6 border-t border-slate-900 text-xs text-slate-500 flex items-center justify-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Need help? Contact your organization administrator.</span>
        </div>
      </div>
    </div>
  );
}
