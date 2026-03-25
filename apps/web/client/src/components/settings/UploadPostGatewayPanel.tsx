import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, Loader2, RefreshCw, ShieldAlert, ShieldCheck, Sparkles, Trash2, Link2 } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { UPLOAD_POST_PLATFORMS, UPLOAD_POST_POLICY_VERSION, type UploadPostConnectionDetail, type UploadPostPlatform, type UploadPostQueueSettings } from "@shared/uploadPost";

function formatDateTime(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString();
}

function toBool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

interface UploadPostGatewayPanelProps {
  tenantId: string | null;
}

export function UploadPostGatewayPanel({ tenantId }: UploadPostGatewayPanelProps) {
  const utils = trpc.useUtils();
  const [apiKey, setApiKey] = useState("");
  const [disclosureAccepted, setDisclosureAccepted] = useState(false);
  const [platform, setPlatform] = useState<UploadPostPlatform>("facebook");
  const [platformPageId, setPlatformPageId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [jwtResult, setJwtResult] = useState<{ jwt: string; nonce: string; callbackUrl: string } | null>(null);
  const [queueSettings, setQueueSettings] = useState<UploadPostQueueSettings>({
    enabled: true,
    maxPendingJobs: 25,
    publishWindowMinutes: 30,
    retryWindowMinutes: 15,
  });

  const featureFlagsQuery = trpc.tenantFeatureFlags.getFeatureFlags.useQuery(
    tenantId ? { tenantId } : undefined,
    { enabled: Boolean(tenantId) },
  );
  const gatewayEnabled = featureFlagsQuery.data?.UPLOAD_POST_GATEWAY_ENABLED ?? false;

  const connectionQuery = trpc.uploadPost.getConnection.useQuery(undefined, {
    enabled: Boolean(tenantId && gatewayEnabled),
    retry: false,
  });

  const connectMutation = trpc.uploadPost.connect.useMutation({
    onSuccess: async () => {
      toast.success("Upload-Post connected");
      setApiKey("");
      setDisclosureAccepted(false);
      await utils.uploadPost.getConnection.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const refreshMutation = trpc.uploadPost.refreshConnection.useMutation({
    onSuccess: async () => {
      toast.success("Connection refreshed");
      await utils.uploadPost.getConnection.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const disconnectMutation = trpc.uploadPost.disconnect.useMutation({
    onSuccess: async () => {
      toast.success("Upload-Post disconnected");
      await utils.uploadPost.getConnection.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const generateJwtMutation = trpc.uploadPost.generateJwt.useMutation({
    onSuccess: async (result) => {
      setJwtResult(result);
      toast.success("Popup handshake prepared");
      await navigator.clipboard.writeText(result.jwt);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateQueueSettingsMutation = trpc.uploadPost.updateQueueSettings.useMutation({
    onSuccess: async () => {
      toast.success("Queue settings saved");
      await utils.uploadPost.getConnection.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const createProfileMutation = trpc.uploadPost.createProfile.useMutation({
    onSuccess: async () => {
      toast.success("Upload-Post profile created");
      setPlatformPageId("");
      setDisplayName("");
      await utils.uploadPost.getConnection.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteProfileMutation = trpc.uploadPost.deleteProfile.useMutation({
    onSuccess: async () => {
      toast.success("Upload-Post profile removed");
      await utils.uploadPost.getConnection.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const connection: UploadPostConnectionDetail | null = connectionQuery.data ?? null;

  useEffect(() => {
    if (!connection) return;
    setQueueSettings(connection.queueSettings);
  }, [connection?.queueSettings, connection]);

  const statusTone = connection?.status === "active"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : connection?.status === "disconnected"
      ? "border-slate-200 bg-slate-100 text-slate-600"
      : "border-amber-200 bg-amber-50 text-amber-700";

  const sharedKeyWarning = Boolean(connection?.sharedKeyWarning);
  const profileCount = connection?.profiles.length ?? 0;
  const jobCount = connection?.jobs.length ?? 0;

  const canCreateProfile = Boolean(connection && connection.consent.accepted);
  const queueSettingsDirty = useMemo(() => {
    if (!connection) return false;
    return (
      connection.queueSettings.enabled !== queueSettings.enabled ||
      connection.queueSettings.maxPendingJobs !== queueSettings.maxPendingJobs ||
      connection.queueSettings.publishWindowMinutes !== queueSettings.publishWindowMinutes ||
      connection.queueSettings.retryWindowMinutes !== queueSettings.retryWindowMinutes
    );
  }, [connection, queueSettings]);

  if (!tenantId) {
    return null;
  }
  if (featureFlagsQuery.isLoading) {
    return <div className="rounded-2xl border border-gray-200 bg-white/70 p-4 text-sm text-gray-500">Loading Upload-Post availability...</div>;
  }
  if (!gatewayEnabled) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-emerald-950">Upload-Post Gateway</h2>
              <Badge className={statusTone}>{connection?.status ?? "not connected"}</Badge>
              {sharedKeyWarning && (
                <Badge className="border-amber-200 bg-amber-100 text-amber-800">Shared key warning</Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-emerald-900">
              Universal gateway for cross-platform posting. Disclosure version {UPLOAD_POST_POLICY_VERSION}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {connection ? (
              <>
                <Button variant="outline" size="sm" onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
                  {refreshMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Refresh
                </Button>
                <Button variant="outline" size="sm" onClick={() => generateJwtMutation.mutate()} disabled={generateJwtMutation.isPending}>
                  {generateJwtMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Generate JWT
                </Button>
                <Button variant="destructive" size="sm" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}>
                  {disconnectMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                  Disconnect
                </Button>
              </>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-white/90 p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Connection</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{connection ? "Connected" : "Not connected"}</div>
            <div className="mt-1 text-sm text-slate-600">API key is stored encrypted at rest.</div>
          </div>
          <div className="rounded-xl bg-white/90 p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Consent</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {connection?.consent.accepted ? "Accepted" : "Pending"}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              {connection?.consent.acceptedAt ? `Accepted ${formatDateTime(connection.consent.acceptedAt)}` : "Requires first-use disclosure acknowledgement"}
            </div>
          </div>
          <div className="rounded-xl bg-white/90 p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Profiles / Jobs</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{profileCount} profiles</div>
            <div className="mt-1 text-sm text-slate-600">{jobCount} jobs in queue/history</div>
          </div>
        </div>

        {connection && connection.quota.limit !== null && (
          <div className="mt-4 rounded-xl border border-white/70 bg-white/90 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">Quota</span>
              <span className="text-slate-500">
                {connection.quota.remaining ?? "?"} / {connection.quota.limit ?? "?"}
              </span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-slate-200">
              <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.max(8, Math.min(100, connection.quota.limit ? ((connection.quota.limit - (connection.quota.remaining ?? 0)) / connection.quota.limit) * 100 : 8))}%` }} />
            </div>
            <div className="mt-2 text-xs text-slate-500">Resets at {formatDateTime(connection.quota.resetAt)}</div>
          </div>
        )}
      </div>

      {!connection ? (
        <Card className="border-dashed border-emerald-300 bg-white/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-emerald-600" />
              Connect Upload-Post
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-amber-200 bg-amber-50">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Disclosure required</AlertTitle>
              <AlertDescription>
                Upload-Post is a separate publishing gateway. Please confirm the disclosure before saving a key.
              </AlertDescription>
            </Alert>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="upload-post-api-key">Upload-Post API Key</Label>
                <Input
                  id="upload-post-api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="up_..."
                />
              </div>
              <div className="flex items-center gap-2 md:col-span-2">
                <Checkbox
                  id="upload-post-disclosure"
                  checked={disclosureAccepted}
                  onCheckedChange={(checked) => setDisclosureAccepted(checked === true)}
                />
                <Label htmlFor="upload-post-disclosure" className="text-sm text-slate-700">
                  I acknowledge the Upload-Post disclosure and consent policy.
                </Label>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => connectMutation.mutate({
                  apiKey,
                  disclosureAccepted: true,
                  disclosurePolicyVersion: UPLOAD_POST_POLICY_VERSION,
                })}
                disabled={connectMutation.isPending || !apiKey.trim() || !disclosureAccepted}
              >
                {connectMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                Connect
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="bg-white/90">
            <CardHeader>
              <CardTitle>Queue settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={queueSettings.enabled}
                  onCheckedChange={(checked) => setQueueSettings((prev) => ({ ...prev, enabled: checked === true }))}
                />
                <Label>Enable Upload-Post queueing</Label>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Max pending jobs</Label>
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    value={queueSettings.maxPendingJobs}
                    onChange={(e) => setQueueSettings((prev) => ({ ...prev, maxPendingJobs: Number(e.target.value) || 1 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Publish window (min)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={240}
                    value={queueSettings.publishWindowMinutes}
                    onChange={(e) => setQueueSettings((prev) => ({ ...prev, publishWindowMinutes: Number(e.target.value) || 1 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Retry window (min)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={240}
                    value={queueSettings.retryWindowMinutes}
                    onChange={(e) => setQueueSettings((prev) => ({ ...prev, retryWindowMinutes: Number(e.target.value) || 1 }))}
                  />
                </div>
              </div>
              <Button
                onClick={() => updateQueueSettingsMutation.mutate(queueSettings)}
                disabled={updateQueueSettingsMutation.isPending || !queueSettingsDirty}
              >
                {updateQueueSettingsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save queue settings
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-white/90">
            <CardHeader>
              <CardTitle>Create profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Platform</Label>
                <select
                  value={platform}
                  onChange={(event) => setPlatform(event.target.value as UploadPostPlatform)}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                >
                  {UPLOAD_POST_PLATFORMS.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Platform page/account id</Label>
                <Input value={platformPageId} onChange={(e) => setPlatformPageId(e.target.value)} placeholder="page_123" />
              </div>
              <div className="space-y-2">
                <Label>Display name</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Main channel" />
              </div>
              <Button
                onClick={() => createProfileMutation.mutate({
                  platform,
                  platformPageId,
                  displayName: displayName || null,
                })}
                disabled={createProfileMutation.isPending || !canCreateProfile || !platformPageId.trim()}
              >
                {createProfileMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create profile
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-white/90 xl:col-span-2">
            <CardHeader>
              <CardTitle>Profiles</CardTitle>
            </CardHeader>
            <CardContent>
              {connection.profiles.length === 0 ? (
                <p className="text-sm text-slate-500">No Upload-Post profiles yet.</p>
              ) : (
                <div className="space-y-3">
                  {connection.profiles.map((profile) => (
                    <div key={profile.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">{profile.displayName || profile.platformPageId}</span>
                          <Badge variant="outline">{profile.platform}</Badge>
                          <Badge variant="outline">{profile.status}</Badge>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {profile.platformPageId} · updated {formatDateTime(profile.updatedAt)}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteProfileMutation.mutate({ profileId: profile.id })}
                        disabled={deleteProfileMutation.isPending}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-white/90 xl:col-span-2">
            <CardHeader>
              <CardTitle>Recent jobs</CardTitle>
            </CardHeader>
            <CardContent>
              {connection.jobs.length === 0 ? (
                <p className="text-sm text-slate-500">No Upload-Post jobs yet.</p>
              ) : (
                <div className="space-y-3">
                  {connection.jobs.slice(0, 5).map((job) => (
                    <div key={job.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium text-slate-900">{job.contentText || job.contentLink || "Untitled post"}</div>
                        <Badge variant="outline">{job.status}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {job.platform} · scheduled {formatDateTime(job.scheduledAt)} · published {formatDateTime(job.publishedAt)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {jwtResult && (
            <Card className="bg-white/90 xl:col-span-2">
              <CardHeader>
                <CardTitle>Popup handshake</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  Callback URL: <span className="font-mono text-xs">{jwtResult.callbackUrl}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigator.clipboard.writeText(jwtResult.jwt).then(() => toast.success("JWT copied"))}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy JWT
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => window.open(jwtResult.callbackUrl, "_blank", "width=640,height=720")}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open callback popup
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

export default UploadPostGatewayPanel;
