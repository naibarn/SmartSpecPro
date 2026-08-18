import { useEffect, useState } from "react";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { useConfirm } from "@/components/ui/confirm/ConfirmProvider";
import { DashboardCard } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  buildHermesMcpInstallUrl,
  buildMcpClientOnboardingDescriptor,
} from "@/lib/mcpClientOnboarding";
import { toast } from "sonner";
import {
  CheckCircle2,
  Code2,
  Clock3,
  Copy,
  ExternalLink,
  Bot,
  Laptop,
  Loader2,
  MonitorCog,
  Plug,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  TriangleAlert,
  Trash2,
} from "lucide-react";

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function getMcpEndpoint(): string {
  return `${window.location.origin}/v1/mcp`;
}

function getMcpGuideUrl(): string {
  return `${window.location.origin}/v1/docs`;
}

function getHermesMcpInstallUrl(): string {
  return buildHermesMcpInstallUrl(getMcpEndpoint());
}

function getHermesCliSetup(): string {
  return [
    ...buildMcpClientOnboardingDescriptor("hermes-cli", getMcpEndpoint())
      .instructions,
    "hermes mcp list",
  ].join("\n");
}

type OAuthReadiness = "checking" | "ready" | "unavailable";

async function checkMcpOAuthReadiness(): Promise<boolean> {
  try {
    const [protectedResource, authorizationServer] = await Promise.all([
      fetch(`${window.location.origin}/.well-known/oauth-protected-resource`, {
        credentials: "omit",
        cache: "no-store",
        headers: { accept: "application/json" },
      }),
      fetch(
        `${window.location.origin}/.well-known/oauth-authorization-server`,
        {
          credentials: "omit",
          cache: "no-store",
          headers: { accept: "application/json" },
        }
      ),
    ]);
    return protectedResource.ok && authorizationServer.ok;
  } catch {
    return false;
  }
}

function statusClass(status: string): string {
  if (status === "active")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "revoked") return "border-red-200 bg-red-50 text-red-700";
  if (status === "expired")
    return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

type Translation = (
  key: string,
  options?: string | Record<string, string | number>
) => string;

function scopeLabel(t: Translation, scope: string): string {
  const key = `connectedDevices.scope.${scope.replace(/[^a-zA-Z0-9]+/g, "_")}`;
  const label = t(key);
  return label === key ? scope : label;
}

function scopeDescription(t: Translation, scope: string): string {
  const key = `connectedDevices.scopeDescription.${scope.replace(/[^a-zA-Z0-9]+/g, "_")}`;
  const label = t(key);
  return label === key ? t("connectedDevices.scopeDescriptionFallback") : label;
}

function authKindLabel(t: Translation, authKind: string): string {
  const key = `connectedDevices.authKind.${authKind}`;
  const label = t(key);
  return label === key ? authKind : label;
}

