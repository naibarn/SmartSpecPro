/**
 * McpServerManager — admin page for MCP server registry (section-14).
 *
 * CRUD management of MCP servers with health indicators, transport-specific
 * config forms, test connection, and data classification warnings.
 */

import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useTenantFeatureFlag } from "@/hooks/useTenantFeatureFlag";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Server,
  Plus,
  Trash2,
  Edit,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowLeft,
  Wifi,
  Terminal,
  Globe,
  Shield,
  Lock,
  ChevronDown,
  ChevronRight,
  Wrench,
  Link2,
  X,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { toast } from "sonner";

// ── Types & Constants ──

const TRANSPORT_LABELS: Record<string, { label: string; icon: typeof Globe }> = {
  http: { label: "HTTP", icon: Globe },
  streamable_http: { label: "Streamable HTTP", icon: Wifi },
  stdio: { label: "stdio (npx)", icon: Terminal },
};

const HEALTH_BADGES: Record<string, { color: string; label: string }> = {
  healthy: { color: "bg-green-100 text-green-700", label: "Healthy" },
  unhealthy: { color: "bg-red-100 text-red-700", label: "Unhealthy" },
  unknown: { color: "bg-gray-100 text-gray-700", label: "Unknown" },
};

const CLASSIFICATION_BADGES: Record<string, { color: string; label: string }> = {
  public: { color: "bg-green-100 text-green-700", label: "Public" },
  internal: { color: "bg-yellow-100 text-yellow-700", label: "Internal" },
  confidential: { color: "bg-red-100 text-red-700", label: "Confidential" },
};

const RISK_BADGES: Record<string, { color: string }> = {
  low: { color: "bg-green-100 text-green-700" },
  medium: { color: "bg-yellow-100 text-yellow-700" },
  high: { color: "bg-red-100 text-red-700" },
};

interface ServerFormData {
  name: string;
  slug: string;
  description: string;
  transportType: "http" | "streamable_http" | "stdio";
  url: string;
  command: string;
  args: string;
  timeoutSeconds: number;
  riskLevel: "low" | "medium" | "high";
  dataClassification: "public" | "internal" | "confidential";
  creditPerCall: number;
  oauthClientId: string;
  oauthClientSecret: string;
}

interface DiscoveredTool {
  name: string;
  originalName: string;
  description: string | null;
  hasInputSchema: boolean;
}

interface AssignmentRow {
  id: number;
  mcpServerId: number;
  targetType: string;
  targetId: string;
  createdAt: Date | string;
}

const TARGET_TYPES = ["tenant", "agency", "agent"] as const;
type TargetType = (typeof TARGET_TYPES)[number];

const DEFAULT_FORM: ServerFormData = {
  name: "",
  slug: "",
  description: "",
  transportType: "http",
  url: "",
  command: "npx",
  args: "",
  timeoutSeconds: 30,
  riskLevel: "high",
  dataClassification: "internal",
  creditPerCall: 1,
  oauthClientId: "",
  oauthClientSecret: "",
};

// ── Page ──

