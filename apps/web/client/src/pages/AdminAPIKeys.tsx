import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  PauseCircle,
  PlayCircle,
} from "lucide-react";
import { toast } from "sonner";

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
  { label: "Jobs", scopes: ["jobs:create", "jobs:read", "jobs:write"] },
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminAPIKeys() {
  const utils = trpc.useUtils();

  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>([]);
  const [newKeyExpiry, setNewKeyExpiry] = useState("365");
  const [newKeyCreditLimit, setNewKeyCreditLimit] = useState("");
  const [newKeyRateLimit, setNewKeyRateLimit] = useState("60");
  const [newKeyQuotaHourly, setNewKeyQuotaHourly] = useState("");
  const [newKeyQuotaDaily, setNewKeyQuotaDaily] = useState("");
  const [newKeyQuotaWeekly, setNewKeyQuotaWeekly] = useState("");
  const [newKeyQuotaMonthly, setNewKeyQuotaMonthly] = useState("");

  const [createdKey, setCreatedKey] = useState<{ rawKey: string; name: string } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);
  const [viewingStats, setViewingStats] = useState<string | null>(null);
  const [editingLimits, setEditingLimits] = useState<{
    id: string; name: string;
    rateLimit: number; creditLimit: number | null;
    quotaHourly: number | null; quotaDaily: number | null;
    quotaWeekly: number | null; quotaMonthly: number | null;
  } | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<{ id: string; name: string } | null>(null);
  const [suspendReason, setSuspendReason] = useState("");

  const keysQuery = trpc.apiKeys.list.useQuery();
  const webhooksQuery = trpc.apiKeys.listWebhooks.useQuery();
  const statsQuery = trpc.apiKeys.getUsageStats.useQuery(
    { keyId: viewingStats!, days: 7 },
    { enabled: !!viewingStats },
  );

  const createMutation = trpc.apiKeys.create.useMutation({
    onSuccess: (data) => {
      setCreatedKey({ rawKey: data.rawKey, name: data.name });
      setCreateOpen(false);
      resetCreateForm();
      utils.apiKeys.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const revokeMutation = trpc.apiKeys.revoke.useMutation({
    onSuccess: () => {
      setRevokeTarget(null);
      utils.apiKeys.list.invalidate();
      toast.success("API key revoked");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteWebhookMutation = trpc.apiKeys.deleteWebhook.useMutation({
    onSuccess: () => {
      utils.apiKeys.listWebhooks.invalidate();
      toast.success("Webhook deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  const reEnableWebhookMutation = trpc.apiKeys.reEnableWebhook.useMutation({
    onSuccess: () => {
      utils.apiKeys.listWebhooks.invalidate();
      toast.success("Webhook re-enabled");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateSettingsMutation = trpc.apiKeys.updateSettings.useMutation({
    onSuccess: () => {
      setEditingLimits(null);
      utils.apiKeys.list.invalidate();
      toast.success("Limits updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const suspendMutation = trpc.apiKeys.suspend.useMutation({
    onSuccess: () => {
      setSuspendTarget(null);
      setSuspendReason("");
      utils.apiKeys.list.invalidate();
      toast.success("API key suspended");
    },
    onError: (err) => toast.error(err.message),
  });

  const unsuspendMutation = trpc.apiKeys.unsuspend.useMutation({
    onSuccess: () => {
      utils.apiKeys.list.invalidate();
      toast.success("API key unsuspended");
    },
    onError: (err) => toast.error(err.message),
  });

  function resetCreateForm() {
    setNewKeyName("");
    setNewKeyScopes([]);
    setNewKeyExpiry("365");
    setNewKeyCreditLimit("");
    setNewKeyRateLimit("60");
    setNewKeyQuotaHourly("");
    setNewKeyQuotaDaily("");
    setNewKeyQuotaWeekly("");
    setNewKeyQuotaMonthly("");
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
      expiresInDays: newKeyExpiry ? parseInt(newKeyExpiry, 10) : undefined,
      creditLimit: newKeyCreditLimit ? parseInt(newKeyCreditLimit, 10) : null,
      rateLimit: newKeyRateLimit ? parseInt(newKeyRateLimit, 10) : undefined,
      quotaHourly: newKeyQuotaHourly ? parseInt(newKeyQuotaHourly, 10) : null,
      quotaDaily: newKeyQuotaDaily ? parseInt(newKeyQuotaDaily, 10) : null,
      quotaWeekly: newKeyQuotaWeekly ? parseInt(newKeyQuotaWeekly, 10) : null,
      quotaMonthly: newKeyQuotaMonthly ? parseInt(newKeyQuotaMonthly, 10) : null,
    });
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Key className="h-6 w-6" /> API Keys
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage external integrations and API access tokens
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Create API Key
        </Button>
      </div>

      <Tabs defaultValue="keys">
        <TabsList>
          <TabsTrigger value="keys">API Keys</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
        </TabsList>

        {/* Keys tab */}
        <TabsContent value="keys">
          <Card>
            <CardContent className="pt-4">
              {keysQuery.isLoading && (
                <p className="text-sm text-muted-foreground py-4">Loading...</p>
              )}
              {!keysQuery.isLoading && (!keysQuery.data || keysQuery.data.length === 0) && (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No API keys yet. Create one to get started.
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
                    {keysQuery.data.map((key) => (
                      <TableRow key={key.id}>
                        <TableCell className="font-medium">{key.name}</TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">
                            {key.keyPrefix}...
                          </code>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {key.scopes.slice(0, 3).map((scope: string) => (
                              <Badge key={scope} variant="secondary" className="text-xs">
                                {scope}
                              </Badge>
                            ))}
                            {key.scopes.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{key.scopes.length - 3}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="space-y-0.5">
                            <div>{key.rateLimit ?? 60} RPM</div>
                            {((key as any).quotaHourly || (key as any).quotaDaily || (key as any).quotaWeekly || (key as any).quotaMonthly) && (
                              <div className="text-xs text-muted-foreground flex flex-wrap gap-1">
                                {(key as any).quotaHourly && <span title="Hourly quota">{(key as any).quotaHourly}/h</span>}
                                {(key as any).quotaDaily && <span title="Daily quota">{(key as any).quotaDaily}/d</span>}
                                {(key as any).quotaWeekly && <span title="Weekly quota">{(key as any).quotaWeekly}/w</span>}
                                {(key as any).quotaMonthly && <span title="Monthly quota">{(key as any).quotaMonthly}/mo</span>}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {(key as any).isSuspended ? (
                            <Badge className="bg-orange-100 text-orange-800 text-xs" title={(key as any).suspendedReason ?? undefined}>
                              <PauseCircle className="h-3 w-3 mr-1" /> Suspended
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
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {key.lastUsedAt
                            ? new Date(key.lastUsedAt as string).toLocaleDateString()
                            : "Never"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
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
                                })
                              }
                              title="Edit limits & quotas"
                            >
                              <SlidersHorizontal className="h-4 w-4" />
                            </Button>
                            {(key as any).isSuspended ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-green-600"
                                onClick={() => unsuspendMutation.mutate({ keyId: key.id })}
                                title="Lift suspension"
                                disabled={unsuspendMutation.isPending}
                              >
                                <PlayCircle className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-orange-600"
                                onClick={() => setSuspendTarget({ id: key.id, name: key.name })}
                                title="Suspend key temporarily"
                              >
                                <PauseCircle className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => setRevokeTarget({ id: key.id, name: key.name })}
                              title="Revoke key permanently"
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* Webhooks tab */}
        <TabsContent value="webhooks">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Registered Webhooks</CardTitle>
              <CardDescription>
                Webhooks are registered via the Public API (<code>POST /v1/webhooks</code>).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {webhooksQuery.isLoading && (
                <p className="text-sm text-muted-foreground">Loading...</p>
              )}
              {!webhooksQuery.isLoading && (!webhooksQuery.data || webhooksQuery.data.length === 0) && (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No webhooks registered.
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
                              <Badge key={e} variant="outline" className="text-xs">
                                {e}
                              </Badge>
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
                                onClick={() =>
                                  reEnableWebhookMutation.mutate({ webhookId: wh.id })
                                }
                              >
                                <RefreshCw className="h-3 w-3 mr-1" /> Re-enable
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() =>
                                deleteWebhookMutation.mutate({ webhookId: wh.id })
                              }
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
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>Configure scopes and limits.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                placeholder="e.g. Production Integration"
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
                          <Label htmlFor={`scope-${scope}`} className="text-xs cursor-pointer">
                            {scope}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="key-expiry" className="text-xs">Expires (days)</Label>
                <Input
                  id="key-expiry"
                  type="number"
                  value={newKeyExpiry}
                  onChange={(e) => setNewKeyExpiry(e.target.value)}
                  placeholder="365"
                />
              </div>
              <div>
                <Label htmlFor="key-credit" className="text-xs">Credit limit/day</Label>
                <Input
                  id="key-credit"
                  type="number"
                  value={newKeyCreditLimit}
                  onChange={(e) => setNewKeyCreditLimit(e.target.value)}
                  placeholder="Unlimited"
                />
              </div>
              <div>
                <Label htmlFor="key-rate" className="text-xs">Rate limit (RPM)</Label>
                <Input
                  id="key-rate"
                  type="number"
                  value={newKeyRateLimit}
                  onChange={(e) => setNewKeyRateLimit(e.target.value)}
                  placeholder="60"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">
                Request quotas — alert at 80%, block at 100% (leave blank = unlimited)
              </Label>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <Label htmlFor="key-quota-h" className="text-xs">Hourly</Label>
                  <Input
                    id="key-quota-h"
                    type="number"
                    min={1}
                    value={newKeyQuotaHourly}
                    onChange={(e) => setNewKeyQuotaHourly(e.target.value)}
                    placeholder="∞"
                  />
                </div>
                <div>
                  <Label htmlFor="key-quota-d" className="text-xs">Daily</Label>
                  <Input
                    id="key-quota-d"
                    type="number"
                    min={1}
                    value={newKeyQuotaDaily}
                    onChange={(e) => setNewKeyQuotaDaily(e.target.value)}
                    placeholder="∞"
                  />
                </div>
                <div>
                  <Label htmlFor="key-quota-w" className="text-xs">Weekly</Label>
                  <Input
                    id="key-quota-w"
                    type="number"
                    min={1}
                    value={newKeyQuotaWeekly}
                    onChange={(e) => setNewKeyQuotaWeekly(e.target.value)}
                    placeholder="∞"
                  />
                </div>
                <div>
                  <Label htmlFor="key-quota-m" className="text-xs">Monthly</Label>
                  <Input
                    id="key-quota-m"
                    type="number"
                    min={1}
                    value={newKeyQuotaMonthly}
                    onChange={(e) => setNewKeyQuotaMonthly(e.target.value)}
                    placeholder="∞"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!newKeyName || newKeyScopes.length === 0 || createMutation.isPending}
            >
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
              <Key className="h-5 w-5" /> Your new API key
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                Make sure to copy this key now. You will not be able to see it again.
              </p>
            </div>
            <div className="bg-muted rounded p-3 font-mono text-sm break-all select-all">
              {createdKey?.rawKey}
            </div>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => createdKey && copyToClipboard(createdKey.rawKey)}
            >
              <Copy className="h-4 w-4 mr-2" /> Copy to Clipboard
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreatedKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke confirmation */}
      <AlertDialog open={!!revokeTarget} onOpenChange={() => setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              All services using <strong>{revokeTarget?.name}</strong> will stop working
              immediately. This action cannot be undone.
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

      {/* Usage stats dialog */}
      <Dialog open={!!viewingStats} onOpenChange={() => setViewingStats(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" /> Key Usage (7 days)
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
                  <div className="text-xs text-muted-foreground">Credits</div>
                </div>
                <div className="bg-muted rounded p-3">
                  <div className="text-xl font-bold">
                    {(statsQuery.data.errorRate * 100).toFixed(1)}%
                  </div>
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

      {/* Suspend confirmation dialog */}
      <Dialog open={!!suspendTarget} onOpenChange={() => { setSuspendTarget(null); setSuspendReason(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-700">
              <PauseCircle className="h-5 w-5" /> Suspend API Key
            </DialogTitle>
            <DialogDescription>
              <strong>{suspendTarget?.name}</strong> will be blocked immediately.
              The key can be unsuspended at any time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="suspend-reason" className="text-xs">Reason (optional)</Label>
              <Input
                id="suspend-reason"
                placeholder="e.g. Unusual traffic detected"
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSuspendTarget(null); setSuspendReason(""); }}>
              Cancel
            </Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white"
              disabled={suspendMutation.isPending}
              onClick={() =>
                suspendTarget &&
                suspendMutation.mutate({ keyId: suspendTarget.id, reason: suspendReason || undefined })
              }
            >
              {suspendMutation.isPending ? "Suspending..." : "Suspend Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Limits dialog */}
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
                    onChange={(e) =>
                      setEditingLimits((p) => p && { ...p, rateLimit: parseInt(e.target.value, 10) || 60 })
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Credit limit/day</Label>
                  <Input
                    type="number" min={0}
                    value={editingLimits.creditLimit ?? ""}
                    onChange={(e) =>
                      setEditingLimits((p) =>
                        p && { ...p, creditLimit: e.target.value ? parseInt(e.target.value, 10) : null },
                      )
                    }
                    placeholder="Unlimited"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">
                  Request quotas — alert 80%, block 100% (blank = unlimited)
                </Label>
                <div className="grid grid-cols-4 gap-2">
                  {(
                    [
                      { field: "quotaHourly", label: "Hourly" },
                      { field: "quotaDaily", label: "Daily" },
                      { field: "quotaWeekly", label: "Weekly" },
                      { field: "quotaMonthly", label: "Monthly" },
                    ] as const
                  ).map(({ field, label }) => (
                    <div key={field}>
                      <Label className="text-xs">{label}</Label>
                      <Input
                        type="number" min={1}
                        value={editingLimits[field] ?? ""}
                        onChange={(e) =>
                          setEditingLimits((p) =>
                            p && { ...p, [field]: e.target.value ? parseInt(e.target.value, 10) : null },
                          )
                        }
                        placeholder="∞"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingLimits(null)}>
                Cancel
              </Button>
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