export function ConnectedDevicesPanel() {
  const { t } = useScopedTranslation("settings");
  const { confirm } = useConfirm();
  const utils = trpc.useUtils();
  const [oauthReadiness, setOauthReadiness] =
    useState<OAuthReadiness>("checking");
  const devicesQuery = trpc.connectedDevices.list.useQuery(undefined, {
    staleTime: 15_000,
    retry: false,
  });
  const revokeMutation = trpc.connectedDevices.revoke.useMutation({
    onSuccess: async () => {
      toast.success(t("connectedDevices.revokeSuccess"));
      await utils.connectedDevices.list.invalidate();
    },
    onError: error =>
      toast.error(error.message || t("connectedDevices.revokeFailed")),
  });
  const revokeAllMutation = trpc.connectedDevices.revokeAllMcp.useMutation({
    onSuccess: async ({ result }) => {
      toast.success(
        t("connectedDevices.revokeAllSuccess", {
          count: result.revokedDeviceCount,
        })
      );
      await utils.connectedDevices.list.invalidate();
    },
    onError: error =>
      toast.error(error.message || t("connectedDevices.revokeAllFailed")),
  });

  const devices = devicesQuery.data?.devices ?? [];
  const remoteMcpConnected = devices.some(
    device =>
      ["mcp_agent_pairing", "mcp_oauth"].includes(device.authKind) &&
      device.status === "active"
  );
  const activeMcpConnectionCount = devices.filter(
    device =>
      ["mcp_agent_pairing", "mcp_oauth"].includes(device.authKind) &&
      device.status !== "revoked"
  ).length;

  async function refreshOAuthReadiness() {
    setOauthReadiness("checking");
    setOauthReadiness(
      (await checkMcpOAuthReadiness()) ? "ready" : "unavailable"
    );
  }

  useEffect(() => {
    void refreshOAuthReadiness();
  }, []);

  async function revokeDevice(device: (typeof devices)[number]) {
    const approved = await confirm({
      title: t("connectedDevices.revokeTitle"),
      description: t("connectedDevices.revokeDescription", {
        name: device.displayName,
      }),
      confirmText: t("connectedDevices.revokeConfirm"),
      cancelText: t("connectedDevices.cancel"),
      tone: "danger",
    });
    if (!approved) return;
    revokeMutation.mutate({
      deviceId: device.deviceId,
      reason: "user_revoked_from_settings",
    });
  }

  async function copyText(
    value: string,
    successKey: string,
    failureKey: string
  ) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t(successKey));
    } catch {
      toast.error(t(failureKey));
    }
  }

  async function copyEndpoint() {
    await copyText(
      getMcpEndpoint(),
      "connectedDevices.endpointCopied",
      "connectedDevices.endpointCopyFailed"
    );
  }

  async function copyHermesCliSetup() {
    await copyText(
      getHermesCliSetup(),
      "connectedDevices.cliSetupCopied",
      "connectedDevices.cliSetupCopyFailed"
    );
  }

  async function revokeAllMcpConnections() {
    const approved = await confirm({
      title: t("connectedDevices.revokeAllTitle"),
      description: t("connectedDevices.revokeAllDescription"),
      confirmText: t("connectedDevices.revokeAllConfirm"),
      cancelText: t("connectedDevices.cancel"),
      tone: "danger",
    });
    if (!approved) return;
    revokeAllMutation.mutate({ reason: "user_revoked_all_mcp_connections" });
  }

  return (
    <div className="space-y-6">
      <DashboardCard
        title={t("connectedDevices.title")}
        description={t("connectedDevices.description")}
        leading={<ShieldCheck className="h-5 w-5 text-sky-500" />}
        trailing={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void refreshOAuthReadiness();
              void devicesQuery.refetch();
            }}
            disabled={devicesQuery.isFetching}
          >
            <RefreshCw
              className={
                devicesQuery.isFetching
                  ? "mr-2 h-4 w-4 animate-spin"
                  : "mr-2 h-4 w-4"
              }
            />
            {t("connectedDevices.refresh")}
          </Button>
        }
      >
        <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Plug className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-medium text-slate-950">
                    {t("connectedDevices.remoteMcpTitle")}
                  </div>
                  <Badge
                    variant="outline"
                    className="border-sky-200 bg-white text-sky-700"
                  >
                    {t("connectedDevices.canonical")}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      oauthReadiness === "ready"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-amber-200 bg-amber-50 text-amber-800"
                    }
                  >
                    {oauthReadiness === "ready"
                      ? t("connectedDevices.oauthAutomatic")
                      : t("connectedDevices.oauthReadinessUnavailable")}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      remoteMcpConnected
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 text-slate-600"
                    }
                  >
                    {remoteMcpConnected
                      ? t("connectedDevices.remoteMcpConnected")
                      : t("connectedDevices.remoteMcpNotConnected")}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {t("connectedDevices.remoteMcpDescription")}
                </p>
                <code className="mt-2 block break-all text-xs text-slate-700">
                  {getMcpEndpoint()}
                </code>
                <p className="mt-2 text-xs text-slate-500">
                  {t("connectedDevices.legacyFallbackDescription")}
                </p>
                {oauthReadiness !== "ready" && (
                  <p
                    className="mt-2 text-xs leading-5 text-amber-800"
                    role="status"
                  >
                    {oauthReadiness === "checking"
                      ? t("connectedDevices.oauthReadinessChecking")
                      : t(
                          "connectedDevices.oauthReadinessUnavailableDescription"
                        )}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copyEndpoint}
              >
                <Copy className="mr-2 h-4 w-4" />
                {t("connectedDevices.copyEndpoint")}
              </Button>
              <Button asChild type="button" variant="ghost" size="sm">
                <a href={getMcpGuideUrl()} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {t("connectedDevices.openGuide")}
                </a>
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-4">
          <div className="flex items-start gap-3">
            <MonitorCog className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-slate-950">
                {t("connectedDevices.remotionExecutorTitle")}
              </div>
              <p className="mt-1 text-sm text-slate-700">
                {t("connectedDevices.remotionExecutorDescription")}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {[
                  "smartaihub-remotion-executor doctor",
                  "smartaihub-remotion-executor setup",
                  "smartaihub-remotion-executor start",
                ].map(command => (
                  <code
                    key={command}
                    className="block rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-slate-800"
                  >
                    {command}
                  </code>
                ))}
              </div>
              <p className="mt-2 text-xs leading-5 text-amber-900">
                {t("connectedDevices.remotionExecutorSecurity")}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4">
          <div className="flex items-start gap-3">
            <Bot className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-slate-950">
                {t("connectedDevices.quickStartTitle")}
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {t("connectedDevices.quickStartDescription")}
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {(
                  [
                    {
                      key: "hermesOne",
                      anchor: "hermes-one",
                      icon: MonitorCog,
                    },
                    {
                      key: "hermesCli",
                      anchor: "hermes-cli",
                      icon: MonitorCog,
                    },
                    { key: "claude", anchor: "claude", icon: Bot },
                    { key: "codex", anchor: "codex", icon: Code2 },
                  ] as const
                ).map(({ key, anchor, icon: Icon }) => (
                  <div
                    key={key}
                    className="rounded-xl border border-white/90 bg-white/80 p-3"
                  >
                    <div className="flex items-center gap-2 font-medium text-slate-950">
                      <Icon className="h-4 w-4 text-violet-600" />
                      {t(`connectedDevices.clients.${key}.title`)}
                    </div>
                    <ol className="mt-2 space-y-1.5 text-xs leading-5 text-slate-600">
                      {[1, 2, 3].map(step => (
                        <li key={step}>
                          <span className="mr-1 font-semibold text-violet-700">
                            {step}.
                          </span>
                          {t(`connectedDevices.clients.${key}.step${step}`)}
                        </li>
                      ))}
                    </ol>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {key === "hermesOne" ? (
                        <Button
                          asChild
                          type="button"
                          size="sm"
                          className="bg-violet-700 hover:bg-violet-800"
                        >
                          <a
                            href={
                              oauthReadiness === "ready"
                                ? getHermesMcpInstallUrl()
                                : undefined
                            }
                            data-testid="connect-hermes-mcp"
                            aria-label={t(
                              "connectedDevices.clients.hermesOne.connect"
                            )}
                            aria-disabled={oauthReadiness !== "ready"}
                            onClick={event => {
                              if (oauthReadiness !== "ready")
                                event.preventDefault();
                            }}
                          >
                            <MonitorCog className="mr-2 h-3.5 w-3.5" />
                            {t("connectedDevices.clients.hermesOne.connect")}
                          </a>
                        </Button>
                      ) : key === "hermesCli" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={copyHermesCliSetup}
                          aria-label={t(
                            "connectedDevices.clients.hermesCli.copyCommand"
                          )}
                        >
                          <Copy className="mr-2 h-3.5 w-3.5" />
                          {t("connectedDevices.clients.hermesCli.copyCommand")}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={copyEndpoint}
                          aria-label={t(
                            `connectedDevices.clients.${key}.copyEndpoint`
                          )}
                        >
                          <Copy className="mr-2 h-3.5 w-3.5" />
                          {t(`connectedDevices.clients.${key}.copyEndpoint`)}
                        </Button>
                      )}
                      {key === "claude" && (
                        <Button asChild type="button" size="sm" variant="ghost">
                          <a
                            href="https://claude.ai"
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink className="mr-2 h-3.5 w-3.5" />
                            {t("connectedDevices.clients.claude.open")}
                          </a>
                        </Button>
                      )}
                      <a
                        className="inline-flex items-center text-xs font-medium text-violet-700 hover:underline"
                        href={`${getMcpGuideUrl()}#${anchor}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t("connectedDevices.openGuide")}
                        <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                <div className="font-semibold">
                  {t("connectedDevices.fallbackTitle")}
                </div>
                <div className="mt-1">
                  {t("connectedDevices.fallbackDescription")}
                </div>
              </div>
              <div className="mt-3 rounded-xl border border-slate-200 bg-white/80 p-4">
                <div className="flex items-start gap-3">
                  <Plug className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-950">
                      {t("connectedDevices.otherClients.title")}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      {t("connectedDevices.otherClients.description")}
                    </p>
                    <code className="mt-2 block break-all rounded-lg bg-slate-950 px-3 py-2 text-xs text-slate-100">
                      {getMcpEndpoint()}
                    </code>
                    <ol className="mt-2 space-y-1 text-xs leading-5 text-slate-600">
                      {[1, 2, 3].map(step => (
                        <li key={step}>
                          <span className="mr-1 font-semibold text-slate-700">
                            {step}.
                          </span>
                          {t(`connectedDevices.otherClients.step${step}`)}
                        </li>
                      ))}
                    </ol>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={copyEndpoint}
                      >
                        <Copy className="mr-2 h-3.5 w-3.5" />
                        {t("connectedDevices.copyEndpoint")}
                      </Button>
                      <a
                        className="inline-flex items-center text-xs font-medium text-slate-700 hover:underline"
                        href={`${getMcpGuideUrl()}#other`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t("connectedDevices.openGuide")}
                        <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-950">
              {t("connectedDevices.deviceListTitle", { count: devices.length })}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {t("connectedDevices.deviceListDescription")}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge
              variant="outline"
              className="border-slate-200 text-slate-600"
            >
              <ShieldOff className="mr-1 h-3.5 w-3.5" />
              {t("connectedDevices.ownerOnly")}
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-red-200 text-red-700 hover:bg-red-50"
              onClick={revokeAllMcpConnections}
              disabled={
                revokeAllMutation.isPending || activeMcpConnectionCount === 0
              }
              title={
                activeMcpConnectionCount === 0
                  ? t("connectedDevices.revokeAllDisabled")
                  : undefined
              }
            >
              {revokeAllMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {t("connectedDevices.revokeAll")}
            </Button>
          </div>
        </div>

        {devicesQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("connectedDevices.loading")}
          </div>
        ) : devicesQuery.isError ? (
          <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
            {t("connectedDevices.loadFailed")}
          </div>
        ) : devices.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
            <Laptop className="mx-auto mb-2 h-7 w-7 opacity-40" />
            {t("connectedDevices.empty")}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {devices.map(device => (
              <div
                key={device.deviceId}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex items-start gap-3">
                    <MonitorCog className="mt-1 h-5 w-5 shrink-0 text-slate-500" />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold text-slate-950">
                          {device.clientName ?? device.displayName}
                        </div>
                        <Badge
                          variant="outline"
                          className={statusClass(device.status)}
                        >
                          {t(`connectedDevices.status.${device.status}`)}
                        </Badge>
                        <Badge variant="secondary">
                          {authKindLabel(t, device.authKind)}
                        </Badge>
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        {device.runtimeType} · {device.connectionMethod} ·{" "}
                        {device.platform ?? "-"}/{device.architecture ?? "-"}
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {device.clientOrigin ? (
                          <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-2.5">
                            <div className="flex items-center gap-1 text-xs font-semibold text-emerald-800">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              {t("connectedDevices.clientOriginVerified")}
                            </div>
                            <div className="mt-1 break-all font-mono text-xs text-emerald-950">
                              {t("connectedDevices.clientOrigin")}:{" "}
                              <span className="font-medium text-slate-700">
                                {device.clientOrigin}
                              </span>
                            </div>
                            <div className="mt-1 text-[11px] leading-4 text-emerald-800">
                              {t(
                                "connectedDevices.clientOriginVerifiedDescription"
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">
                            <div className="font-semibold">
                              {t("connectedDevices.clientOriginUnavailable")}
                            </div>
                            <div className="mt-1 leading-4">
                              {t(
                                "connectedDevices.clientOriginUnavailableDescription"
                              )}
                            </div>
                          </div>
                        )}
                        {device.clientId && (
                          <div>
                            {t("connectedDevices.clientId")}:{" "}
                            <span className="font-mono">{device.clientId}</span>
                          </div>
                        )}
                        <div className="rounded-lg border border-sky-100 bg-sky-50/70 p-2.5">
                          <div className="text-xs font-semibold text-sky-800">
                            {t("connectedDevices.tenantContext")}
                          </div>
                          <div className="mt-1 font-medium text-sky-950">
                            {device.tenantName ??
                              t("connectedDevices.tenantNameUnavailable")}
                          </div>
                          <div className="mt-1 break-all font-mono text-[11px] text-sky-800">
                            {device.tenantId ?? "-"}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                        <Badge variant="secondary">
                          {t("connectedDevices.fingerprint")}{" "}
                          {device.deviceFingerprint ?? "-"}
                        </Badge>
                        <Badge variant="secondary">
                          {t("connectedDevices.scopes", {
                            count: device.scopes.length,
                          })}
                        </Badge>
                        {device.workerId ? (
                          <Badge variant="secondary">
                            {t("connectedDevices.workerLinked")}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                          {t("connectedDevices.permissionsTitle")} ·{" "}
                          {t("connectedDevices.scopes", {
                            count: device.scopes.length,
                          })}
                        </div>
                        <div className="mt-2 space-y-2">
                          {device.scopes.length > 0 ? (
                            device.scopes.map(scope => (
                              <div
                                key={scope}
                                className="flex items-start gap-2 text-xs"
                              >
                                <Badge
                                  variant="outline"
                                  className="shrink-0 border-sky-100 bg-sky-50 text-sky-800"
                                >
                                  {scopeLabel(t, scope)}
                                </Badge>
                                <span className="leading-5 text-slate-600">
                                  {scopeDescription(t, scope)}
                                </span>
                              </div>
                            ))
                          ) : (
                            <span className="text-xs text-slate-500">
                              {t("connectedDevices.noScopes")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  {device.status !== "revoked" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-red-200 text-red-700 hover:bg-red-50"
                      onClick={() => revokeDevice(device)}
                      disabled={
                        revokeMutation.isPending &&
                        revokeMutation.variables?.deviceId === device.deviceId
                      }
                    >
                      {revokeMutation.isPending &&
                      revokeMutation.variables?.deviceId === device.deviceId ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                      )}
                      {t("connectedDevices.revoke")}
                    </Button>
                  )}
                </div>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">
                      {t("connectedDevices.approvedAt")}
                    </div>
                    <div className="mt-1 font-medium text-slate-800">
                      {formatDate(device.approvedAt)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">
                      {t("connectedDevices.lastSeenAt")}
                    </div>
                    <div className="mt-1 font-medium text-slate-800">
                      {formatDate(device.lastSeenAt)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">
                      {t("connectedDevices.accessExpiry")}
                    </div>
                    <div className="mt-1 flex items-center gap-1 font-medium text-slate-800">
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatDate(device.accessTokenExpiresAt)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">
                      {t("connectedDevices.refreshExpiry")}
                    </div>
                    <div className="mt-1 flex items-center gap-1 font-medium text-slate-800">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {formatDate(device.refreshTokenExpiresAt)}
                    </div>
                  </div>
                </div>
                {device.revokedAt && (
                  <div className="mt-3 flex items-center gap-1 text-xs text-red-700">
                    <TriangleAlert className="h-3.5 w-3.5" />
                    {t("connectedDevices.revokedAt", {
                      date: formatDate(device.revokedAt),
                      reason: device.revocationReason ?? "-",
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DashboardCard>
    </div>
  );
}
