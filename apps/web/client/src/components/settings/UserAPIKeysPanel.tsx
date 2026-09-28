/**
 * UserAPIKeysPanel — user-facing API key management panel.
 *
 * Every user manages their OWN keys here (Settings → API Keys).
 * Credits are deducted from the user's own balance.
 * Admin cannot access or modify keys from here.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DashboardCard } from "@/components/dashboard";
import {
  Key,
  Plus,
  Trash2,
  Copy,
  CheckCircle2,
  XCircle,
  Activity,
  Shield,
  AlertTriangle,
  RefreshCw,
  SlidersHorizontal,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import {
  MCP_CLI_DEFAULT_CREDIT_QUOTAS,
  MCP_CLI_DEFAULT_SCOPES,
} from "@shared/publicApiTypes";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCOPE_CATEGORIES = [
  { label: "Skills", scopes: ["skills:list", "skills:execute"] },
  { label: "Agencies", scopes: ["agencies:list", "agencies:invoke"] },
  { label: "Presentations", scopes: ["presentations:create"] },
  { label: "Video", scopes: ["video_projects:create"] },
  { label: "Media", scopes: ["media:generate"] },
  { label: "LLM", scopes: ["llm:chat"] },
  { label: "MCP", scopes: ["mcp:read", "mcp:write"] },
  { label: "Remotion", scopes: ["remotion:submit", "remotion:read", "remotion:cancel"] },
  { label: "Library", scopes: ["library:search", "library:read", "library:download", "library:upload"] },
  { label: "Media access", scopes: ["media:read", "media:download"] },
  { label: "Hermes", scopes: ["hermes:connect", "hermes:read", "hermes:generate", "hermes:disconnect"] },
  { label: "Jobs", scopes: ["jobs:create", "jobs:read"] },
  { label: "Webhooks", scopes: ["webhooks:manage"] },
  { label: "Events", scopes: ["events:read"] },
  { label: "API Keys", scopes: ["api_keys:manage"] },
];

const ALL_SCOPES = SCOPE_CATEGORIES.flatMap((c) => c.scopes);

const SCOPE_BUNDLES = [
  { label: "Read-only", scopes: ["skills:list", "agencies:list", "jobs:read", "events:read"] },
  { label: "Skill Runner", scopes: ["skills:list", "skills:execute", "media:generate"] },
  { label: "Agency Operator", scopes: ["agencies:list", "agencies:invoke", "skills:list"] },
  {
    label: "MCP Client",
    scopes: ["mcp:read", "mcp:write", "skills:list", "skills:execute", "agencies:list", "agencies:invoke", "media:generate"],
  },
  { label: "Full Access", scopes: ALL_SCOPES },
];

const MCP_ENDPOINT = "https://smartaihub.app/v1/mcp";
const MCP_SCOPE_HELP: Record<string, string> = {
  "mcp:read": "discover and call read-safe MCP tools",
  "mcp:write": "call MCP operations that change data; grant only when needed",
  "media:generate": "start image/video generation jobs",
  "media:read": "read media metadata available to your account",
  "media:download": "download ACL-approved image/video files",
  "library:search": "search your permitted library",
  "library:read": "read permitted library metadata/content",
  "library:download": "download permitted library files",
  "remotion:submit": "submit Remotion render jobs",
  "remotion:read": "read Remotion job status and artifacts",
  "remotion:cancel": "cancel your permitted Remotion jobs",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UserAPIKeysPanel() {
  const utils = trpc.useUtils();

  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyPurpose, setNewKeyPurpose] = useState<"public_api" | "mcp_cli">("public_api");
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>([]);
  const [newKeyExpiry, setNewKeyExpiry] = useState("365");
  const [newKeyCreditLimit, setNewKeyCreditLimit] = useState("");
  const [newKeyRateLimit, setNewKeyRateLimit] = useState("60");
  const [newKeyQuotaHourly, setNewKeyQuotaHourly] = useState("");
  const [newKeyQuotaDaily, setNewKeyQuotaDaily] = useState("");
  const [newKeyQuotaWeekly, setNewKeyQuotaWeekly] = useState("");
  const [newKeyQuotaMonthly, setNewKeyQuotaMonthly] = useState("");
  const [newKeyCreditQuota5h, setNewKeyCreditQuota5h] = useState("");
  const [newKeyCreditQuotaDaily, setNewKeyCreditQuotaDaily] = useState("");
  const [newKeyCreditQuotaWeekly, setNewKeyCreditQuotaWeekly] = useState("");

  const [createdKey, setCreatedKey] = useState<{ rawKey: string; name: string; purpose: "public_api" | "mcp_cli" } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);
  const [rotateTarget, setRotateTarget] = useState<{ id: string; name: string; purpose: "public_api" | "mcp_cli" } | null>(null);
  const [confirmDeleteWebhook, setConfirmDeleteWebhook] = useState<string | null>(null);
  const [viewingStats, setViewingStats] = useState<string | null>(null);
  const [editingLimits, setEditingLimits] = useState<{
    id: string; name: string;
    rateLimit: number; creditLimit: number | null;
    quotaHourly: number | null; quotaDaily: number | null;
    quotaWeekly: number | null; quotaMonthly: number | null;
    keyPurpose?: "public_api" | "mcp_cli";
    creditQuota5h?: number | null; creditQuotaDaily?: number | null; creditQuotaWeekly?: number | null;
  } | null>(null);

  const keysQuery = trpc.apiKeys.list.useQuery();
  const webhooksQuery = trpc.apiKeys.listWebhooks.useQuery();
  const statsQuery = trpc.apiKeys.getUsageStats.useQuery(
    { keyId: viewingStats!, days: 7 },
    { enabled: !!viewingStats },
  );

  const createMutation = trpc.apiKeys.create.useMutation({
    onSuccess: (data) => {
      setCreatedKey({ rawKey: data.rawKey, name: data.name, purpose: data.purpose ?? newKeyPurpose });
      setCreateOpen(false);
      resetCreateForm();
      utils.apiKeys.list.invalidate();
    },
    onError: () => toast.error("Operation failed. Please try again."),
  });

  const revokeMutation = trpc.apiKeys.revoke.useMutation({
    onSuccess: () => {
      setRevokeTarget(null);
      utils.apiKeys.list.invalidate();
      toast.success("API key revoked");
    },
    onError: () => toast.error("Operation failed. Please try again."),
  });

  const deleteWebhookMutation = trpc.apiKeys.deleteWebhook.useMutation({
    onSuccess: () => {
      setConfirmDeleteWebhook(null);
      utils.apiKeys.listWebhooks.invalidate();
      toast.success("Webhook deleted");
    },
    onError: () => toast.error("Operation failed. Please try again."),
  });

  const reEnableWebhookMutation = trpc.apiKeys.reEnableWebhook.useMutation({
    onSuccess: () => {
      utils.apiKeys.listWebhooks.invalidate();
      toast.success("Webhook re-enabled");
    },
    onError: () => toast.error("Operation failed. Please try again."),
  });

  const updateSettingsMutation = trpc.apiKeys.updateSettings.useMutation({
    onSuccess: () => {
      setEditingLimits(null);
      utils.apiKeys.list.invalidate();
      toast.success("Limits updated");
    },
    onError: () => toast.error("Operation failed. Please try again."),
  });

  const rotateMutation = trpc.apiKeys.rotate.useMutation({
    onSuccess: (data) => {
      setCreatedKey({
        rawKey: data.rawKey,
        name: data.name,
        purpose: rotateTarget?.purpose ?? "public_api",
      });
      setRotateTarget(null);
      utils.apiKeys.list.invalidate();
      toast.success("API key rotated. The previous key is revoked.");
    },
    onError: () => toast.error("Operation failed. Please try again."),
  });

  function resetCreateForm() {
    setNewKeyName("");
    setNewKeyPurpose("public_api");
    setNewKeyScopes([]);
    setNewKeyExpiry("365");
    setNewKeyCreditLimit("");
    setNewKeyRateLimit("60");
    setNewKeyQuotaHourly("");
    setNewKeyQuotaDaily("");
    setNewKeyQuotaWeekly("");
    setNewKeyQuotaMonthly("");
    setNewKeyCreditQuota5h("");
    setNewKeyCreditQuotaDaily("");
    setNewKeyCreditQuotaWeekly("");
  }

  function toggleScope(scope: string) {
    setNewKeyScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  function handleCreate() {
    createMutation.mutate({
      name: newKeyName,
      scopes: newKeyScopes,
      purpose: newKeyPurpose,
      expiresInDays: newKeyExpiry ? parseInt(newKeyExpiry, 10) : undefined,
      creditLimit: newKeyCreditLimit ? parseInt(newKeyCreditLimit, 10) : null,
      rateLimit: newKeyRateLimit ? parseInt(newKeyRateLimit, 10) : undefined,
      quotaHourly: newKeyQuotaHourly ? parseInt(newKeyQuotaHourly, 10) : null,
      quotaDaily: newKeyQuotaDaily ? parseInt(newKeyQuotaDaily, 10) : null,
      quotaWeekly: newKeyQuotaWeekly ? parseInt(newKeyQuotaWeekly, 10) : null,
      quotaMonthly: newKeyQuotaMonthly ? parseInt(newKeyQuotaMonthly, 10) : null,
      creditQuota5h: newKeyPurpose === "mcp_cli" ? (newKeyCreditQuota5h ? parseInt(newKeyCreditQuota5h, 10) : null) : null,
      creditQuotaDaily: newKeyPurpose === "mcp_cli" ? (newKeyCreditQuotaDaily ? parseInt(newKeyCreditQuotaDaily, 10) : null) : null,
      creditQuotaWeekly: newKeyPurpose === "mcp_cli" ? (newKeyCreditQuotaWeekly ? parseInt(newKeyCreditQuotaWeekly, 10) : null) : null,
    });
  }

  function openCreateDialog(purpose: "public_api" | "mcp_cli") {
    resetCreateForm();
    setNewKeyPurpose(purpose);
    if (purpose === "mcp_cli") {
      setNewKeyName("SmartAIHub MCP CLI");
      setNewKeyScopes([...MCP_CLI_DEFAULT_SCOPES]);
      setNewKeyCreditQuota5h(String(MCP_CLI_DEFAULT_CREDIT_QUOTAS.fiveHour));
      setNewKeyCreditQuotaDaily(String(MCP_CLI_DEFAULT_CREDIT_QUOTAS.daily));
      setNewKeyCreditQuotaWeekly(String(MCP_CLI_DEFAULT_CREDIT_QUOTAS.weekly));
    }
    setCreateOpen(true);
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">API Keys</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Create a normal REST key, or a dedicated MCP CLI key for Hermes CLI,
            Claude Code CLI, and Codex CLI when the machine cannot open a browser.
            Usage is deducted from your own credits.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => openCreateDialog("public_api")}>
            <Plus className="h-4 w-4 mr-2" /> Create API Key
          </Button>
          <Button onClick={() => openCreateDialog("mcp_cli")}>
            <Key className="h-4 w-4 mr-2" /> Create MCP CLI Key
          </Button>
        </div>
      </div>

      <DashboardCard title="MCP CLI connection" description="Use OAuth when the client can open a browser. Use a dedicated MCP CLI key only for a headless or OAuth-incompatible machine." leading={<Shield className="h-5 w-5 text-sky-500" />}>
        <div className="space-y-3 text-sm">
          <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sky-950">
            <div className="font-medium">Canonical endpoint</div>
            <code className="mt-1 block break-all">{MCP_ENDPOINT}</code>
            <p className="mt-2 text-xs text-sky-800">API keys are tenant/user scoped, visible only once, and still checked against scopes, ACLs, rate limits, and the 5-hour / daily / 7-day credit budgets.</p>
          </div>
          <div className="grid gap-2 text-xs md:grid-cols-3">
            <div className="rounded border p-2"><span className="font-medium">Hermes CLI:</span> add the endpoint with header auth and enter the key in Hermes' secure credential prompt.</div>
            <div className="rounded border p-2"><span className="font-medium">Claude Code:</span> use <code>SMARTAIHUB_MCP_KEY</code> and a Bearer header.</div>
            <div className="rounded border p-2"><span className="font-medium">Codex CLI:</span> use <code>--bearer-token-env-var SMARTAIHUB_MCP_KEY</code>.</div>
          </div>
          <a className="inline-flex items-center text-sm text-sky-700 underline" href="/v1/docs/" target="_blank" rel="noreferrer">
            Open the current MCP connection guide <ExternalLink className="ml-1 h-3.5 w-3.5" />
          </a>
        </div>
      </DashboardCard>

      {/* Docs banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <Key className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-medium text-blue-900">API Documentation</p>
          <p className="text-sm text-blue-700 mt-0.5">
            Full REST API reference, scopes guide, and SDK generation instructions.
          </p>
        </div>
        <a href="/v1/docs" target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm" className="text-blue-700 border-blue-300">
            <ExternalLink className="h-3 w-3 mr-1" /> View Docs
          </Button>
        </a>
      </div>

      <Tabs defaultValue="keys">
        <TabsList>
          <TabsTrigger value="keys">My API Keys</TabsTrigger>
          <TabsTrigger value="webhooks">My Webhooks</TabsTrigger>
        </TabsList>

        {/* Keys tab */}
        <TabsContent value="keys">
          <DashboardCard title="My API Keys" description="Manage API keys issued to your account." leading={<Key className="h-5 w-5 text-sky-500" />}>
            <div className="space-y-4">
              {keysQuery.isLoading && (
                <p className="text-sm text-muted-foreground py-4">Loading...</p>
              )}
              {!keysQuery.isLoading && (!keysQuery.data || keysQuery.data.length === 0) && (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No API keys yet. Create one to connect external tools to your account.
                </p>
              )}
              {keysQuery.data && keysQuery.data.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Key Prefix</TableHead>
                      <TableHead>Scopes</TableHead>
                      <TableHead>Limits</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Last Used</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {keysQuery.data.map((key: any) => (
                      <TableRow key={key.id}>
                        <TableCell className="font-medium">{key.name}</TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">
                            {key.keyPrefix}...
                          </code>
                        </TableCell>
                        <TableCell>
                          {key.keyPurpose === "mcp_cli" ? (
                            <details className="max-w-xs">
                              <summary className="cursor-pointer text-xs text-sky-700">{key.scopes.length} permissions</summary>
                              <div className="mt-2 space-y-1">
                                {key.scopes.map((scope: string) => (
                                  <div key={scope} className="text-xs">
                                    <Badge variant="secondary" className="mr-1 text-[10px]">{scope}</Badge>
                                    <span className="text-muted-foreground">{MCP_SCOPE_HELP[scope] ?? "enabled for this key"}</span>
                                  </div>
                                ))}
                              </div>
                            </details>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {key.scopes.slice(0, 3).map((scope: string) => (
                                <Badge key={scope} variant="secondary" className="text-xs">{scope}</Badge>
                              ))}
                              {key.scopes.length > 3 && <Badge variant="outline" className="text-xs">+{key.scopes.length - 3}</Badge>}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="space-y-0.5">
                            {key.keyPurpose === "mcp_cli" && (
                              <Badge variant="outline" className="border-sky-300 text-sky-700 text-xs">
                                MCP CLI
                              </Badge>
                            )}
                            <div>{key.rateLimit ?? 60} RPM</div>
                            {((key as any).quotaHourly || (key as any).quotaDaily || (key as any).quotaWeekly || (key as any).quotaMonthly) && (
                              <div className="text-xs text-muted-foreground flex flex-wrap gap-1">
                                {(key as any).quotaHourly && <span title="Hourly quota">{(key as any).quotaHourly}/h</span>}
                                {(key as any).quotaDaily && <span title="Daily quota">{(key as any).quotaDaily}/d</span>}
                                {(key as any).quotaWeekly && <span title="Weekly quota">{(key as any).quotaWeekly}/w</span>}
                                {(key as any).quotaMonthly && <span title="Monthly quota">{(key as any).quotaMonthly}/mo</span>}
                              </div>
                            )}
                            {key.keyPurpose === "mcp_cli" && (key.creditQuota5h || key.creditQuotaDaily || key.creditQuotaWeekly) && (
                              <div className="text-xs text-amber-700 flex flex-wrap gap-1">
                                {key.creditQuota5h && <span title="Credits per 5-hour bucket">{key.creditQuota5h}/5h credits</span>}
                                {key.creditQuotaDaily && <span title="Credits per day">{key.creditQuotaDaily}/d credits</span>}
                                {key.creditQuotaWeekly && <span title="Credits per 7-day bucket">{key.creditQuotaWeekly}/7d credits</span>}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {(key as any).isSuspended ? (
                            <Badge className="bg-orange-100 text-orange-800 text-xs" title="Suspended by admin">
                              Suspended
                            </Badge>
                          ) : key.isActive ? (
                            <Badge className="bg-green-100 text-green-800 text-xs">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Active
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              <XCircle className="h-3 w-3 mr-1" /> Revoked
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {key.expiresAt ? (
                            <span className={new Date(key.expiresAt as string) < new Date() ? "text-destructive" : ""}>
                              {new Date(key.expiresAt as string).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="text-xs">Never</span>
                          )}
                          {key.expiresAt && new Date(key.expiresAt as string) > new Date() &&
                           new Date(key.expiresAt as string).getTime() - Date.now() < 30 * 86_400_000 && (
                            <Badge variant="outline" className="text-amber-600 border-amber-300 ml-2">
                              Expiring soon
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {key.lastUsedAt
                            ? new Date(key.lastUsedAt as string).toLocaleDateString()
                            : "Never"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setViewingStats(key.id)}
                              title="View usage stats"
                            >
                              <Activity className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setEditingLimits({
                                  id: key.id,
                                  name: key.name,
                                  rateLimit: key.rateLimit ?? 60,
                                  creditLimit: (key as any).creditLimit ?? null,
                                  quotaHourly: (key as any).quotaHourly ?? null,
                                  quotaDaily: (key as any).quotaDaily ?? null,
                                  quotaWeekly: (key as any).quotaWeekly ?? null,
                                  quotaMonthly: (key as any).quotaMonthly ?? null,
                                  keyPurpose: (key as any).keyPurpose,
                                  creditQuota5h: (key as any).creditQuota5h ?? null,
                                  creditQuotaDaily: (key as any).creditQuotaDaily ?? null,
                                  creditQuotaWeekly: (key as any).creditQuotaWeekly ?? null,
                                })
                              }
                              title="Edit limits & quotas"
                              disabled={(key as any).isSuspended}
                            >
                              <SlidersHorizontal className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRotateTarget({ id: key.id, name: key.name, purpose: key.keyPurpose ?? "public_api" })}
                              title="Rotate key"
                              disabled={(key as any).isSuspended || !key.isActive}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => setRevokeTarget({ id: key.id, name: key.name })}
                              title="Revoke key permanently"
                              disabled={(key as any).isSuspended}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </DashboardCard>
        </TabsContent>

        {/* Webhooks tab */}
        <TabsContent value="webhooks">
          <DashboardCard
            title="My Webhooks"
            description={
              <>
                Register webhooks via the API (<code>POST /v1/webhooks</code>) to receive push events.
              </>
            }
            leading={<Key className="h-5 w-5 text-sky-500" />}
          >
            <div className="space-y-4">
              {webhooksQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
              {!webhooksQuery.isLoading && (!webhooksQuery.data || webhooksQuery.data.length === 0) && (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No webhooks registered yet.
                </p>
              )}
              {webhooksQuery.data && webhooksQuery.data.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>URL</TableHead>
                      <TableHead>Events</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Failures</TableHead>
                      <TableHead>Last Delivered</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {webhooksQuery.data.map((wh) => (
                      <TableRow key={wh.id}>
                        <TableCell>
                          <code className="text-xs truncate max-w-xs block">{wh.url}</code>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(wh.events as string[]).map((e) => (
                              <Badge key={e} variant="outline" className="text-xs">{e}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          {wh.isActive ? (
                            <Badge className="bg-green-100 text-green-800 text-xs">Active</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">Disabled</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{wh.failureCount}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {wh.lastDeliveredAt
                            ? new Date(wh.lastDeliveredAt as string).toLocaleDateString()
                            : "Never"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {!wh.isActive && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => reEnableWebhookMutation.mutate({ webhookId: wh.id })}
                              >
                                <RefreshCw className="h-3 w-3 mr-1" /> Re-enable
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => setConfirmDeleteWebhook(wh.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </DashboardCard>
        </TabsContent>
      </Tabs>

      {/* ── Dialogs ── */}

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {newKeyPurpose === "mcp_cli" ? "Create MCP CLI Key" : "Create API Key"}
            </DialogTitle>
            <DialogDescription>
              {newKeyPurpose === "mcp_cli"
                ? "Use this one-time key on a machine without a browser. Store it in the CLI secret store or an environment variable; never paste it into chat."
                : "Select scopes and set limits. Usage will be deducted from your own credits."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                placeholder="e.g. My n8n Integration"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                maxLength={100}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Quick select</Label>
              <div className="flex flex-wrap gap-2">
                {SCOPE_BUNDLES.map((bundle) => (
                  <Button
                    key={bundle.label}
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => setNewKeyScopes(bundle.scopes)}
                  >
                    <Shield className="h-3 w-3 mr-1" /> {bundle.label}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Scopes</Label>
              <div className="space-y-3">
                {SCOPE_CATEGORIES.map((cat) => (
                  <div key={cat.label}>
                    <p className="text-xs font-medium text-muted-foreground mb-1">{cat.label}</p>
                    <div className="flex flex-wrap gap-3">
                      {cat.scopes.map((scope) => (
                        <div key={scope} className="flex items-center gap-1.5">
                          <Checkbox
                            id={`scope-${scope}`}
                            checked={newKeyScopes.includes(scope)}
                            onCheckedChange={() => toggleScope(scope)}
                          />
                          <Label htmlFor={`scope-${scope}`} className="text-xs cursor-pointer">{scope}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {newKeyPurpose === "mcp_cli" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
                <div>
                  <Label className="text-sm">Credit budgets for MCP</Label>
                  <p className="text-xs text-amber-800 mt-1">
                    These are credits spent, not request counts. Blank means unlimited.
                    Request-count limits below still apply independently.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label htmlFor="key-credit-5h" className="text-xs">5 hours</Label>
                    <Input id="key-credit-5h" type="number" min={1} value={newKeyCreditQuota5h} onChange={(e) => setNewKeyCreditQuota5h(e.target.value)} placeholder="∞" />
                  </div>
                  <div>
                    <Label htmlFor="key-credit-daily" className="text-xs">1 day</Label>
                    <Input id="key-credit-daily" type="number" min={1} value={newKeyCreditQuotaDaily} onChange={(e) => setNewKeyCreditQuotaDaily(e.target.value)} placeholder="∞" />
                  </div>
                  <div>
                    <Label htmlFor="key-credit-weekly" className="text-xs">7 days</Label>
                    <Input id="key-credit-weekly" type="number" min={1} value={newKeyCreditQuotaWeekly} onChange={(e) => setNewKeyCreditQuotaWeekly(e.target.value)} placeholder="∞" />
                  </div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="key-expiry" className="text-xs">Expires (days)</Label>
                <Input id="key-expiry" type="number" value={newKeyExpiry} onChange={(e) => setNewKeyExpiry(e.target.value)} placeholder="365" />
              </div>
              <div>
                <Label htmlFor="key-credit" className="text-xs">Credit limit/day</Label>
                <Input id="key-credit" type="number" value={newKeyCreditLimit} onChange={(e) => setNewKeyCreditLimit(e.target.value)} placeholder="Unlimited" />
              </div>
              <div>
                <Label htmlFor="key-rate" className="text-xs">Rate limit (RPM)</Label>
                <Input id="key-rate" type="number" value={newKeyRateLimit} onChange={(e) => setNewKeyRateLimit(e.target.value)} placeholder="60" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">
                Request quotas — block at 100% (blank = unlimited)
              </Label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: "key-quota-h", label: "Hourly", val: newKeyQuotaHourly, set: setNewKeyQuotaHourly },
                  { id: "key-quota-d", label: "Daily", val: newKeyQuotaDaily, set: setNewKeyQuotaDaily },
                  { id: "key-quota-w", label: "Weekly", val: newKeyQuotaWeekly, set: setNewKeyQuotaWeekly },
                  { id: "key-quota-m", label: "Monthly", val: newKeyQuotaMonthly, set: setNewKeyQuotaMonthly },
                ].map(({ id, label, val, set }) => (
                  <div key={id}>
                    <Label htmlFor={id} className="text-xs">{label}</Label>
                    <Input id={id} type="number" min={1} value={val} onChange={(e) => set(e.target.value)} placeholder="∞" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newKeyName || newKeyScopes.length === 0 || createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* One-time key display */}
      <Dialog open={!!createdKey} onOpenChange={() => setCreatedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" /> {createdKey?.purpose === "mcp_cli" ? "Your MCP CLI key" : "Your new API key"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">Copy this key now — it will not be shown again.</p>
            </div>
            <div className="bg-muted rounded p-3 font-mono text-sm break-all select-all">
              {createdKey?.rawKey}
            </div>
            <Button className="w-full" variant="outline" onClick={() => createdKey && copyToClipboard(createdKey.rawKey)}>
              <Copy className="h-4 w-4 mr-2" /> Copy to Clipboard
            </Button>
            {createdKey?.purpose === "mcp_cli" && (
              <div className="rounded-lg border bg-slate-50 p-3 text-xs space-y-2">
                <p className="font-medium">Headless CLI setup</p>
                <p>Save the key as <code>SMARTAIHUB_MCP_KEY</code> in the CLI machine's secret store or environment. Do not put the real key in shell history.</p>
                <code className="block break-all rounded bg-slate-900 p-2 text-slate-100">codex mcp add smartaihub --url https://smartaihub.app/v1/mcp --bearer-token-env-var SMARTAIHUB_MCP_KEY</code>
                <code className="block break-all rounded bg-slate-900 p-2 text-slate-100">claude mcp add --transport http smartaihub https://smartaihub.app/v1/mcp --header "Authorization: Bearer $SMARTAIHUB_MCP_KEY"</code>
                <code className="block break-all rounded bg-slate-900 p-2 text-slate-100">hermes mcp add smartaihub --url https://smartaihub.app/v1/mcp --auth header</code>
                <p>Hermes CLI: enter the key only into its secure credential prompt. Never put the raw key in shell history, chat, source code, or a URL.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setCreatedKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!rotateTarget} onOpenChange={(open) => !open && setRotateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate API key?</AlertDialogTitle>
            <AlertDialogDescription>
              A new key will be shown once and <strong>{rotateTarget?.name}</strong> will stop working immediately. Update the CLI secret store before closing the dialog.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => rotateTarget && rotateMutation.mutate({ keyId: rotateTarget.id })} disabled={rotateMutation.isPending}>
              {rotateMutation.isPending ? "Rotating..." : "Rotate key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke confirmation */}
      <AlertDialog open={!!revokeTarget} onOpenChange={() => setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              All services using <strong>{revokeTarget?.name}</strong> will stop working immediately. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => revokeTarget && revokeMutation.mutate({ keyId: revokeTarget.id })}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Usage stats */}
      <Dialog open={!!viewingStats} onOpenChange={() => setViewingStats(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" /> Usage Stats (7 days)
            </DialogTitle>
          </DialogHeader>
          {statsQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
          {statsQuery.data && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-muted rounded p-3">
                  <div className="text-xl font-bold">{statsQuery.data.totalRequests}</div>
                  <div className="text-xs text-muted-foreground">Requests</div>
                </div>
                <div className="bg-muted rounded p-3">
                  <div className="text-xl font-bold">{statsQuery.data.totalCredits}</div>
                  <div className="text-xs text-muted-foreground">Credits Used</div>
                </div>
                <div className="bg-muted rounded p-3">
                  <div className="text-xl font-bold">{(statsQuery.data.errorRate * 100).toFixed(1)}%</div>
                  <div className="text-xs text-muted-foreground">Error Rate</div>
                </div>
              </div>
              {statsQuery.data.requestsPerDay.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Per day</p>
                  {statsQuery.data.requestsPerDay.map((r: any) => (
                    <div key={r.date} className="flex justify-between text-sm py-0.5">
                      <span className="text-muted-foreground">{r.date}</span>
                      <span>{r.count} req {r.errors > 0 && <span className="text-destructive">{r.errors} err</span>}</span>
                    </div>
                  ))}
                </div>
              )}
              {statsQuery.data.topEndpoints.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Top endpoints</p>
                  {statsQuery.data.topEndpoints.map((e: any) => (
                    <div key={e.path} className="flex justify-between text-sm py-0.5">
                      <code className="text-xs">{e.path}</code>
                      <span>{e.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingStats(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Webhook delete confirmation */}
      <AlertDialog open={!!confirmDeleteWebhook} onOpenChange={(open) => !open && setConfirmDeleteWebhook(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Webhook?</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop all webhook deliveries to this URL. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDeleteWebhook && deleteWebhookMutation.mutate({ webhookId: confirmDeleteWebhook })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Limits */}
      {editingLimits && (
        <Dialog open={!!editingLimits} onOpenChange={() => setEditingLimits(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5" /> Edit Limits
              </DialogTitle>
              <DialogDescription>{editingLimits.name}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Rate limit (RPM)</Label>
                  <Input
                    type="number" min={1} max={10000}
                    value={editingLimits.rateLimit}
                    onChange={(e) => setEditingLimits((p) => p && { ...p, rateLimit: parseInt(e.target.value, 10) || 60 })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Credit limit/day</Label>
                  <Input
                    type="number" min={0}
                    value={editingLimits.creditLimit ?? ""}
                    onChange={(e) => setEditingLimits((p) => p && { ...p, creditLimit: e.target.value ? parseInt(e.target.value, 10) : null })}
                    placeholder="Unlimited"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Request quotas (blank = unlimited)</Label>
                <div className="grid grid-cols-4 gap-2">
                  {(["quotaHourly", "quotaDaily", "quotaWeekly", "quotaMonthly"] as const).map((field) => (
                    <div key={field}>
                      <Label className="text-xs">{field.replace("quota", "")}</Label>
                      <Input
                        type="number" min={1}
                        value={editingLimits[field] ?? ""}
                        onChange={(e) => setEditingLimits((p) => p && { ...p, [field]: e.target.value ? parseInt(e.target.value, 10) : null })}
                        placeholder="∞"
                      />
                    </div>
                  ))}
                </div>
              </div>
              {editingLimits.keyPurpose === "mcp_cli" && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                  <Label className="text-xs text-amber-900">MCP credit budgets (blank = unlimited)</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      ["creditQuota5h", "5 hours"],
                      ["creditQuotaDaily", "1 day"],
                      ["creditQuotaWeekly", "7 days"],
                    ] as const).map(([field, label]) => (
                      <div key={field}>
                        <Label className="text-xs">{label}</Label>
                        <Input
                          type="number" min={1}
                          value={editingLimits[field] ?? ""}
                          onChange={(e) => setEditingLimits((p) => p && { ...p, [field]: e.target.value ? parseInt(e.target.value, 10) : null })}
                          placeholder="∞"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingLimits(null)}>Cancel</Button>
              <Button
                disabled={updateSettingsMutation.isPending}
                onClick={() =>
                  updateSettingsMutation.mutate({
                    keyId: editingLimits.id,
                    rateLimit: editingLimits.rateLimit,
                    creditLimit: editingLimits.creditLimit,
                    quotaHourly: editingLimits.quotaHourly,
                    quotaDaily: editingLimits.quotaDaily,
                    quotaWeekly: editingLimits.quotaWeekly,
                    quotaMonthly: editingLimits.quotaMonthly,
                    creditQuota5h: editingLimits.creditQuota5h,
                    creditQuotaDaily: editingLimits.creditQuotaDaily,
                    creditQuotaWeekly: editingLimits.creditQuotaWeekly,
                  })
                }
              >
                {updateSettingsMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
