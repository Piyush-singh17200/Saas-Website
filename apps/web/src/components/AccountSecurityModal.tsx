"use client";

import React, { useState, useEffect } from "react";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Key,
  Copy,
  Check,
  AlertTriangle,
  Laptop,
  Trash2,
  RefreshCw,
  X,
  Lock,
} from "lucide-react";
import { apiClient } from "../lib/api-client";
import type { SessionResponse, MfaSetupResponse } from "@workspace/contracts";

interface AccountSecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: {
    id: string;
    email: string;
    displayName: string;
    mfaEnabled?: boolean;
  };
  onUserUpdated?: () => void;
}

export function AccountSecurityModal({
  isOpen,
  onClose,
  currentUser,
  onUserUpdated,
}: AccountSecurityModalProps) {
  const [activeTab, setActiveTab] = useState<"mfa" | "sessions" | "danger">("mfa");
  const [mfaEnabled, setMfaEnabled] = useState(
    currentUser?.mfaEnabled ?? false,
  );

  // Danger Zone: Delete Account
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmationPhrase, setDeleteConfirmationPhrase] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // MFA Enrollment State
  const [setupData, setSetupData] = useState<MfaSetupResponse | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);

  // Disable MFA & Regenerate Codes
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [showRegenModal, setShowRegenModal] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newRecoveryCodes, setNewRecoveryCodes] = useState<string[] | null>(
    null,
  );

  // Sessions State
  const [sessions, setSessions] = useState<SessionResponse[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Status & Feedback
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser?.mfaEnabled !== undefined) {
      setMfaEnabled(currentUser.mfaEnabled);
    }
  }, [currentUser]);

  useEffect(() => {
    if (isOpen && activeTab === "sessions") {
      loadSessions();
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  async function loadSessions() {
    setLoadingSessions(true);
    setError(null);
    try {
      const res = await apiClient.getSessions();
      setSessions(res.sessions);
    } catch (err: any) {
      setError(err.message || "Failed to load active sessions");
    } finally {
      setLoadingSessions(false);
    }
  }

  async function handleStartMfaSetup() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiClient.setupMfa();
      setSetupData(res);
      setIsSettingUp(true);
    } catch (err: any) {
      setError(err.message || "Failed to initiate MFA setup");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmMfa() {
    if (!verificationCode || verificationCode.length !== 6) {
      setError("Please enter a valid 6-digit verification code");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await apiClient.enableMfa(verificationCode);
      setMfaEnabled(true);
      setIsSettingUp(false);
      setSetupData(null);
      setVerificationCode("");
      setSuccess("Multi-Factor Authentication enabled successfully!");
      onUserUpdated?.();
    } catch (err: any) {
      setError(
        err.message ||
          "Invalid verification code. Check your authenticator app.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleDisableMfa() {
    if (!confirmPassword) {
      setError("Password is required to disable MFA");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await apiClient.disableMfa(confirmPassword);
      setMfaEnabled(false);
      setShowDisableModal(false);
      setConfirmPassword("");
      setSuccess("Multi-Factor Authentication has been disabled");
      onUserUpdated?.();
    } catch (err: any) {
      setError(
        err.message || "Failed to disable MFA. Please check your password.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleRegenerateCodes() {
    if (!confirmPassword) {
      setError("Password is required to regenerate recovery codes");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.regenerateRecoveryCodes(confirmPassword);
      setNewRecoveryCodes(res.recoveryCodes);
      setShowRegenModal(false);
      setConfirmPassword("");
      setSuccess(
        "New recovery codes generated. Previous codes have been invalidated.",
      );
    } catch (err: any) {
      setError(
        err.message || "Failed to regenerate codes. Check your password.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleRevokeSession(sessionId: string) {
    setLoading(true);
    setError(null);
    try {
      await apiClient.revokeSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setSuccess("Session revoked successfully");
    } catch (err: any) {
      setError(err.message || "Failed to revoke session");
    } finally {
      setLoading(false);
    }
  }

  async function handleRevokeOtherSessions() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.revokeOtherSessions();
      setSessions((prev) => prev.filter((s) => s.isCurrent));
      setSuccess(`Revoked ${res.revokedCount} other active session(s)`);
    } catch (err: any) {
      setError(err.message || "Failed to revoke other sessions");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirmationPhrase !== "DELETE MY ACCOUNT") {
      setError("Please type 'DELETE MY ACCOUNT' in capital letters to confirm.");
      return;
    }
    if (!deletePassword) {
      setError("Your current account password is required.");
      return;
    }

    setIsDeletingAccount(true);
    setError(null);
    try {
      await apiClient.deleteAccount({
        password: deletePassword,
        confirmationPhrase: deleteConfirmationPhrase,
      });
      window.location.href = "/login";
    } catch (err: any) {
      setError(err.message || "Failed to delete account. Please verify your password.");
      setIsDeletingAccount(false);
    }
  }

  function copyToClipboard(text: string, type: "key" | "codes") {
    navigator.clipboard.writeText(text);
    if (type === "key") {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else {
      setCopiedCodes(true);
      setTimeout(() => setCopiedCodes(false), 2000);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Account Security
              </h2>
              <p className="text-xs text-slate-400">
                Manage your two-factor authentication, active login sessions, and account lifecycle
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 px-6 gap-4">
          <button
            onClick={() => setActiveTab("mfa")}
            className={`py-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === "mfa"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Smartphone className="w-4 h-4" />
            Two-Factor Authentication (TOTP)
          </button>
          <button
            onClick={() => setActiveTab("sessions")}
            className={`py-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === "sessions"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Laptop className="w-4 h-4" />
            Active Sessions ({sessions.length})
          </button>
          <button
            onClick={() => setActiveTab("danger")}
            className={`py-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === "danger"
                ? "border-rose-500 text-rose-400"
                : "border-transparent text-slate-400 hover:text-rose-300"
            }`}
          >
            <Trash2 className="w-4 h-4" />
            Danger Zone
          </button>
        </div>

        {/* Feedback Banners */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {activeTab === "mfa" && (
            <div className="space-y-6">
              {/* MFA Status Card */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/40 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {mfaEnabled ? (
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                      <ShieldAlert className="w-5 h-5" />
                    </div>
                  )}
                  <div>
                    <h3 className="text-sm font-medium text-white">
                      {mfaEnabled
                        ? "Multi-Factor Authentication is Active"
                        : "MFA is Not Configured"}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {mfaEnabled
                        ? "Your account requires a 6-digit authenticator code on each sign-in"
                        : "Protect your account from unauthorized access by requiring an authenticator code"}
                    </p>
                  </div>
                </div>

                {mfaEnabled ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowRegenModal(true)}
                      className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs font-medium text-slate-200 hover:bg-slate-700 transition-colors flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Regenerate Codes
                    </button>
                    <button
                      onClick={() => setShowDisableModal(true)}
                      className="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors"
                    >
                      Disable
                    </button>
                  </div>
                ) : (
                  !isSettingUp && (
                    <button
                      onClick={handleStartMfaSetup}
                      disabled={loading}
                      className="px-4 py-2 rounded-lg bg-emerald-500 text-slate-950 text-xs font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-50"
                    >
                      {loading ? "Starting..." : "Enable 2FA"}
                    </button>
                  )
                )}
              </div>

              {/* MFA Setup Walkthrough */}
              {isSettingUp && setupData && (
                <div className="p-5 rounded-xl border border-emerald-500/30 bg-slate-950/80 space-y-5 animate-in fade-in duration-150">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-emerald-400">
                        Step 1: Scan QR Code or Enter Setup Key
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Open your authenticator app (e.g. Google Authenticator,
                        1Password, Authy)
                      </p>
                    </div>
                    <button
                      onClick={() => setIsSettingUp(false)}
                      className="text-xs text-slate-500 hover:text-slate-300"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-3">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="font-mono text-sm tracking-wider text-white break-all select-all">
                        {setupData.manualKey}
                      </div>
                      <button
                        onClick={() =>
                          copyToClipboard(setupData.manualKey, "key")
                        }
                        className="px-3 py-1.5 rounded-md bg-slate-800 text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1.5 shrink-0"
                      >
                        {copiedKey ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        {copiedKey ? "Copied" : "Copy Key"}
                      </button>
                    </div>
                  </div>

                  {/* Single-Use Recovery Codes Warning */}
                  <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
                        <Key className="w-4 h-4" />
                        <span>Step 2: Save Your Backup Recovery Codes</span>
                      </div>
                      <button
                        onClick={() =>
                          copyToClipboard(
                            setupData.recoveryCodes.join("\n"),
                            "codes",
                          )
                        }
                        className="px-2.5 py-1 rounded bg-slate-900 border border-amber-500/30 text-amber-300 text-xs hover:bg-slate-800 flex items-center gap-1"
                      >
                        {copiedCodes ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        {copiedCodes ? "Copied" : "Copy All"}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Save these single-use recovery codes in a secure password
                      manager. If you lose your phone, they are your only
                      fallback to regain access.
                    </p>
                    <div className="grid grid-cols-2 gap-2 font-mono text-xs text-slate-200 bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                      {setupData.recoveryCodes.map((code, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="text-slate-500 text-[10px]">
                            {idx + 1}.
                          </span>
                          <span>{code}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Verification Input */}
                  <div className="space-y-3 pt-2">
                    <label className="block text-xs font-medium text-slate-300">
                      Step 3: Enter the 6-Digit Code from Your Authenticator App
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="000000"
                        value={verificationCode}
                        onChange={(e) =>
                          setVerificationCode(e.target.value.replace(/\D/g, ""))
                        }
                        className="w-48 px-4 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-center font-mono text-lg tracking-widest text-white focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        onClick={handleConfirmMfa}
                        disabled={loading || verificationCode.length !== 6}
                        className="px-5 py-2.5 rounded-lg bg-emerald-500 text-slate-950 text-sm font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-50"
                      >
                        {loading ? "Verifying..." : "Verify & Activate"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Display Newly Regenerated Recovery Codes */}
              {newRecoveryCodes && (
                <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-400">
                      Your New Backup Recovery Codes
                    </span>
                    <button
                      onClick={() =>
                        copyToClipboard(newRecoveryCodes.join("\n"), "codes")
                      }
                      className="px-2.5 py-1 rounded bg-slate-900 border border-emerald-500/30 text-emerald-300 text-xs hover:bg-slate-800 flex items-center gap-1"
                    >
                      {copiedCodes ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      {copiedCodes ? "Copied" : "Copy Codes"}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 font-mono text-xs text-slate-200 bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                    {newRecoveryCodes.map((code, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-slate-500 text-[10px]">
                          {idx + 1}.
                        </span>
                        <span>{code}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "sessions" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-white">
                    Active Sessions & Devices
                  </h3>
                  <p className="text-xs text-slate-400">
                    These devices are currently signed in to your account.
                  </p>
                </div>
                {sessions.length > 1 && (
                  <button
                    onClick={handleRevokeOtherSessions}
                    disabled={loading}
                    className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Revoke Other Sessions
                  </button>
                )}
              </div>

              {loadingSessions ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Loading active sessions...
                </div>
              ) : sessions.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  No active sessions found.
                </div>
              ) : (
                <div className="space-y-2">
                  {sessions.map((sess) => (
                    <div
                      key={sess.id}
                      className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/40 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400">
                          <Laptop className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-white">
                              {sess.userAgent || "Unknown Browser / Client"}
                            </span>
                            {sess.isCurrent && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                This Device
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-3 mt-0.5 font-mono">
                            <span>IP: {sess.ipAddress || "127.0.0.1"}</span>
                            <span>
                              Signed in:{" "}
                              {new Date(sess.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      {!sess.isCurrent && (
                        <button
                          onClick={() => handleRevokeSession(sess.id)}
                          disabled={loading}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-400 text-xs transition-colors"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "danger" && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 space-y-2">
                <div className="flex items-center gap-2 text-rose-400 font-semibold text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Permanent Account Deletion</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Deleting your account permanently removes your identity, profile, and all active sessions. Organizations where you are the sole owner will also be cleaned up.
                </p>
                <p className="text-xs text-rose-300 font-medium leading-relaxed">
                  Notice: If you are the sole owner of an organization with other team members, you must first transfer ownership or remove other members before you can delete your account.
                </p>
              </div>

              <div className="space-y-4 p-4 rounded-xl border border-slate-800 bg-slate-950/40">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Type <span className="font-mono font-bold text-rose-400">DELETE MY ACCOUNT</span> to confirm:
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmationPhrase}
                    onChange={(e) => setDeleteConfirmationPhrase(e.target.value)}
                    placeholder="DELETE MY ACCOUNT"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-700 font-mono text-sm text-white placeholder-slate-600 focus:outline-none focus:border-rose-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Confirm Your Password:
                  </label>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-rose-500 transition-colors"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    disabled={
                      isDeletingAccount ||
                      deleteConfirmationPhrase !== "DELETE MY ACCOUNT" ||
                      !deletePassword
                    }
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-all shadow-lg shadow-rose-600/25 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{isDeletingAccount ? "Deleting Account..." : "Permanently Delete My Account"}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Disable MFA Password Confirmation Modal */}
        {showDisableModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 w-full max-w-sm space-y-4">
              <div className="flex items-center gap-2 text-red-400 font-semibold text-sm">
                <Lock className="w-4 h-4" />
                <span>Confirm Password to Disable MFA</span>
              </div>
              <p className="text-xs text-slate-400">
                Disabling MFA weakens your account security. Please verify your
                current password to continue.
              </p>
              <input
                type="password"
                placeholder="Current Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-red-500"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowDisableModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDisableMfa}
                  disabled={loading || !confirmPassword}
                  className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 disabled:opacity-50"
                >
                  {loading ? "Verifying..." : "Disable MFA"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Regenerate Codes Password Confirmation Modal */}
        {showRegenModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 w-full max-w-sm space-y-4">
              <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
                <Key className="w-4 h-4" />
                <span>Regenerate Recovery Codes</span>
              </div>
              <p className="text-xs text-slate-400">
                Generating new codes will immediately invalidate any existing
                backup recovery codes.
              </p>
              <input
                type="password"
                placeholder="Current Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowRegenModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRegenerateCodes}
                  disabled={loading || !confirmPassword}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 text-xs font-semibold hover:bg-emerald-400 disabled:opacity-50"
                >
                  {loading ? "Generating..." : "Generate Codes"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
