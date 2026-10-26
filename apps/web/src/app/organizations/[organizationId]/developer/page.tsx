"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Key,
  Webhook,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Loader2,
  RefreshCw,
  Terminal,
  BookOpen,
} from "lucide-react";
import type {
  ApiKeyResponse,
  WebhookSubscriptionResponse,
  WebhookDeliveryResponse,
  CreateApiKeyInput,
  CreateWebhookSubscriptionInput,
} from "@workspace/contracts";
import { apiClient, ApiError } from "../../../../lib/api-client";
import { Navbar } from "../../../../components/Navbar";

export default function OrganizationDeveloperPage() {
  const params = useParams();
  const organizationId = params.organizationId as string;

  const [activeTab, setActiveTab] = useState<
    "keys" | "webhooks" | "deliveries" | "docs"
  >("keys");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Data states
  const [apiKeys, setApiKeys] = useState<ApiKeyResponse[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookSubscriptionResponse[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryResponse[]>([]);

  // Modal states
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<{
    title: string;
    secret: string;
    warning: string;
  } | null>(null);
  const [hasCopied, setHasCopied] = useState(false);

  // Create Key Form
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>([
    "projects:read",
    "tasks:read",
  ]);
  const [newKeyExpiryDays, setNewKeyExpiryDays] = useState<number | undefined>(
    undefined,
  );
  const [isSubmittingKey, setIsSubmittingKey] = useState(false);

  // Create Webhook Form
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [newWebhookDesc, setNewWebhookDesc] = useState("");
  const [newWebhookEvents, setNewWebhookEvents] = useState<string[]>([
    "task.created",
    "task.updated",
    "task.deleted",
  ]);
  const [isSubmittingWebhook, setIsSubmittingWebhook] = useState(false);

  // Action loaders
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!organizationId) return;
    try {
      setIsLoading(true);
      setError(null);

      const [keysRes, hooksRes, delivRes] = await Promise.all([
        apiClient.listApiKeys(organizationId, "all"),
        apiClient.listWebhookSubscriptions(organizationId),
        apiClient.listWebhookDeliveries(organizationId, { page: 1, limit: 20 }),
      ]);

      setApiKeys(keysRes.keys);
      setWebhooks(hooksRes.subscriptions);
      setDeliveries(delivRes.deliveries);
    } catch (err: any) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to load developer platform data",
      );
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Key Creation
  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim() || newKeyScopes.length === 0) return;

    try {
      setIsSubmittingKey(true);
      setError(null);

      const payload: CreateApiKeyInput = {
        name: newKeyName.trim(),
        scopes: newKeyScopes,
        expiresInDays: newKeyExpiryDays,
      };

      const result = await apiClient.createApiKey(organizationId, payload);
      setApiKeys((prev) => [result.apiKey, ...prev]);
      setIsKeyModalOpen(false);
      setNewKeyName("");
      setNewKeyScopes(["projects:read", "tasks:read"]);
      setNewKeyExpiryDays(undefined);

      // Show secret modal
      setRevealedSecret({
        title: "API Key Created",
        secret: result.secret,
        warning:
          "Copy this key now. It will never be shown again and cannot be recovered.",
      });
    } catch (err: any) {
      setError(
        err instanceof ApiError ? err.message : "Failed to create API key",
      );
    } finally {
      setIsSubmittingKey(false);
    }
  };

  // Handle Key Revocation
  const handleRevokeKey = async (keyId: string) => {
    if (
      !confirm(
        "Are you sure you want to revoke this API key? Applications using this key will immediately be denied access.",
      )
    ) {
      return;
    }

    try {
      setActionLoadingId(keyId);
      const revoked = await apiClient.revokeApiKey(organizationId, keyId);
      setApiKeys((prev) => prev.map((k) => (k.id === keyId ? revoked : k)));
      setSuccessNotice("API key revoked successfully.");
    } catch (err: any) {
      setError(
        err instanceof ApiError ? err.message : "Failed to revoke API key",
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Webhook Creation
  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWebhookUrl.trim() || newWebhookEvents.length === 0) return;

    try {
      setIsSubmittingWebhook(true);
      setError(null);

      const payload: CreateWebhookSubscriptionInput = {
        url: newWebhookUrl.trim(),
        description: newWebhookDesc.trim() || undefined,
        eventTypes: newWebhookEvents,
      };

      const result = await apiClient.createWebhookSubscription(
        organizationId,
        payload,
      );
      setWebhooks((prev) => [result.subscription, ...prev]);
      setIsWebhookModalOpen(false);
      setNewWebhookUrl("");
      setNewWebhookDesc("");
      setNewWebhookEvents(["task.created", "task.updated", "task.deleted"]);

      setRevealedSecret({
        title: "Webhook Subscription Created",
        secret: result.secret,
        warning:
          "Store your signing secret safely. Use it to verify the WorkSpace-Signature HMAC on incoming event payloads.",
      });
    } catch (err: any) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to create webhook subscription",
      );
    } finally {
      setIsSubmittingWebhook(false);
    }
  };

  // Handle Webhook Ping
  const handleTriggerPing = async (subscriptionId: string) => {
    try {
      setActionLoadingId(`ping-${subscriptionId}`);
      await apiClient.triggerWebhookPing(organizationId, subscriptionId);
      setSuccessNotice(
        "Test ping event dispatched! Check delivery logs below.",
      );
      // Refresh deliveries
      const delivRes = await apiClient.listWebhookDeliveries(organizationId, {
        page: 1,
        limit: 20,
      });
      setDeliveries(delivRes.deliveries);
    } catch (err: any) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to trigger webhook ping",
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Secret Rotation
  const handleRotateSecret = async (subscriptionId: string) => {
    if (
      !confirm(
        "Rotate this webhook's signing secret? Any consumers relying on the previous secret must be updated immediately.",
      )
    ) {
      return;
    }

    try {
      setActionLoadingId(`rotate-${subscriptionId}`);
      const result = await apiClient.rotateWebhookSecret(
        organizationId,
        subscriptionId,
      );
      setWebhooks((prev) =>
        prev.map((w) => (w.id === subscriptionId ? result.subscription : w)),
      );
      setRevealedSecret({
        title: "Webhook Signing Secret Rotated",
        secret: result.secret,
        warning:
          "Copy this new signing secret now. The previous secret has been invalidated.",
      });
    } catch (err: any) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to rotate signing secret",
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Webhook Deletion
  const handleDeleteWebhook = async (subscriptionId: string) => {
    if (!confirm("Are you sure you want to delete this webhook subscription?"))
      return;

    try {
      setActionLoadingId(`delete-${subscriptionId}`);
      await apiClient.deleteWebhookSubscription(organizationId, subscriptionId);
      setWebhooks((prev) => prev.filter((w) => w.id !== subscriptionId));
      setSuccessNotice("Webhook subscription deleted.");
    } catch (err: any) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to delete webhook subscription",
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Manual Delivery Retry
  const handleRetryDelivery = async (
    subscriptionId: string,
    deliveryId: string,
  ) => {
    try {
      setActionLoadingId(`retry-${deliveryId}`);
      const updated = await apiClient.retryWebhookDelivery(
        organizationId,
        subscriptionId,
        deliveryId,
      );
      setDeliveries((prev) =>
        prev.map((d) => (d.id === deliveryId ? updated : d)),
      );
      setSuccessNotice("Webhook delivery queued for retry.");
    } catch (err: any) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to retry webhook delivery",
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  };

  const activeKeysCount = apiKeys.filter(
    (k) => !k.revokedAt && (!k.expiresAt || new Date(k.expiresAt) > new Date()),
  ).length;
  const activeHooksCount = webhooks.filter((w) => w.isActive).length;
  const successfulDeliveries = deliveries.filter(
    (d) => d.status === "SUCCESS",
  ).length;
  const successRate =
    deliveries.length > 0
      ? Math.round((successfulDeliveries / deliveries.length) * 100)
      : 100;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar organizationId={organizationId} activeTab="developer" />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Developer Platform
              </span>
              <span className="text-xs text-slate-400 font-mono">
                v1 API & Webhooks
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white mt-1">
              Developer Settings
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Manage organization-scoped API keys, configure HTTPS webhooks with
              SSRF protection, and inspect delivery telemetry.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsKeyModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition shadow-sm"
            >
              <Key className="w-4 h-4" />
              <span>Create API Key</span>
            </button>
            <button
              onClick={() => setIsWebhookModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-sm font-medium transition"
            >
              <Webhook className="w-4 h-4" />
              <span>Add Webhook</span>
            </button>
          </div>
        </div>

        {/* Notices */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-xs font-semibold underline"
            >
              Dismiss
            </button>
          </div>
        )}
        {successNotice && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm flex items-center justify-between">
            <span>{successNotice}</span>
            <button
              onClick={() => setSuccessNotice(null)}
              className="text-xs font-semibold underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-xs font-medium text-slate-400">
              Active API Keys
            </span>
            <div className="text-2xl font-bold text-white mt-1">
              {activeKeysCount}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-xs font-medium text-slate-400">
              Active Subscriptions
            </span>
            <div className="text-2xl font-bold text-white mt-1">
              {activeHooksCount}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-xs font-medium text-slate-400">
              Logged Deliveries
            </span>
            <div className="text-2xl font-bold text-white mt-1">
              {deliveries.length}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-xs font-medium text-slate-400">
              Delivery Success Rate
            </span>
            <div className="text-2xl font-bold text-emerald-400 mt-1">
              {successRate}%
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800">
          <button
            onClick={() => setActiveTab("keys")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              activeTab === "keys"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Key className="w-4 h-4" />
            <span>API Keys ({apiKeys.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("webhooks")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              activeTab === "webhooks"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Webhook className="w-4 h-4" />
            <span>Webhooks ({webhooks.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("deliveries")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              activeTab === "deliveries"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Delivery Logs</span>
          </button>
          <button
            onClick={() => setActiveTab("docs")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              activeTab === "docs"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Quickstart & Specs</span>
          </button>
        </div>

        {/* Tab 1: API Keys Table */}
        {activeTab === "keys" && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">API Keys</h2>
                <p className="text-xs text-slate-400">
                  Keys are hashed at rest with SHA-256 and verified using
                  constant-time comparison.
                </p>
              </div>
              <button
                onClick={loadData}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {isLoading ? (
              <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Loading API keys...</span>
              </div>
            ) : apiKeys.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <Key className="w-10 h-10 text-slate-600 mx-auto" />
                <p className="text-slate-300 font-medium">
                  No API keys created yet
                </p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Create an organization-scoped API key to programmatically
                  manage projects and tasks from external systems.
                </p>
                <button
                  onClick={() => setIsKeyModalOpen(true)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg"
                >
                  Create Your First Key
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Active API Keys List</caption>
                  <thead className="bg-slate-950/60 text-slate-400 text-xs uppercase font-mono border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Name</th>
                      <th className="py-3 px-4">Key Identifier</th>
                      <th className="py-3 px-4">Scopes</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Last Used</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {apiKeys.map((key) => {
                      const isRevoked = !!key.revokedAt;
                      const isExpired =
                        !!key.expiresAt && new Date(key.expiresAt) < new Date();
                      return (
                        <tr
                          key={key.id}
                          className="hover:bg-slate-800/30 transition"
                        >
                          <td className="py-3 px-4">
                            <span className="font-semibold text-white">
                              {key.name}
                            </span>
                            <div className="text-xs text-slate-500">
                              Created{" "}
                              {new Date(key.createdAt).toLocaleDateString()}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-slate-300">
                            wsp_live_{key.keyPrefix}••••••••
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-wrap gap-1">
                              {key.scopes.map((s) => (
                                <span
                                  key={s}
                                  className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-300 border border-slate-700"
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {isRevoked ? (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30">
                                Revoked
                              </span>
                            ) : isExpired ? (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                Expired
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                Active
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-400">
                            {key.lastUsedAt
                              ? new Date(key.lastUsedAt).toLocaleString()
                              : "Never used"}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {!isRevoked && (
                              <button
                                onClick={() => handleRevokeKey(key.id)}
                                disabled={actionLoadingId === key.id}
                                className="px-2.5 py-1 text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded border border-rose-500/20 transition disabled:opacity-50"
                              >
                                {actionLoadingId === key.id
                                  ? "Revoking..."
                                  : "Revoke"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Webhooks Table */}
        {activeTab === "webhooks" && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">
                  Webhook Subscriptions
                </h2>
                <p className="text-xs text-slate-400">
                  Reliable event deliveries signed with HMAC-SHA256. Re-resolves
                  DNS before dispatch to eliminate SSRF & DNS rebinding risks.
                </p>
              </div>
              <button
                onClick={loadData}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {isLoading ? (
              <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Loading webhooks...</span>
              </div>
            ) : webhooks.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <Webhook className="w-10 h-10 text-slate-600 mx-auto" />
                <p className="text-slate-300 font-medium">
                  No webhook subscriptions configured
                </p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Subscribe an HTTPS endpoint to automatically receive signed
                  event notifications when projects or tasks are created,
                  updated, or removed.
                </p>
                <button
                  onClick={() => setIsWebhookModalOpen(true)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg"
                >
                  Register First Webhook
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Configured Webhook Endpoints</caption>
                  <thead className="bg-slate-950/60 text-slate-400 text-xs uppercase font-mono border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Endpoint URL</th>
                      <th className="py-3 px-4">Subscribed Events</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Failures</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {webhooks.map((hook) => (
                      <tr
                        key={hook.id}
                        className="hover:bg-slate-800/30 transition"
                      >
                        <td className="py-3 px-4 max-w-xs truncate">
                          <div className="font-mono text-xs text-emerald-400 font-medium truncate">
                            {hook.url}
                          </div>
                          {hook.description && (
                            <div className="text-xs text-slate-400">
                              {hook.description}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1">
                            {hook.eventTypes.map((evt) => (
                              <span
                                key={evt}
                                className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-300 border border-slate-700"
                              >
                                {evt}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {hook.isActive ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 w-fit">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              Active
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center gap-1 w-fit">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                              Disabled
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs font-mono">
                          {hook.consecutiveFailures > 0 ? (
                            <span className="text-rose-400 font-semibold">
                              {hook.consecutiveFailures} consecutive
                            </span>
                          ) : (
                            <span className="text-slate-500">0</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleTriggerPing(hook.id)}
                              disabled={actionLoadingId === `ping-${hook.id}`}
                              className="px-2 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 transition"
                              title="Send test ping event"
                            >
                              {actionLoadingId === `ping-${hook.id}`
                                ? "Pinging..."
                                : "Test Ping"}
                            </button>
                            <button
                              onClick={() => handleRotateSecret(hook.id)}
                              disabled={actionLoadingId === `rotate-${hook.id}`}
                              className="px-2 py-1 text-xs font-medium text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 rounded border border-amber-500/30 transition"
                              title="Rotate HMAC signing secret"
                            >
                              Rotate Secret
                            </button>
                            <button
                              onClick={() => handleDeleteWebhook(hook.id)}
                              disabled={actionLoadingId === `delete-${hook.id}`}
                              className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded transition"
                              title="Delete subscription"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Delivery Logs */}
        {activeTab === "deliveries" && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">
                  Webhook Delivery Logs
                </h2>
                <p className="text-xs text-slate-400">
                  Delivery telemetry with automatic retry backoff. Payloads
                  never expose raw passwords, secret keys, or sensitive
                  credentials.
                </p>
              </div>
              <button
                onClick={loadData}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {isLoading ? (
              <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Loading delivery logs...</span>
              </div>
            ) : deliveries.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Clock className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <p>No webhook events dispatched yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Webhook Event Delivery History</caption>
                  <thead className="bg-slate-950/60 text-slate-400 text-xs uppercase font-mono border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Event Type</th>
                      <th className="py-3 px-4">Event ID</th>
                      <th className="py-3 px-4">HTTP Status</th>
                      <th className="py-3 px-4">Attempt</th>
                      <th className="py-3 px-4">Duration</th>
                      <th className="py-3 px-4">Dispatched At</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono text-xs">
                    {deliveries.map((del) => {
                      const isSuccess = del.status === "SUCCESS";
                      return (
                        <tr
                          key={del.id}
                          className="hover:bg-slate-800/30 transition"
                        >
                          <td className="py-3 px-4 font-semibold text-slate-200">
                            {del.eventType}
                          </td>
                          <td className="py-3 px-4 text-slate-400 truncate max-w-[120px]">
                            {del.eventId}
                          </td>
                          <td className="py-3 px-4">
                            {isSuccess ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                {del.statusCode || 200} OK
                              </span>
                            ) : (
                              <div className="flex flex-col">
                                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 w-fit">
                                  {del.statusCode
                                    ? `HTTP ${del.statusCode}`
                                    : "FAILED"}
                                </span>
                                {del.errorMessage && (
                                  <span className="text-[10px] text-rose-400/80 font-sans mt-0.5 truncate max-w-xs">
                                    {del.errorMessage}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-300">
                            Attempt {del.attemptCount}
                          </td>
                          <td className="py-3 px-4 text-slate-400">
                            {del.durationMs ? `${del.durationMs}ms` : "-"}
                          </td>
                          <td className="py-3 px-4 text-slate-400 font-sans">
                            {new Date(del.createdAt).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-sans">
                            {!isSuccess && (
                              <button
                                onClick={() =>
                                  handleRetryDelivery(
                                    del.subscriptionId,
                                    del.id,
                                  )
                                }
                                disabled={actionLoadingId === `retry-${del.id}`}
                                className="px-2 py-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 rounded border border-emerald-500/20 transition"
                              >
                                {actionLoadingId === `retry-${del.id}`
                                  ? "Queuing..."
                                  : "Retry"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Quickstart & Documentation */}
        {activeTab === "docs" && (
          <div className="space-y-6">
            <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
              <div className="flex items-center gap-2 text-white font-semibold text-lg">
                <Terminal className="w-5 h-5 text-emerald-400" />
                <span>Quickstart: Making API Key Requests</span>
              </div>
              <p className="text-sm text-slate-400">
                Authenticate requests using your generated API key via the HTTP{" "}
                <code className="text-emerald-400 bg-slate-800 px-1 py-0.5 rounded">
                  Authorization: Bearer wsp_live_...
                </code>{" "}
                header.
              </p>

              <div className="bg-slate-950 rounded-lg p-4 font-mono text-xs text-slate-300 border border-slate-800 overflow-x-auto">
                <pre>{`curl -X GET "https://api.workspace.com/api/v1/projects" \\
  -H "Authorization: Bearer wsp_live_your_key_prefix_secret" \\
  -H "Content-Type: application/json"`}</pre>
              </div>
            </div>

            <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
              <div className="flex items-center gap-2 text-white font-semibold text-lg">
                <ShieldAlert className="w-5 h-5 text-emerald-400" />
                <span>Webhook Signature Verification (Node.js)</span>
              </div>
              <p className="text-sm text-slate-400">
                WorkSpace signs event payloads using HMAC-SHA256 with timestamp
                verification to prevent replay attacks.
              </p>

              <div className="bg-slate-950 rounded-lg p-4 font-mono text-xs text-slate-300 border border-slate-800 overflow-x-auto">
                <pre>{`import crypto from "node:crypto";

function verifyWorkSpaceWebhook(rawPayload, signatureHeader, secret) {
  const parts = signatureHeader.split(",").reduce((acc, curr) => {
    const [k, v] = curr.split("=");
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});

  const { t: timestamp, v1: signature } = parts;
  if (!timestamp || !signature) return false;

  // Protect against replay attacks (5 minute threshold)
  if (Math.abs(Math.floor(Date.now() / 1000) - parseInt(timestamp, 10)) > 300) {
    return false;
  }

  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(\`\${timestamp}.\${rawPayload}\`)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature, "utf8"),
    Buffer.from(expectedSig, "utf8")
  );
}`}</pre>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Create API Key */}
        {isKeyModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Key className="w-5 h-5 text-emerald-400" />
                  <span>Create API Key</span>
                </h3>
                <button
                  onClick={() => setIsKeyModalOpen(false)}
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateApiKey} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Key Label / Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g. CI/CD Deployment or Zapier Integration"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">
                    Permissions & Scopes
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      { id: "*", label: "Full Access (*)" },
                      { id: "projects:read", label: "Read Projects" },
                      { id: "projects:write", label: "Manage Projects" },
                      { id: "tasks:read", label: "Read Tasks" },
                      { id: "tasks:write", label: "Manage Tasks" },
                      { id: "webhooks:read", label: "Read Webhooks" },
                      { id: "webhooks:write", label: "Manage Webhooks" },
                    ].map((scope) => (
                      <label
                        key={scope.id}
                        className="flex items-center gap-2 p-2 rounded bg-slate-950 border border-slate-800 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={newKeyScopes.includes(scope.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewKeyScopes((prev) => [...prev, scope.id]);
                            } else {
                              setNewKeyScopes((prev) =>
                                prev.filter((s) => s !== scope.id),
                              );
                            }
                          }}
                          className="rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-slate-300">{scope.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Expiration
                  </label>
                  <select
                    value={newKeyExpiryDays || ""}
                    onChange={(e) =>
                      setNewKeyExpiryDays(
                        e.target.value
                          ? parseInt(e.target.value, 10)
                          : undefined,
                      )
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-300 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">Never Expires</option>
                    <option value="30">30 Days</option>
                    <option value="60">60 Days</option>
                    <option value="90">90 Days</option>
                    <option value="365">1 Year</option>
                  </select>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsKeyModalOpen(false)}
                    className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingKey || !newKeyName.trim()}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
                  >
                    {isSubmittingKey ? "Generating..." : "Generate Key"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Create Webhook */}
        {isWebhookModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Webhook className="w-5 h-5 text-emerald-400" />
                  <span>Register Webhook</span>
                </h3>
                <button
                  onClick={() => setIsWebhookModalOpen(false)}
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateWebhook} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Destination Endpoint URL (HTTPS)
                  </label>
                  <input
                    type="url"
                    required
                    value={newWebhookUrl}
                    onChange={(e) => setNewWebhookUrl(e.target.value)}
                    placeholder="https://your-domain.com/webhooks"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Private IP ranges, loopbacks, and cloud metadata targets are
                    prohibited by SSRF protections.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Description (Optional)
                  </label>
                  <input
                    type="text"
                    value={newWebhookDesc}
                    onChange={(e) => setNewWebhookDesc(e.target.value)}
                    placeholder="e.g. Production Slack notifications"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">
                    Events to Subscribe
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      { id: "task.created", label: "Task Created" },
                      { id: "task.updated", label: "Task Updated" },
                      { id: "task.deleted", label: "Task Deleted" },
                      { id: "project.created", label: "Project Created" },
                      { id: "project.updated", label: "Project Updated" },
                      { id: "project.deleted", label: "Project Deleted" },
                    ].map((evt) => (
                      <label
                        key={evt.id}
                        className="flex items-center gap-2 p-2 rounded bg-slate-950 border border-slate-800 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={newWebhookEvents.includes(evt.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewWebhookEvents((prev) => [...prev, evt.id]);
                            } else {
                              setNewWebhookEvents((prev) =>
                                prev.filter((s) => s !== evt.id),
                              );
                            }
                          }}
                          className="rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-slate-300 font-mono text-[11px]">
                          {evt.id}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsWebhookModalOpen(false)}
                    className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingWebhook || !newWebhookUrl.trim()}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
                  >
                    {isSubmittingWebhook ? "Saving..." : "Register Webhook"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Secret Revealed Once */}
        {revealedSecret && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span>{revealedSecret.title}</span>
                </h3>
              </div>

              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{revealedSecret.warning}</span>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-medium text-slate-400">
                  Secret Token
                </span>
                <div className="flex items-center gap-2 p-3 bg-slate-950 border border-slate-800 rounded-lg font-mono text-xs text-emerald-300 break-all select-all">
                  <span className="flex-1">{revealedSecret.secret}</span>
                  <button
                    onClick={() => copyToClipboard(revealedSecret.secret)}
                    className="p-1.5 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition"
                    title="Copy to clipboard"
                  >
                    {hasCopied ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setRevealedSecret(null)}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg transition"
                >
                  I have saved this secret
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