export default function McpServerManager() {
  // FE03: Feature flag gate — hide page when MCP registry is disabled
  const mcpEnabled = useTenantFeatureFlag("mcpServerRegistry");
  if (mcpEnabled === false) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-muted-foreground">
        <div className="text-center">
          <Server className="mx-auto h-12 w-12 mb-4 opacity-50" />
          <h2 className="text-lg font-medium mb-2">MCP Server Registry</h2>
          <p>This feature is not enabled for your organization.</p>
        </div>
      </div>
    );
  }

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ServerFormData>(DEFAULT_FORM);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{
    reachable: boolean;
    toolCount: number;
    latencyMs: number;
  } | null>(null);

  // Feature 1: Discovered tools per server id
  const [discoveredTools, setDiscoveredTools] = useState<Record<number, DiscoveredTool[]>>({});
  const [toolPanelOpen, setToolPanelOpen] = useState<Record<number, boolean>>({});
  const [loadingTools, setLoadingTools] = useState<number | null>(null);

  // Feature 3: Assignment panel
  const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<Record<number, AssignmentRow[]>>({});
  const [assignForm, setAssignForm] = useState<{ targetType: TargetType; targetId: string }>({
    targetType: "agency",
    targetId: "",
  });
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const [removingAssignmentId, setRemovingAssignmentId] = useState<number | null>(null);

  const listQuery = trpc.mcpServers.list.useQuery();
  const createMutation = trpc.mcpServers.create.useMutation();
  const updateMutation = trpc.mcpServers.update.useMutation();
  const deleteMutation = trpc.mcpServers.delete.useMutation();
  const testMutation = trpc.mcpServers.testConnection.useMutation();
  const assignMutation = trpc.mcpServers.assignToTarget.useMutation();
  const removeAssignmentMutation = trpc.mcpServers.removeAssignment.useMutation();
  const utils = trpc.useUtils();

  const handleOpenAdd = useCallback(() => {
    setEditId(null);
    setForm(DEFAULT_FORM);
    setShowModal(true);
  }, []);

  const handleOpenEdit = useCallback(
    (server: NonNullable<typeof listQuery.data>[number]) => {
      const config = server.config as Record<string, unknown>;
      setEditId(server.id);
      setForm({
        name: server.name,
        slug: server.slug,
        description: (server.description as string) ?? "",
        transportType: server.transportType as ServerFormData["transportType"],
        url: (config?.url as string) ?? "",
        command: (config?.command as string) ?? "npx",
        args: Array.isArray(config?.args) ? config.args.join(" ") : "",
        timeoutSeconds: server.timeoutSeconds ?? 30,
        riskLevel: (server.riskLevel ?? "high") as ServerFormData["riskLevel"],
        dataClassification: (server.dataClassification ?? "internal") as ServerFormData["dataClassification"],
        creditPerCall: Number(server.creditPerCall ?? 1),
        oauthClientId: "",
        oauthClientSecret: "",
      });
      setShowModal(true);
    },
    [],
  );

  const handleSave = useCallback(async () => {
    const config =
      form.transportType === "stdio"
        ? { command: "npx" as const, args: form.args.split(/\s+/).filter(Boolean) }
        : { url: form.url };

    try {
      if (editId) {
        await updateMutation.mutateAsync({
          id: editId,
          name: form.name,
          description: form.description || undefined,
          transportType: form.transportType,
          config,
          timeoutSeconds: form.timeoutSeconds,
          riskLevel: form.riskLevel,
          dataClassification: form.dataClassification,
          creditPerCall: form.creditPerCall,
          ...(form.oauthClientId ? { oauthClientId: form.oauthClientId } : {}),
          ...(form.oauthClientSecret ? { oauthClientSecret: form.oauthClientSecret } : {}),
        });
        toast.success("MCP server updated");
      } else {
        await createMutation.mutateAsync({
          name: form.name,
          slug: form.slug,
          description: form.description || undefined,
          transportType: form.transportType,
          config,
          timeoutSeconds: form.timeoutSeconds,
          riskLevel: form.riskLevel,
          dataClassification: form.dataClassification,
          creditPerCall: form.creditPerCall,
          ...(form.oauthClientId ? { oauthClientId: form.oauthClientId } : {}),
          ...(form.oauthClientSecret ? { oauthClientSecret: form.oauthClientSecret } : {}),
        });
        toast.success("MCP server created");
      }
      setShowModal(false);
      utils.mcpServers.list.invalidate();
    } catch (err: any) {
      toast.error(err.message || "Failed to save MCP server");
    }
  }, [form, editId, createMutation, updateMutation, utils]);

  const handleDelete = useCallback(
    async (id: number) => {
      if (!confirm("Delete this MCP server? All assignments will be removed.")) return;
      try {
        await deleteMutation.mutateAsync({ id });
        toast.success("MCP server deleted");
        utils.mcpServers.list.invalidate();
      } catch (err: any) {
        toast.error(err.message || "Failed to delete");
      }
    },
    [deleteMutation, utils],
  );

  const handleTest = useCallback(
    async (id: number) => {
      setTestingId(id);
      setTestResult(null);
      try {
        const result = await testMutation.mutateAsync({ id });
        setTestResult(result);
        utils.mcpServers.list.invalidate();
        if (result.reachable) {
          toast.success(`Connected! ${result.toolCount} tools found (${result.latencyMs}ms)`);
          // Feature 1: Fetch discovered tools after successful connection test
          setLoadingTools(id);
          try {
            const toolData = await utils.mcpServers.listDiscoveredTools.fetch({ id });
            setDiscoveredTools((prev) => ({ ...prev, [id]: toolData.tools }));
            setToolPanelOpen((prev) => ({ ...prev, [id]: true }));
          } catch {
            // Non-fatal — tool discovery is best-effort
          } finally {
            setLoadingTools(null);
          }
        } else {
          toast.error("Server unreachable");
        }
      } catch {
        toast.error("Connection test failed");
      } finally {
        setTestingId(null);
      }
    },
    [testMutation, utils],
  );

  // Feature 2: Enable/Disable toggle
  const handleToggleEnabled = useCallback(
    async (id: number, currentEnabled: boolean) => {
      try {
        await updateMutation.mutateAsync({ id, enabled: !currentEnabled });
        utils.mcpServers.list.invalidate();
        toast.success(!currentEnabled ? "Server enabled" : "Server disabled");
      } catch (err: any) {
        toast.error(err.message || "Failed to update server");
      }
    },
    [updateMutation, utils],
  );

  // Feature 3: Assign server to target
  const handleAssign = useCallback(
    async (mcpServerId: number) => {
      if (!assignForm.targetId.trim()) {
        toast.error("Target ID is required");
        return;
      }
      setAssigningId(mcpServerId);
      try {
        const result = await assignMutation.mutateAsync({
          mcpServerId,
          targetType: assignForm.targetType,
          targetId: assignForm.targetId.trim(),
        });
        setAssignments((prev) => ({
          ...prev,
          [mcpServerId]: [
            ...(prev[mcpServerId] ?? []),
            {
              id: result.id,
              mcpServerId: result.mcpServerId,
              targetType: result.targetType,
              targetId: result.targetId,
              createdAt: result.createdAt,
            },
          ],
        }));
        setAssignForm((prev) => ({ ...prev, targetId: "" }));
        toast.success("Assignment created");
      } catch (err: any) {
        toast.error(err.message || "Failed to create assignment");
      } finally {
        setAssigningId(null);
      }
    },
    [assignMutation, assignForm],
  );

  const handleRemoveAssignment = useCallback(
    async (assignmentId: number, mcpServerId: number) => {
      setRemovingAssignmentId(assignmentId);
      try {
        await removeAssignmentMutation.mutateAsync({ id: assignmentId });
        setAssignments((prev) => ({
          ...prev,
          [mcpServerId]: (prev[mcpServerId] ?? []).filter((a) => a.id !== assignmentId),
        }));
        toast.success("Assignment removed");
      } catch (err: any) {
        toast.error(err.message || "Failed to remove assignment");
      } finally {
        setRemovingAssignmentId(null);
      }
    },
    [removeAssignmentMutation],
  );

  const servers = listQuery.data ?? [];

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/settings">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Server className="h-6 w-6" />
              MCP Servers
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage Model Context Protocol server connections for AI agencies
            </p>
          </div>
        </div>
        <Button onClick={handleOpenAdd}>
          <Plus className="h-4 w-4 mr-1" /> Add Server
        </Button>
      </div>

      {/* Server list */}
      {listQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : servers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Server className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No MCP servers configured.</p>
            <p className="text-sm mt-1">Add a server to connect external tools to your agencies.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {servers.map((server) => {
            const transport = TRANSPORT_LABELS[server.transportType] ?? TRANSPORT_LABELS.http;
            const health = HEALTH_BADGES[server.healthStatus ?? "unknown"] ?? HEALTH_BADGES.unknown;
            const classification = CLASSIFICATION_BADGES[server.dataClassification ?? "internal"] ?? CLASSIFICATION_BADGES.internal;
            const risk = RISK_BADGES[server.riskLevel ?? "high"] ?? RISK_BADGES.high;
            const TransportIcon = transport.icon;

            const serverTools = discoveredTools[server.id];
            const toolsOpen = toolPanelOpen[server.id] ?? false;

            return (
              <Card
                key={server.id}
                className={cn(
                  !server.enabled && "opacity-60",
                  selectedServerId === server.id && "ring-2 ring-primary",
                )}
              >
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <TransportIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{server.name}</span>
                          <code className="text-xs text-muted-foreground bg-muted px-1 rounded">
                            {server.slug}
                          </code>
                          {!server.enabled && (
                            <Badge variant="secondary" className="text-xs">Disabled</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge className={cn("text-xs", health.color)}>{health.label}</Badge>
                          <Badge className={cn("text-xs", classification.color)}>
                            {classification.label}
                          </Badge>
                          <Badge className={cn("text-xs", risk.color)}>
                            Risk: {server.riskLevel}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{transport.label}</span>
                          {server.oauthConfigured && (
                            <span className="flex items-center gap-1" title="OAuth configured">
                              <Lock className="h-3 w-3 text-green-600" />
                              {/* Feature 4: OAuth badge */}
                              <Badge className="text-xs bg-green-100 text-green-700">OAuth</Badge>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Feature 2: Enable/Disable toggle */}
                      <div className="flex items-center gap-1.5" title={server.enabled ? "Disable server" : "Enable server"}>
                        <Switch
                          checked={server.enabled ?? true}
                          onCheckedChange={() => handleToggleEnabled(server.id, server.enabled ?? true)}
                          disabled={updateMutation.isPending}
                          aria-label={server.enabled ? "Disable server" : "Enable server"}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleTest(server.id)}
                        disabled={testingId === server.id}
                        title="Test connection"
                      >
                        {testingId === server.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                      {/* Feature 3: Assignments button */}
                      <Button
                        variant={selectedServerId === server.id ? "secondary" : "ghost"}
                        size="icon"
                        onClick={() =>
                          setSelectedServerId((prev) => (prev === server.id ? null : server.id))
                        }
                        title="Manage assignments"
                      >
                        <Link2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEdit(server)}
                        title="Edit"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => handleDelete(server.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Confidential data warning */}
                  {server.dataClassification === "confidential" && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Tool calls to this server may transmit confidential data outside your organization.
                    </div>
                  )}

                  {/* Feature 4: OAuth connect button (when oauthConfigured but no active token) */}
                  {server.oauthConfigured && (
                    <div className="mt-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-block">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled
                                className="text-xs h-7 cursor-not-allowed opacity-60"
                              >
                                <Lock className="h-3 w-3 mr-1" />
                                Connect OAuth
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Coming soon — OAuth callback route required
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  )}

                  {/* Feature 1: Discovered tools panel */}
                  {serverTools !== undefined && (
                    <div className="mt-3 border-t pt-2">
                      <button
                        type="button"
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() =>
                          setToolPanelOpen((prev) => ({ ...prev, [server.id]: !toolsOpen }))
                        }
                      >
                        {toolsOpen ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                        <Wrench className="h-3.5 w-3.5" />
                        <span>
                          {serverTools.length} discovered tool{serverTools.length !== 1 ? "s" : ""}
                        </span>
                        {loadingTools === server.id && (
                          <Loader2 className="h-3 w-3 animate-spin ml-1" />
                        )}
                      </button>
                      {toolsOpen && serverTools.length > 0 && (
                        <ul className="mt-2 space-y-1.5 pl-5">
                          {serverTools.map((tool) => (
                            <li key={tool.name} className="text-xs">
                              <span className="font-mono text-foreground">{tool.originalName}</span>
                              {tool.description && (
                                <span className="text-muted-foreground ml-2">{tool.description}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {toolsOpen && serverTools.length === 0 && (
                        <p className="mt-1 pl-5 text-xs text-muted-foreground">No tools discovered.</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Feature 3: Assignment Panel */}
      {selectedServerId !== null && (() => {
        const selectedServer = servers.find((s) => s.id === selectedServerId);
        if (!selectedServer) return null;
        const serverAssignments = assignments[selectedServerId] ?? [];

        return (
          <Card className="mt-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Assignments for <span className="font-semibold">{selectedServer.name}</span>
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedServerId(null)}
                  aria-label="Close assignments panel"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Current assignments */}
              {serverAssignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No assignments yet. Add one below to make this server available to a target.
                </p>
              ) : (
                <ul className="space-y-2">
                  {serverAssignments.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-2"
                    >
                      <span>
                        <Badge variant="outline" className="text-xs mr-2">{a.targetType}</Badge>
                        <span className="font-mono text-xs">{a.targetId}</span>
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
                        disabled={removingAssignmentId === a.id}
                        onClick={() => handleRemoveAssignment(a.id, selectedServerId)}
                        title="Remove assignment"
                      >
                        {removingAssignmentId === a.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <X className="h-3 w-3" />
                        )}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              <Separator />

              {/* Add new assignment form */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Add Assignment
                </p>
                <div className="flex gap-2">
                  <Select
                    value={assignForm.targetType}
                    onValueChange={(v) =>
                      setAssignForm((prev) => ({ ...prev, targetType: v as TargetType }))
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TARGET_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="flex-1"
                    placeholder="Target ID (UUID or slug)"
                    value={assignForm.targetId}
                    maxLength={36}
                    onChange={(e) =>
                      setAssignForm((prev) => ({ ...prev, targetId: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAssign(selectedServerId);
                    }}
                  />
                  <Button
                    size="sm"
                    disabled={!assignForm.targetId.trim() || assigningId === selectedServerId}
                    onClick={() => handleAssign(selectedServerId)}
                  >
                    {assigningId === selectedServerId ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    <span className="ml-1">Assign</span>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter the UUID or identifier of the target tenant, agency, or agent.
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Add/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit" : "Add"} MCP Server</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="My MCP Server"
                  maxLength={100}
                />
              </div>
              <div>
                <Label>Slug</Label>
                <Input
                  value={form.slug}
                  onChange={(e) =>
                    setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })
                  }
                  placeholder="my-mcp-server"
                  maxLength={100}
                  disabled={!!editId}
                />
              </div>
            </div>

            <div>
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description"
                maxLength={500}
              />
            </div>

            <div>
              <Label>Transport Type</Label>
              <Select
                value={form.transportType}
                onValueChange={(v) =>
                  setForm({ ...form, transportType: v as ServerFormData["transportType"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">HTTP</SelectItem>
                  <SelectItem value="streamable_http">Streamable HTTP</SelectItem>
                  <SelectItem value="stdio">stdio (npx)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Transport-specific config */}
            {form.transportType !== "stdio" ? (
              <div>
                <Label>URL</Label>
                <Input
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://mcp-server.example.com/rpc"
                />
              </div>
            ) : (
              <div>
                <Label>npx Arguments</Label>
                <Input
                  value={form.args}
                  onChange={(e) => setForm({ ...form, args: e.target.value })}
                  placeholder="-y @modelcontextprotocol/server-sqlite"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Only <code>npx</code> is allowed as the command (runs in OpenSandbox).
                </p>
              </div>
            )}

            <Separator />

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Risk Level</Label>
                <Select
                  value={form.riskLevel}
                  onValueChange={(v) =>
                    setForm({ ...form, riskLevel: v as ServerFormData["riskLevel"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Classification</Label>
                <Select
                  value={form.dataClassification}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      dataClassification: v as ServerFormData["dataClassification"],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="internal">Internal</SelectItem>
                    <SelectItem value="confidential">Confidential</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Timeout (s)</Label>
                <Input
                  type="number"
                  min={5}
                  max={120}
                  value={form.timeoutSeconds}
                  onChange={(e) =>
                    setForm({ ...form, timeoutSeconds: parseInt(e.target.value) || 30 })
                  }
                />
              </div>
            </div>

            <div>
              <Label>Credit per Call</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={form.creditPerCall}
                onChange={(e) =>
                  setForm({ ...form, creditPerCall: parseFloat(e.target.value) || 1 })
                }
              />
            </div>

            {/* OAuth section */}
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">OAuth (optional)</Label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Client ID</Label>
                  <Input
                    value={form.oauthClientId}
                    onChange={(e) => setForm({ ...form, oauthClientId: e.target.value })}
                    placeholder="Client ID"
                  />
                </div>
                <div>
                  <Label className="text-xs">Client Secret</Label>
                  <Input
                    type="password"
                    value={form.oauthClientSecret}
                    onChange={(e) => setForm({ ...form, oauthClientSecret: e.target.value })}
                    placeholder={editId ? "••••••••" : "Client secret"}
                  />
                </div>
              </div>
              {/* Feature 4: OAuth flow note */}
              <p className="text-xs text-muted-foreground">
                OAuth authorization flow requires the MCP OAuth feature flag to be enabled.
                After saving, use the &quot;Connect&quot; button on the server card to initiate the OAuth flow.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                createMutation.isPending ||
                updateMutation.isPending ||
                !form.name ||
                !form.slug
              }
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              )}
              {editId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
