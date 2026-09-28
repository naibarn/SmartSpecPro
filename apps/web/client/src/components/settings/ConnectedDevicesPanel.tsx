import { useEffect, useState } from "react";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { useConfirm } from "@/components/ui/confirm/ConfirmProvider";
import { DashboardCard } from "@/components/dashboard";
import { McpClientHelpDialog } from "./McpClientHelpDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  RotateCcw,
  Save,
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

type OAuthProbe = {
  key: "protectedResource" | "authorizationServer" | "jwks";
  url: string;
  ok: boolean;
  statusCode: number | null;
};

const REMOTION_RUNTIME_IDS = [
  "remotion-executor-windows-x64",
  "remotion-executor-macos-arm64",
  "remotion-executor-macos-x64",
] as const;

type RuntimePackStatus = {
  runtimeId: (typeof REMOTION_RUNTIME_IDS)[number];
  available: boolean;
  version: string | null;
  archiveUrl: string | null;
  statusCode: number | null;
};

async function checkMcpOAuthReadiness(): Promise<OAuthProbe[]> {
  const endpoints: OAuthProbe[] = [
    {
      key: "protectedResource",
      url: `${window.location.origin}/.well-known/oauth-protected-resource`,
      ok: false,
      statusCode: null,
    },
    {
      key: "authorizationServer",
      url: `${window.location.origin}/.well-known/oauth-authorization-server`,
      ok: false,
      statusCode: null,
    },
    {
      key: "jwks",
      url: `${window.location.origin}/.well-known/jwks.json`,
      ok: false,
      statusCode: null,
    },
  ];
  return Promise.all(
    endpoints.map(async endpoint => {
      try {
        const response = await fetch(endpoint.url, {
          credentials: "omit",
          cache: "no-store",
          headers: { accept: "application/json" },
        });
        return { ...endpoint, ok: response.ok, statusCode: response.status };
      } catch {
        return endpoint;
      }
    })
  );
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
  const [oauthProbes, setOauthProbes] = useState<OAuthProbe[]>([]);
  const [runtimePacks, setRuntimePacks] = useState<RuntimePackStatus[]>([]);
  const [scopeEdits, setScopeEdits] = useState<Record<string, string[]>>({});
  const devicesQuery = trpc.connectedDevices.list.useQuery(undefined, {
    staleTime: 15_000,
    retry: false,
  });
  const featureFlagsQuery = trpc.tenantFeatureFlags.getFeatureFlags.useQuery(
    undefined,
    { staleTime: 15_000, retry: false }
  );
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
  const updatePermissionsMutation =
    trpc.connectedDevices.updatePermissions.useMutation({
      onSuccess: async ({ device }) => {
        setScopeEdits(previous => {
          const next = { ...previous };
          delete next[device.deviceId];
          return next;
        });
        toast.success(t("connectedDevices.permissionsSaveSuccess"));
        await utils.connectedDevices.list.invalidate();
      },
      onError: error =>
        toast.error(
          error.message || t("connectedDevices.permissionsSaveFailed")
        ),
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
  const workerDevices = devices.filter(
    device => device.authKind === "worker_executor",
  );
  const authorizedWorkerDevices = workerDevices.filter(
    device => device.status !== "revoked",
  );
  const activeWorkerDeviceCount = workerDevices.filter(
    device => device.status === "active",
  ).length;
  const workerIdentityCount = new Set(
    authorizedWorkerDevices
      .map(device => device.workerId)
      .filter((workerId): workerId is string => Boolean(workerId)),
  ).size;
  const featureFlags = featureFlagsQuery.data;

  async function refreshOAuthReadiness() {
    setOauthReadiness("checking");
    const probes = await checkMcpOAuthReadiness();
    setOauthProbes(probes);
    setOauthReadiness(
      probes.length > 0 && probes.every(probe => probe.ok)
        ? "ready"
        : "unavailable"
    );
  }

  async function refreshRuntimePacks() {
    const results = await Promise.all(
      REMOTION_RUNTIME_IDS.map(async runtimeId => {
        try {
          const response = await fetch(
            `${window.location.origin}/api/workers/runtime-pack/manifest?runtimeId=${runtimeId}`,
            {
              credentials: "omit",
              cache: "no-store",
              headers: { accept: "application/json" },
            }
          );
          if (!response.ok)
            return {
              runtimeId,
              available: false,
              version: null,
              archiveUrl: null,
              statusCode: response.status,
            };
          const manifest = (await response.json()) as Record<string, unknown>;
          return {
            runtimeId,
            available:
              manifest.allowed === true &&
              typeof manifest.archiveUrl === "string",
            version:
              typeof manifest.version === "string" ? manifest.version : null,
            archiveUrl:
              typeof manifest.archiveUrl === "string"
                ? manifest.archiveUrl
                : null,
            statusCode: response.status,
          };
        } catch {
          return {
            runtimeId,
            available: false,
            version: null,
            archiveUrl: null,
            statusCode: null,
          };
        }
      })
    );
    setRuntimePacks(results);
  }

  useEffect(() => {
    void refreshOAuthReadiness();
    void refreshRuntimePacks();
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
          <div className="flex flex-wrap items-center gap-2">
            <McpClientHelpDialog
              endpoint={getMcpEndpoint()}
              guideUrl={getMcpGuideUrl()}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void refreshOAuthReadiness();
                void refreshRuntimePacks();
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
          </div>
        }
      >
        <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-emerald-950">
                {t("connectedDevices.workerSummaryTitle")}
              </div>
              <p className="mt-1 text-sm text-emerald-900/80">
                {t("connectedDevices.workerSummaryDescription")}
              </p>
            </div>
            <Button asChild type="button" size="sm" variant="outline">
              <a href="/settings?tab=workers">
                {t("connectedDevices.openWorkerBootstrap")}
              </a>
            </Button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm">
              <div className="text-xs text-slate-500">
                {t("connectedDevices.workerCount")}
              </div>
              <div className="mt-1 font-semibold text-slate-900">
                {workerIdentityCount}
              </div>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm">
              <div className="text-xs text-slate-500">
                {t("connectedDevices.workerDeviceCount")}
              </div>
              <div className="mt-1 font-semibold text-slate-900">
                {authorizedWorkerDevices.length}
              </div>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm">
              <div className="text-xs text-slate-500">
                {t("connectedDevices.workerActiveDeviceCount")}
              </div>
              <div className="mt-1 font-semibold text-slate-900">
                {activeWorkerDeviceCount}
              </div>
            </div>
          </div>
        </div>
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

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-slate-700" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-slate-950">
                {t("connectedDevices.moduleStatusTitle")}
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {t("connectedDevices.moduleStatusDescription")}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {oauthProbes.map(probe => (
                  <div
                    key={probe.key}
                    className="rounded-lg border border-slate-200 bg-white p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-800">
                        {t(`connectedDevices.probe.${probe.key}`)}
                      </span>
                      <Badge
                        variant="outline"
                        className={
                          probe.ok
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-amber-200 bg-amber-50 text-amber-800"
                        }
                      >
                        {probe.ok
                          ? t("connectedDevices.statusReady")
                          : t("connectedDevices.statusUnavailable")}
                      </Badge>
                    </div>
                    <code className="mt-2 block break-all text-[11px] text-slate-500">
                      {probe.url}
                    </code>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {t("connectedDevices.httpStatus")}:{" "}
                      {probe.statusCode ?? "-"}
                    </div>
                  </div>
                ))}
                {oauthProbes.length === 0 && (
                  <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500">
                    {t("connectedDevices.statusChecking")}
                  </div>
                )}
              </div>
              <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50/70 p-3">
                <div className="text-xs font-semibold text-sky-900">
                  {t("connectedDevices.tenantFeatureFlags")}
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {(
                    [
                      ["mcpModernProtocolEnabled", "modernMcp"],
                      ["mcpResourcesEnabled", "mcpResources"],
                      ["mcpOAuthProtectedResourceEnabled", "oauthPrm"],
                      [
                        "mcpOAuthAuthorizationServerEnabled",
                        "oauthAuthorization",
                      ],
                      ["remotionDedicatedExecutorEnabled", "remotion"],
                    ] as const
                  ).map(([flag, label]) => {
                    const enabled = featureFlags?.[flag] === true;
                    return (
                      <div
                        key={flag}
                        className="flex items-center justify-between gap-2 rounded-md border border-sky-100 bg-white px-2.5 py-2 text-xs"
                      >
                        <span className="text-slate-700">
                          {t(`connectedDevices.flag.${label}`)}
                        </span>
                        <Badge
                          variant="outline"
                          className={
                            enabled
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-slate-50 text-slate-600"
                          }
                        >
                          {enabled
                            ? t("connectedDevices.flagOn")
                            : t("connectedDevices.flagOff")}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-violet-700" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-slate-950">
                {t("connectedDevices.quotaTitle")}
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-700">
                {t("connectedDevices.quotaDescription")}
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-violet-100 bg-white p-3">
                  <div className="text-xs font-semibold text-slate-900">
                    {t("connectedDevices.quotaOAuthTitle")}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {t("connectedDevices.quotaOAuthDescription")}
                  </p>
                </div>
                <div className="rounded-lg border border-violet-100 bg-white p-3">
                  <div className="text-xs font-semibold text-slate-900">
                    {t("connectedDevices.quotaCliTitle")}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {t("connectedDevices.quotaCliDescription")}
                  </p>
                  <Button asChild size="sm" variant="outline" className="mt-3">
                    <a href="/settings?tab=api">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {t("connectedDevices.quotaOpenApiKeys")}
                    </a>
                  </Button>
                </div>
                <div className="rounded-lg border border-violet-100 bg-white p-3">
                  <div className="text-xs font-semibold text-slate-900">
                    {t("connectedDevices.quotaWorkerTitle")}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {t("connectedDevices.quotaWorkerDescription")}
                  </p>
                </div>
              </div>
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
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  "smartaihub-remotion-executor doctor",
                  "smartaihub-remotion-executor connect",
                  "smartaihub-remotion-executor start",
                  "smartaihub-remotion-executor status",
                  "smartaihub-remotion-executor logout",
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
              <div className="mt-3 rounded-lg border border-amber-200 bg-white/80 p-3">
                <div className="text-xs font-semibold text-slate-900">
                  {t("connectedDevices.remotionRuntimeAvailability")}
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  {t("connectedDevices.remotionRuntimeAvailabilityDescription")}
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {runtimePacks.map(pack => (
                    <div
                      key={pack.runtimeId}
                      className="rounded-lg border border-slate-200 bg-white p-2"
                    >
                      <div className="text-[11px] font-medium text-slate-700">
                        {pack.runtimeId.replace("remotion-executor-", "")}
                      </div>
                      <div
                        className={
                          pack.available
                            ? "mt-1 text-xs text-emerald-700"
                            : "mt-1 text-xs text-amber-800"
                        }
                      >
                        {pack.available
                          ? t("connectedDevices.remotionRuntimePublished", {
                              version: pack.version ?? "-",
                            })
                          : t("connectedDevices.remotionRuntimeUnavailable")}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {t("connectedDevices.httpStatus")}:{" "}
                        {pack.statusCode ?? "-"}
                      </div>
                      {pack.available && pack.archiveUrl
                        ? (() => {
                            try {
                              const archiveUrl = new URL(
                                pack.archiveUrl,
                                window.location.origin
                              );
                              if (archiveUrl.origin !== window.location.origin)
                                return null;
                              return (
                                <a
                                  className="mt-1 inline-flex text-[11px] font-medium text-sky-700 hover:underline"
                                  href={archiveUrl.toString()}
                                >
                                  {t(
                                    "connectedDevices.remotionRuntimeDownload"
                                  )}
                                </a>
                              );
                            } catch {
                              return null;
                            }
                          })()
                        : null}
                    </div>
                  ))}
                </div>
              </div>
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
            {devices.map(device => {
              const grantedScopes = device.scopes ?? [];
              const baselineAllowedScopes =
                device.allowedScopes ?? grantedScopes;
              const selectedScopes =
                scopeEdits[device.deviceId] ?? baselineAllowedScopes;
              const effectiveScopes =
                device.effectiveScopes ?? baselineAllowedScopes;
              const isPermissionDirty =
                JSON.stringify([...selectedScopes].sort()) !==
                JSON.stringify([...baselineAllowedScopes].sort());
              const canEditPermissions =
                device.status !== "revoked" &&
                [
                  "mcp_oauth",
                  "mcp_agent_pairing",
                  "worker_executor",
                ].includes(device.authKind);
              const isWorkerDevice = device.authKind === "worker_executor";
              const deniedScopes = grantedScopes.filter(
                scope => !effectiveScopes.includes(scope)
              );
              return (
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
                        {device.workerId && (
                          <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50/60 p-2.5 text-xs">
                            <div className="font-semibold text-amber-900">
                              {t("connectedDevices.workerRuntimeStatus")}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-amber-950">
                              <span>
                                {t("connectedDevices.workerStatus")}:{" "}
                                {device.workerStatus ?? "-"}
                              </span>
                              <span>
                                {t("connectedDevices.workerRuntimeVersion")}:{" "}
                                {device.workerRuntimeVersion ?? "-"}
                              </span>
                              <span>
                                {t("connectedDevices.workerLastSeenAt")}:{" "}
                                {formatDate(device.workerLastSeenAt ?? null)}
                              </span>
                            </div>
                          </div>
                        )}
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
                              <span className="font-mono">
                                {device.clientId}
                              </span>
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
                              count: grantedScopes.length,
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
                              count: grantedScopes.length,
                            })}
                          </div>
                          <div className="mt-2 space-y-2">
                            {grantedScopes.length > 0 ? (
                              grantedScopes.map(scope => (
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
                          <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            <Badge variant="secondary">
                              {t("connectedDevices.effectivePermissions", {
                                count: effectiveScopes.length,
                              })}
                            </Badge>
                            {deniedScopes.length > 0 && (
                              <Badge
                                className="border-amber-200 bg-amber-50 text-amber-800"
                                variant="outline"
                              >
                                {t("connectedDevices.deniedPermissions", {
                                  count: deniedScopes.length,
                                })}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {canEditPermissions && (
                          <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/50 p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <div className="text-sm font-semibold text-violet-950">
                                  {t("connectedDevices.permissionPolicyTitle")}
                                </div>
                                <p className="mt-1 text-xs leading-5 text-violet-900/80">
                                  {t(
                                    isWorkerDevice
                                      ? "connectedDevices.workerPermissionPolicyDescription"
                                      : "connectedDevices.permissionPolicyDescription",
                                  )}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    setScopeEdits(previous => ({
                                      ...previous,
                                      [device.deviceId]: [...grantedScopes],
                                    }))
                                  }
                                >
                                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                                  {t("connectedDevices.permissionReset")}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={
                                    isPermissionDirty ? "default" : "outline"
                                  }
                                  className={
                                    isPermissionDirty
                                      ? "bg-violet-700 text-white hover:bg-violet-800"
                                      : "border-violet-200 text-violet-700"
                                  }
                                  disabled={
                                    !isPermissionDirty ||
                                    updatePermissionsMutation.isPending
                                  }
                                  title={
                                    isPermissionDirty
                                      ? t("connectedDevices.permissionSaveHint")
                                      : t(
                                          "connectedDevices.permissionNoChanges"
                                        )
                                  }
                                  onClick={() =>
                                    updatePermissionsMutation.mutate({
                                      deviceId: device.deviceId,
                                      allowedScopes: selectedScopes,
                                    })
                                  }
                                >
                                  {updatePermissionsMutation.isPending &&
                                  updatePermissionsMutation.variables
                                    ?.deviceId === device.deviceId ? (
                                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Save className="mr-1.5 h-3.5 w-3.5" />
                                  )}
                                  {t("connectedDevices.permissionSave")}
                                </Button>
                              </div>
                            </div>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              {grantedScopes.map(scope => {
                                const checked = selectedScopes.includes(scope);
                                return (
                                  <label
                                    key={scope}
                                    className="flex cursor-pointer items-start gap-2 rounded-lg border border-violet-100 bg-white px-3 py-2"
                                  >
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={value =>
                                        setScopeEdits(previous => {
                                          const current = new Set(
                                            previous[device.deviceId] ??
                                              baselineAllowedScopes
                                          );
                                          if (value === true)
                                            current.add(scope);
                                          else current.delete(scope);
                                          return {
                                            ...previous,
                                            [device.deviceId]: [
                                              ...current,
                                            ].sort(),
                                          };
                                        })
                                      }
                                    />
                                    <span className="min-w-0 text-xs leading-5">
                                      <span className="block font-medium text-slate-800">
                                        {scopeLabel(t, scope)}
                                      </span>
                                      <span className="block text-slate-500">
                                        {scopeDescription(t, scope)}
                                      </span>
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                            <div className="mt-3 text-xs text-violet-900/70">
                              {isPermissionDirty
                                ? t("connectedDevices.permissionSaveHint")
                                : t("connectedDevices.permissionNoChanges")}
                            </div>
                          </div>
                        )}
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
                        revokeMutation.variables?.deviceId ===
                          device.deviceId ? (
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
              );
            })}
          </div>
        )}
      </DashboardCard>
    </div>
  );
}
