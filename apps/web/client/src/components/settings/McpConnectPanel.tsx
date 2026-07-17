import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardCard } from "@/components/dashboard";
import { Cable, CheckCircle2, ExternalLink, Loader2, RefreshCw, Shield, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

const FALLBACK_PROVIDER_TEMPLATES = [
  {
    id: "magnific",
    providerKey: "magnific",
    displayName: "Magnific",
    mcpUrl: "https://mcp.magnific.com",
    allowedAssetTypes: ["image", "video"],
    isEnabled: true,
  },
  {
    id: "higgsfield",
    providerKey: "higgsfield",
    displayName: "Higgsfield",
    mcpUrl: "https://mcp.higgsfield.ai/mcp",
    allowedAssetTypes: ["image", "video"],
    isEnabled: true,
  },
] as const;

function providerWebUrl(providerKey: string, mcpUrl?: string | null) {
  if (mcpUrl) return mcpUrl;
  return providerKey === "higgsfield" ? "https://higgsfield.ai/mcp" : "https://www.magnific.com/mcp";
}

// Formats an access-token expiry timestamp in Thailand time (Asia/Bangkok,
// UTC+7). Uses the Gregorian calendar so the year matches the rest of the app
// (2026) instead of the Buddhist-era default of the th-TH locale. Returns e.g.
// "16 ก.ค. 2026 07:15". Returns null for missing/invalid values.
function formatThaiDateTime(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    calendar: "gregory",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

interface McpConnectPanelProps {
  defaultTab?: "accounts" | "sharing" | "usage";
}

interface ShareRowForm {
  image: boolean;
  video: boolean;
  dailyUseLimit: string;
  concurrencyLimit: string;
  requiresVideoApproval: boolean;
}

interface AddShareForm extends ShareRowForm {
  groupId: string;
}

const DEFAULT_SHARE_ROW_FORM: ShareRowForm = {
  image: true,
  video: false,
  dailyUseLimit: "",
  concurrencyLimit: "",
  requiresVideoApproval: true,
};

const DEFAULT_ADD_SHARE_FORM: AddShareForm = {
  ...DEFAULT_SHARE_ROW_FORM,
  groupId: "",
};

function shareRowKey(connectionId: string, groupId: number) {
  return `${connectionId}:${groupId}`;
}

export function McpConnectPanel({ defaultTab = "accounts" }: McpConnectPanelProps = {}) {
  const utils = trpc.useUtils();
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [shareFormsByKey, setShareFormsByKey] = useState<Record<string, ShareRowForm>>({});
  const [addFormsByConnectionId, setAddFormsByConnectionId] = useState<Record<string, AddShareForm>>({});
  const templates = trpc.mcpConnections.listProviderTemplates.useQuery();
  const connections = trpc.mcpConnections.listConnections.useQuery();
  const shares = trpc.mcpConnections.listShares.useQuery(undefined, { retry: false });
  const usage = trpc.mcpConnections.listUsage.useQuery(undefined, { retry: false });
  const groups = trpc.groups.list.useQuery({ scope: "all" }, { retry: false });
  const startOAuth = trpc.mcpConnections.startOAuth.useMutation({
    onError: (error) => {
      setConnectingProvider(null);
      toast.error(error.message);
    },
  });
  const disconnect = trpc.mcpConnections.disconnect.useMutation({
    onSuccess: async () => {
      toast.success("MCP connection disconnected");
      await utils.mcpConnections.listConnections.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const testConnection = trpc.mcpConnections.testConnection.useMutation({
    onSuccess: async () => {
      toast.success("MCP connection checked");
      await utils.mcpConnections.listConnections.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const updateShare = trpc.mcpConnections.updateShare.useMutation({
    onError: (error) => toast.error(error.message),
  });

  const openProviderConnect = (providerKey: "magnific" | "higgsfield", url: string, connectionId?: string) => {
    setConnectingProvider(providerKey);
    const popup = window.open("about:blank", "mcp-connect", "width=960,height=780");
    if (!popup) {
      setConnectingProvider(null);
      toast.error("Popup blocked. Allow popups or use Open web to connect this provider.");
      return;
    }
    popup.document.write(`<p style="font-family:sans-serif;padding:16px">Preparing ${providerKey === "higgsfield" ? "Higgsfield" : "Magnific"} sign-in...</p>`);
    startOAuth.mutate(
      { providerKey, connectionId },
      {
        onSuccess: (result) => {
          popup.location.href = result.authorizationUrl;
          toast.info(`Continue sign-in on ${providerKey === "higgsfield" ? "Higgsfield" : "Magnific"}.`);
        },
        onSettled: () => setConnectingProvider(null),
      },
    );
  };

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "mcp-connect:success") return;
      toast.success("MCP connection completed");
      await utils.mcpConnections.listConnections.invalidate();
      await utils.mcpConnections.listProviderTemplates.invalidate();
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [utils]);

  const personalConnections = (connections.data ?? []).filter((connection) => (
    connection.connectionScope !== "shared"
  ));
  const connectedPersonalConnections = personalConnections.filter((connection) => connection.status === "connected");
  const byProvider = new Map<string, (typeof personalConnections)[number]>();
  for (const connection of personalConnections) {
    const current = byProvider.get(connection.providerKey);
    if (!current || (current.status !== "connected" && connection.status === "connected")) {
      byProvider.set(connection.providerKey, connection);
    }
  }
  const apiProviderTemplates = templates.data ?? [];
  const providerTemplates = apiProviderTemplates.length > 0
    ? apiProviderTemplates
    : FALLBACK_PROVIDER_TEMPLATES;

  const shareRows = (shares.data ?? []).map((row: any) => row.share ?? row.mcp_connection_group_shares ?? row);
  const activeShareRows = shareRows.filter((share: any) => share?.enabled);
  const enabledSharesByConnectionId = new Map<string, any[]>();
  for (const share of activeShareRows) {
    if (!share?.connectionId || share.groupId == null) continue;
    const list = enabledSharesByConnectionId.get(share.connectionId) ?? [];
    list.push(share);
    enabledSharesByConnectionId.set(share.connectionId, list);
  }
  const groupNameById = new Map<number, string>();
  for (const group of (groups.data ?? []) as any[]) {
    groupNameById.set(group.id, group.name);
  }
  const groupLabel = (groupId: number) => groupNameById.get(groupId) ?? `Group #${groupId}`;

  useEffect(() => {
    if (!shares.data) return;
    setShareFormsByKey((current) => {
      const next = { ...current };
      for (const share of (shares.data as any[]).map((row) => row.share ?? row.mcp_connection_group_shares ?? row)) {
        if (!share?.connectionId || share.groupId == null) continue;
        const key = shareRowKey(share.connectionId, share.groupId);
        if (!share.enabled) {
          // Disabled rows do not have an editable form; drop any stale state
          // for this specific (connection, group) key without touching other keys.
          delete next[key];
          continue;
        }
        next[key] = {
          image: Array.isArray(share.allowedAssetTypes) ? share.allowedAssetTypes.includes("image") : true,
          video: Array.isArray(share.allowedAssetTypes) ? share.allowedAssetTypes.includes("video") : false,
          dailyUseLimit: share.dailyUseLimit == null ? "" : String(share.dailyUseLimit),
          concurrencyLimit: share.concurrencyLimit == null ? "" : String(share.concurrencyLimit),
          requiresVideoApproval: share.requiresVideoApproval ?? true,
        };
      }
      return next;
    });
  }, [shares.data]);

  const updateShareRowForm = (connectionId: string, groupId: number, patch: Partial<ShareRowForm>) => {
    const key = shareRowKey(connectionId, groupId);
    setShareFormsByKey((current) => ({
      ...current,
      [key]: {
        ...DEFAULT_SHARE_ROW_FORM,
        ...(current[key] ?? {}),
        ...patch,
      },
    }));
  };

  const updateAddForm = (connectionId: string, patch: Partial<AddShareForm>) => {
    setAddFormsByConnectionId((current) => ({
      ...current,
      [connectionId]: {
        ...DEFAULT_ADD_SHARE_FORM,
        ...(current[connectionId] ?? {}),
        ...patch,
      },
    }));
  };

  const sharePayload = (connectionId: string, groupId: number, form: ShareRowForm, enabled = true) => ({
    connectionId,
    groupId,
    enabled,
    allowedAssetTypes: [
      ...(form.image ? ["image" as const] : []),
      ...(form.video ? ["video" as const] : []),
    ],
    dailyUseLimit: form.dailyUseLimit ? Number(form.dailyUseLimit) : null,
    concurrencyLimit: form.concurrencyLimit ? Number(form.concurrencyLimit) : null,
    requiresVideoApproval: form.requiresVideoApproval,
  });

  const saveShareRow = (connectionId: string, groupId: number) => {
    const key = shareRowKey(connectionId, groupId);
    const form = { ...DEFAULT_SHARE_ROW_FORM, ...(shareFormsByKey[key] ?? {}) };
    if (!form.image && !form.video) return;
    updateShare.mutate(sharePayload(connectionId, groupId, form, true), {
      onSuccess: async () => {
        toast.success("MCP share policy saved");
        await utils.mcpConnections.listShares.invalidate();
      },
    });
  };

  const stopShareRow = (connectionId: string, groupId: number, savedShare: any) => {
    // Use the saved row's own current values, not unrelated in-progress edits.
    const form: ShareRowForm = {
      image: Array.isArray(savedShare?.allowedAssetTypes) ? savedShare.allowedAssetTypes.includes("image") : true,
      video: Array.isArray(savedShare?.allowedAssetTypes) ? savedShare.allowedAssetTypes.includes("video") : false,
      dailyUseLimit: savedShare?.dailyUseLimit == null ? "" : String(savedShare.dailyUseLimit),
      concurrencyLimit: savedShare?.concurrencyLimit == null ? "" : String(savedShare.concurrencyLimit),
      requiresVideoApproval: savedShare?.requiresVideoApproval ?? true,
    };
    updateShare.mutate(sharePayload(connectionId, groupId, form, false), {
      onSuccess: async () => {
        toast.success("MCP sharing disabled");
        await utils.mcpConnections.listShares.invalidate();
      },
    });
  };

  const addShareRow = (connectionId: string) => {
    const form = { ...DEFAULT_ADD_SHARE_FORM, ...(addFormsByConnectionId[connectionId] ?? {}) };
    if (!form.groupId || (!form.image && !form.video)) return;
    const groupId = Number(form.groupId);
    updateShare.mutate(sharePayload(connectionId, groupId, form, true), {
      onSuccess: async () => {
        toast.success("MCP share policy saved");
        await utils.mcpConnections.listShares.invalidate();
        setAddFormsByConnectionId((current) => ({ ...current, [connectionId]: { ...DEFAULT_ADD_SHARE_FORM } }));
      },
    });
  };

  return (
    <DashboardCard className="p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Cable className="h-4 w-4 text-blue-600" />
            <h2 className="text-base font-semibold text-gray-950">MCP Connect</h2>
            <Badge variant="outline">MCP Connect</Badge>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Connect image and video provider accounts once, then choose Gateway API or MCP Connect in generation tools.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => connections.refetch()}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue={defaultTab} className="mt-5">
        <TabsList>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="sharing">Sharing</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="mt-4">
          {templates.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading providers
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                {providerTemplates.map((template) => {
                  const connection = byProvider.get(template.providerKey);
                  const isConnecting = connectingProvider === template.providerKey;
                  const webUrl = providerWebUrl(template.providerKey, "mcpUrl" in template ? template.mcpUrl : null);
                  return (
                    <div key={template.providerKey} className="rounded-lg border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-medium text-gray-950">{template.displayName}</h3>
                          <p className="mt-1 text-sm text-gray-500">
                            {connection?.providerAccountLabel ?? "Not configured"}
                          </p>
                          {(() => {
                            const expiresLabel = formatThaiDateTime(connection?.tokenExpiresAt);
                            if (!connection || !expiresLabel) return null;
                            const expiresMs = new Date(connection.tokenExpiresAt as Date).getTime();
                            const now = Date.now();
                            const expired = connection.status === "requires_reauth" || expiresMs <= now;
                            const expiringSoon = !expired && expiresMs - now < SIX_HOURS_MS;
                            const tone = expired ? "text-red-600" : expiringSoon ? "text-amber-600" : "text-gray-500";
                            const prefix = expired ? "หมดอายุแล้วเมื่อ" : "หมดอายุ";
                            const suffix = expired
                              ? " — กด Reconnect เพื่อต่ออายุ"
                              : expiringSoon
                                ? " — ใกล้หมดอายุ"
                                : "";
                            return (
                              <p className={`mt-1 text-xs ${tone}`}>
                                {`${prefix} ${expiresLabel} น. (เวลาไทย)${suffix}`}
                              </p>
                            );
                          })()}
                        </div>
                        <Badge
                          variant={
                            connection?.status === "connected"
                              ? "default"
                              : connection
                                ? "outline"
                                : "secondary"
                          }
                        >
                          {connection?.status === "connected"
                            ? "Configured"
                            : connection
                              ? "Reconnect required"
                              : "Not configured"}
                        </Badge>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {connection ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => testConnection.mutate({ connectionId: connection.id })}>
                              <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                              Test provider connection
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openProviderConnect(template.providerKey as "magnific" | "higgsfield", webUrl, connection.id)}
                            >
                              <ExternalLink className="mr-2 h-3.5 w-3.5" />
                              Reconnect
                            </Button>
                            <Button size="sm" variant="outline" className="text-red-600" onClick={() => disconnect.mutate({ connectionId: connection.id })}>
                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                              Disconnect
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            disabled={isConnecting}
                            onClick={() => {
                              openProviderConnect(template.providerKey as "magnific" | "higgsfield", webUrl);
                            }}
                          >
                            {isConnecting ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="mr-2 h-3.5 w-3.5" />}
                            Connect
                          </Button>
                        )}
                        <Button size="sm" variant="outline" asChild>
                          <a href={webUrl} target="_blank" rel="noreferrer">
                            <ExternalLink className="mr-2 h-3.5 w-3.5" />
                            Open web
                          </a>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="sharing" className="mt-4">
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Users className="h-4 w-4" />
              Shared account access
            </div>
            <p className="mt-2 text-sm text-gray-500">
              Group sharing uses owner approval for shared video jobs. Share editing is available after a provider account is connected.
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Daily use limit counts generation jobs started per day for that account and group. Concurrency limit counts queued or processing jobs at the same time.
            </p>
            <div className="mt-4 space-y-3">
              {connectedPersonalConnections.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-sm text-gray-500">
                  No connected MCP accounts available for sharing.
                </div>
              ) : (
                connectedPersonalConnections.map((connection) => {
                  const enabledShares = enabledSharesByConnectionId.get(connection.id) ?? [];
                  const isShared = enabledShares.length > 0;
                  const addForm = { ...DEFAULT_ADD_SHARE_FORM, ...(addFormsByConnectionId[connection.id] ?? {}) };
                  const takenGroupIds = new Set(enabledShares.map((share: any) => share.groupId));
                  const availableGroups = ((groups.data ?? []) as any[]).filter((group) => !takenGroupIds.has(group.id));
                  return (
                    <div key={connection.id} className="rounded-md border p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="font-medium text-gray-950">{connection.providerDisplayName}</div>
                          <div className="truncate text-sm text-gray-500">{connection.providerAccountLabel ?? connection.displayName}</div>
                        </div>
                        <Badge variant={isShared ? "default" : "secondary"}>
                          {isShared ? "Shared" : "Not shared"}
                        </Badge>
                      </div>

                      {enabledShares.length > 0 ? (
                        <div className="mt-3 space-y-3">
                          {enabledShares.map((share: any) => {
                            const key = shareRowKey(connection.id, share.groupId);
                            const form = { ...DEFAULT_SHARE_ROW_FORM, ...(shareFormsByKey[key] ?? {}) };
                            const groupName = groupLabel(share.groupId);
                            const rowLabel = `${connection.providerDisplayName} (${groupName})`;
                            return (
                              <div key={key} className="rounded-md border border-gray-200 p-3">
                                <div className="text-sm font-medium text-gray-950">{groupName}</div>
                                <div className="mt-2 grid gap-3 md:grid-cols-2">
                                  <label className="space-y-1 text-sm">
                                    <span className="font-medium">Daily use limit</span>
                                    <input
                                      aria-label={`Daily use limit for ${rowLabel}`}
                                      className="w-full rounded-md border px-3 py-2"
                                      inputMode="numeric"
                                      value={form.dailyUseLimit}
                                      onChange={(event) => updateShareRowForm(connection.id, share.groupId, { dailyUseLimit: event.target.value.replace(/\D/g, "") })}
                                      placeholder="Unlimited"
                                    />
                                    <span className="text-xs text-gray-500">Jobs started per day</span>
                                  </label>
                                  <label className="space-y-1 text-sm">
                                    <span className="font-medium">Concurrency limit</span>
                                    <input
                                      aria-label={`Concurrency limit for ${rowLabel}`}
                                      className="w-full rounded-md border px-3 py-2"
                                      inputMode="numeric"
                                      value={form.concurrencyLimit}
                                      onChange={(event) => updateShareRowForm(connection.id, share.groupId, { concurrencyLimit: event.target.value.replace(/\D/g, "") })}
                                      placeholder="Unlimited"
                                    />
                                    <span className="text-xs text-gray-500">Queued or processing jobs</span>
                                  </label>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                                  <label className="flex items-center gap-2">
                                    <input type="checkbox" aria-label={`Image jobs for ${rowLabel}`} checked={form.image} onChange={(event) => updateShareRowForm(connection.id, share.groupId, { image: event.target.checked })} />
                                    Image jobs
                                  </label>
                                  <label className="flex items-center gap-2">
                                    <input type="checkbox" aria-label={`Video jobs for ${rowLabel}`} checked={form.video} onChange={(event) => updateShareRowForm(connection.id, share.groupId, { video: event.target.checked })} />
                                    Video jobs
                                  </label>
                                  <label className="flex items-center gap-2">
                                    <input type="checkbox" aria-label={`Owner approval required for video for ${rowLabel}`} checked={form.requiresVideoApproval} onChange={(event) => updateShareRowForm(connection.id, share.groupId, { requiresVideoApproval: event.target.checked })} />
                                    Owner approval required for video
                                  </label>
                                  <Button
                                    size="sm"
                                    disabled={(!form.image && !form.video) || updateShare.isPending}
                                    onClick={() => saveShareRow(connection.id, share.groupId)}
                                  >
                                    {updateShare.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                                    Save {rowLabel}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={updateShare.isPending}
                                    onClick={() => stopShareRow(connection.id, share.groupId, share)}
                                  >
                                    Stop sharing {rowLabel}
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}

                      <div className="mt-3 rounded-md border border-dashed p-3">
                        <div className="text-sm font-medium text-gray-950">Add group</div>
                        <div className="mt-2 grid gap-3 md:grid-cols-3">
                          <label className="space-y-1 text-sm">
                            <span className="font-medium">Group</span>
                            <select
                              aria-label={`Group for ${connection.providerDisplayName}`}
                              className="w-full rounded-md border px-3 py-2"
                              value={addForm.groupId}
                              onChange={(event) => updateAddForm(connection.id, { groupId: event.target.value })}
                            >
                              <option value="">Select group</option>
                              {availableGroups.map((group: any) => (
                                <option key={group.id} value={String(group.id)}>
                                  {group.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="space-y-1 text-sm">
                            <span className="font-medium">Daily use limit</span>
                            <input
                              aria-label={`New group daily use limit for ${connection.providerDisplayName}`}
                              className="w-full rounded-md border px-3 py-2"
                              inputMode="numeric"
                              value={addForm.dailyUseLimit}
                              onChange={(event) => updateAddForm(connection.id, { dailyUseLimit: event.target.value.replace(/\D/g, "") })}
                              placeholder="Unlimited"
                            />
                            <span className="text-xs text-gray-500">Jobs started per day</span>
                          </label>
                          <label className="space-y-1 text-sm">
                            <span className="font-medium">Concurrency limit</span>
                            <input
                              aria-label={`New group concurrency limit for ${connection.providerDisplayName}`}
                              className="w-full rounded-md border px-3 py-2"
                              inputMode="numeric"
                              value={addForm.concurrencyLimit}
                              onChange={(event) => updateAddForm(connection.id, { concurrencyLimit: event.target.value.replace(/\D/g, "") })}
                              placeholder="Unlimited"
                            />
                            <span className="text-xs text-gray-500">Queued or processing jobs</span>
                          </label>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                          <label className="flex items-center gap-2">
                            <input type="checkbox" aria-label={`New group image jobs for ${connection.providerDisplayName}`} checked={addForm.image} onChange={(event) => updateAddForm(connection.id, { image: event.target.checked })} />
                            Image jobs
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" aria-label={`New group video jobs for ${connection.providerDisplayName}`} checked={addForm.video} onChange={(event) => updateAddForm(connection.id, { video: event.target.checked })} />
                            Video jobs
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" aria-label={`New group owner approval required for video for ${connection.providerDisplayName}`} checked={addForm.requiresVideoApproval} onChange={(event) => updateAddForm(connection.id, { requiresVideoApproval: event.target.checked })} />
                            Owner approval required for video
                          </label>
                          <Button
                            size="sm"
                            disabled={!addForm.groupId || (!addForm.image && !addForm.video) || updateShare.isPending}
                            onClick={() => addShareRow(connection.id)}
                          >
                            {updateShare.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                            Share {connection.providerDisplayName}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="text-sm text-gray-600">{activeShareRows.length} active share policy record(s)</div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="usage" className="mt-4">
          <div className="overflow-hidden rounded-lg border">
            {(usage.data ?? []).length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500">No MCP usage yet</div>
            ) : (
              (usage.data ?? []).map((event) => (
                <div key={event.id} className="flex items-center justify-between border-b px-4 py-3 text-sm last:border-b-0">
                  <span>{event.eventType}</span>
                  <span className="text-gray-500">{event.status ?? "recorded"}</span>
                </div>
              ))
            )}
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
            <Shield className="h-3.5 w-3.5" />
            Usage events show redacted summaries only.
          </div>
        </TabsContent>
      </Tabs>
    </DashboardCard>
  );
}
