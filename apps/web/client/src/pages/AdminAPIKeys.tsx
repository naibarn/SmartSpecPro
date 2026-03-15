/**
 * AdminAPIKeys — admin oversight page for API key security.
 *
 * Admins can:
 *   - View ALL tenant API keys and webhook registrations (read-only)
 *   - Suspend / unsuspend any key (security override)
 *   - Force-revoke any key in an emergency
 *   - View the tenant-wide API audit log for anomaly detection
 *
 * Admins CANNOT:
 *   - Create keys on behalf of users
 *   - Edit rate limits or quotas for another user's key
 *   - See raw key values (hashed at creation)
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  ShieldAlert,
  CheckCircle2,
  XCircle,
  PauseCircle,
  PlayCircle,
  AlertTriangle,
  Activity,
  Webhook,
} from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminAPIKeys() {
  const utils = trpc.useUtils();

  const [suspendTarget, setSuspendTarget] = useState<{ id: string; name: string } | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);

  const keysQuery = trpc.apiKeys.adminListAllKeys.useQuery();
  const webhooksQuery = trpc.apiKeys.adminListAllWebhooks.useQuery();
  const auditQuery = trpc.apiKeys.adminGetTenantAuditLog.useQuery({ days: 7 });

  const suspendMutation = trpc.apiKeys.suspend.useMutation({
    onSuccess: () => {
      setSuspendTarget(null);
      setSuspendReason("");
      utils.apiKeys.adminListAllKeys.invalidate();
      toast.success("API key suspended");
    },
    onError: (err) => toast.error(err.message),
  });

  const unsuspendMutation = trpc.apiKeys.unsuspend.useMutation({
    onSuccess: () => {
      utils.apiKeys.adminListAllKeys.invalidate();
      toast.success("API key unsuspended");
    },
    onError: (err) => toast.error(err.message),
  });

  const revokeMutation = trpc.apiKeys.adminRevokeKey.useMutation({
    onSuccess: () => {
      setRevokeTarget(null);
      utils.apiKeys.adminListAllKeys.invalidate();
      toast.success("API key revoked");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-orange-500" /> API Key Oversight
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Security oversight only. Users manage their own keys in Settings → API Keys.
          You may suspend or revoke any key to protect the platform.
        </p>
      </div>

      <Tabs defaultValue="keys">
        <TabsList>
          <TabsTrigger value="keys">All Keys</TabsTrigger>
          <TabsTrigger value="webhooks">All Webhooks</TabsTrigger>
          <TabsTrigger value="audit">Audit Log (7d)</TabsTrigger>
        </TabsList>

        {/* All keys tab */}
        <TabsContent value="keys">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">All Tenant API Keys</CardTitle>
              <CardDescription>Read-only view. Suspend or revoke suspicious keys below.</CardDescription>
            </CardHeader>
            <CardContent>
              {keysQuery.isLoading && <p className="text-sm text-muted-foreground py-4">Loading...</p>}
              {keysQuery.data && keysQuery.data.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">No API keys in this tenant.</p>
              )}
              {keysQuery.data && keysQuery.data.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Scopes</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Used</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {keysQuery.data.map((key) => (
                      <TableRow key={key.id}>
                        <TableCell className="font-medium">{key.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {(key as any).userEmail ?? (key as any).userName ?? `uid:${(key as any).userId ?? "—"}`}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {key.scopes.slice(0, 2).map((scope: string) => (
                              <Badge key={scope} variant="secondary" className="text-xs">{scope}</Badge>
                            ))}
                            {key.scopes.length > 2 && (
                              <Badge variant="outline" className="text-xs">+{key.scopes.length - 2}</Badge>
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
                          {key.lastUsedAt ? new Date(key.lastUsedAt as string).toLocaleDateString() : "Never"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {(key as any).isSuspended ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-green-600"
                                onClick={() => unsuspendMutation.mutate({ keyId: key.id })}
                                disabled={unsuspendMutation.isPending}
                                title="Lift suspension"
                              >
                                <PlayCircle className="h-4 w-4" />
                              </Button>
                            ) : key.isActive ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-orange-600"
                                onClick={() => setSuspendTarget({ id: key.id, name: key.name })}
                                title="Suspend key"
                              >
                                <PauseCircle className="h-4 w-4" />
                              </Button>
                            ) : null}
                            {key.isActive && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => setRevokeTarget({ id: key.id, name: key.name })}
                                title="Force revoke"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}
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
              <CardTitle className="text-base flex items-center gap-2">
                <Webhook className="h-4 w-4" /> All Webhooks
              </CardTitle>
              <CardDescription>Read-only overview of all tenant webhook endpoints.</CardDescription>
            </CardHeader>
            <CardContent>
              {webhooksQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
              {webhooksQuery.data && webhooksQuery.data.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">No webhooks registered.</p>
              )}
              {webhooksQuery.data && webhooksQuery.data.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>URL</TableHead>
                      <TableHead>Events</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Failures</TableHead>
                      <TableHead>API Key</TableHead>
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
                        <TableCell className="text-sm">
                          {wh.failureCount > 0 ? (
                            <span className="text-destructive font-medium">{wh.failureCount}</span>
                          ) : wh.failureCount}
                        </TableCell>
                        <TableCell>
                          <code className="text-xs text-muted-foreground">
                            {wh.apiKeyId ? `${wh.apiKeyId.slice(0, 8)}...` : "—"}
                          </code>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit log tab */}
        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" /> API Audit Log (last 7 days)
              </CardTitle>
              <CardDescription>Last 500 requests across all keys. Use for anomaly detection.</CardDescription>
            </CardHeader>
            <CardContent>
              {auditQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
              {auditQuery.data && auditQuery.data.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">No API activity in the last 7 days.</p>
              )}
              {auditQuery.data && auditQuery.data.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Path</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Credits</TableHead>
                      <TableHead>Latency</TableHead>
                      <TableHead>Key</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditQuery.data.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(row.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs font-mono">{row.method}</Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs">{row.path}</code>
                        </TableCell>
                        <TableCell>
                          <span className={row.statusCode >= 400 ? "text-destructive font-medium" : "text-green-600"}>
                            {row.statusCode}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">{row.creditsUsed ?? 0}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.latencyMs ? `${row.latencyMs}ms` : "—"}
                        </TableCell>
                        <TableCell>
                          <code className="text-xs text-muted-foreground">
                            {row.apiKeyId ? `${row.apiKeyId.slice(0, 8)}...` : "session"}
                          </code>
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

      {/* Suspend confirmation */}
      <Dialog open={!!suspendTarget} onOpenChange={() => { setSuspendTarget(null); setSuspendReason(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-700">
              <PauseCircle className="h-5 w-5" /> Suspend API Key
            </DialogTitle>
            <DialogDescription>
              <strong>{suspendTarget?.name}</strong> will be blocked immediately. The owner will see
              "Suspended" status in their Settings. You can lift the suspension at any time.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="suspend-reason" className="text-xs">Reason (shown to audit log)</Label>
            <Input
              id="suspend-reason"
              placeholder="e.g. Unusual traffic detected"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              maxLength={500}
            />
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

      {/* Force revoke confirmation */}
      <AlertDialog open={!!revokeTarget} onOpenChange={() => setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Force Revoke Key?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{revokeTarget?.name}</strong> will be permanently deactivated.
              The owner will not be able to recover it. Use only in a security emergency.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => revokeTarget && revokeMutation.mutate({ keyId: revokeTarget.id })}
            >
              Revoke Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
