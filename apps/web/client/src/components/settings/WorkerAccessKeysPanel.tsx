import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import { DashboardCard, DashboardSectionHeader } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import {
  workerRuntimeTypeValues,
  type WorkerRuntimeType,
} from "@shared/workerRuntime";
import {
  connectedWorkerSharingModeValues,
  type ConnectedWorkerRecord,
  getWorkerAccessPermissionScopesForPreset,
  workerAccessPermissionPresetValues,
  type WorkerAccessPermissionPreset,
  type WorkerAccessPermissionScope,
  workerLlmRoutingModeValues,
  type WorkerAccessKeyRecord,
  type WorkerLlmRoutingMode,
} from "@shared/workerAccessKeys";
import { AlertCircle, CheckCircle2, Copy, Key, Loader2, RotateCcw, Save, Shield, Trash2, Users } from "lucide-react";

type GeneratedKey = {
  rawToken: string;
  key: WorkerAccessKeyRecord;
};

type WorkerSharingDraft = {
  sharingMode: "private" | "groups" | "tenant";
  groupIds: number[];
};

type WorkerAccessKeysPanelProps = {
  tenantName?: string | null;
};

const WORKER_RUNTIME_LABELS: Record<WorkerRuntimeType, string> = {
  openclaw_gateway: "OpenClaw",
  desktop_zeroclaw_managed: "ZeroClaw Desktop",
  nemoclaw_sandbox: "NemoClaw",
  hiclaw_cluster: "HiClaw",
  hermes_agent_gateway: "Hermes",
};

const WORKER_PERMISSION_GROUPS: Array<{
  id: string;
  titleKey: string;
  descriptionKey: string;
  scopes: WorkerAccessPermissionScope[];
}> = [
  {
    id: "control_plane",
    titleKey: "settings.workers.permissions.groups.controlPlane.title",
    descriptionKey: "settings.workers.permissions.groups.controlPlane.description",
    scopes: [
      "workers:register",
      "workers:heartbeat",
      "workers:claim",
      "workers:report",
      "workers:diagnostics",
    ],
  },
  {
    id: "gateway",
    titleKey: "settings.workers.permissions.groups.gateway.title",
    descriptionKey: "settings.workers.permissions.groups.gateway.description",
    scopes: [
      "llm:chat",
      "delegate:http",
      "delegate:mcp",
      "callbacks:publish",
    ],
  },
  {
    id: "knowledge",
    titleKey: "settings.workers.permissions.groups.knowledge.title",
    descriptionKey: "settings.workers.permissions.groups.knowledge.description",
    scopes: [
      "library:read",
      "library:write",
      "rag:read",
      "rag:write",
    ],
  },
  {
    id: "skills_agents",
    titleKey: "settings.workers.permissions.groups.skillsAgents.title",
    descriptionKey: "settings.workers.permissions.groups.skillsAgents.description",
    scopes: [
      "skills:execute",
      "agents:execute",
    ],
  },
  {
    id: "work_os",
    titleKey: "settings.workers.permissions.groups.workOs.title",
    descriptionKey: "settings.workers.permissions.groups.workOs.description",
    scopes: [
      "workos:read",
      "workos:write",
    ],
  },
];

const WORKER_PERMISSION_SCOPE_LABEL_KEYS: Record<WorkerAccessPermissionScope, string> = {
  "workers:register": "settings.workers.permissions.scopes.workersRegister",
  "workers:heartbeat": "settings.workers.permissions.scopes.workersHeartbeat",
  "workers:claim": "settings.workers.permissions.scopes.workersClaim",
  "workers:report": "settings.workers.permissions.scopes.workersReport",
  "workers:diagnostics": "settings.workers.permissions.scopes.workersDiagnostics",
  "llm:chat": "settings.workers.permissions.scopes.llmChat",
  "delegate:http": "settings.workers.permissions.scopes.delegateHttp",
  "delegate:mcp": "settings.workers.permissions.scopes.delegateMcp",
  "callbacks:publish": "settings.workers.permissions.scopes.callbacksPublish",
  "library:read": "settings.workers.permissions.scopes.libraryRead",
  "library:write": "settings.workers.permissions.scopes.libraryWrite",
  "rag:read": "settings.workers.permissions.scopes.ragRead",
  "rag:write": "settings.workers.permissions.scopes.ragWrite",
  "skills:execute": "settings.workers.permissions.scopes.skillsExecute",
  "agents:execute": "settings.workers.permissions.scopes.agentsExecute",
  "workos:read": "settings.workers.permissions.scopes.workOsRead",
  "workos:write": "settings.workers.permissions.scopes.workOsWrite",
};

const WORKER_PERMISSION_PRESET_LABEL_KEYS: Record<WorkerAccessPermissionPreset, string> = {
  readonly: "settings.workers.permissions.presets.readonly",
  operator_basic: "settings.workers.permissions.presets.operatorBasic",
  content_worker: "settings.workers.permissions.presets.contentWorker",
  knowledge_worker: "settings.workers.permissions.presets.knowledgeWorker",
  work_os_worker: "settings.workers.permissions.presets.workOsWorker",
  full_personal_worker: "settings.workers.permissions.presets.fullPersonalWorker",
  custom: "settings.workers.permissions.presets.custom",
};

const WORKER_PERMISSION_PRESET_DESCRIPTION_KEYS: Record<WorkerAccessPermissionPreset, string> = {
  readonly: "settings.workers.permissions.presetDescriptions.readonly",
  operator_basic: "settings.workers.permissions.presetDescriptions.operatorBasic",
  content_worker: "settings.workers.permissions.presetDescriptions.contentWorker",
  knowledge_worker: "settings.workers.permissions.presetDescriptions.knowledgeWorker",
  work_os_worker: "settings.workers.permissions.presetDescriptions.workOsWorker",
  full_personal_worker: "settings.workers.permissions.presetDescriptions.fullPersonalWorker",
  custom: "settings.workers.permissions.presetDescriptions.custom",
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "Never";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function formatQuota(value: number | null | undefined, unit: string, unlimitedLabel: string): string {
  if (!value) {
    return unlimitedLabel;
  }
  return `${value}/${unit}`;
}

function injectTenantName(text: string, tenantName: string): string {
  return text.replaceAll("{{tenantName}}", tenantName);
}

type WorkerConnectionGuide = {
  runtimeType: WorkerRuntimeType;
  titleKey: string;
  descriptionKey: string;
  steps: string[];
};

export function WorkerAccessKeysPanel({ tenantName }: WorkerAccessKeysPanelProps) {
  const { t } = useScopedTranslation("settings");
  const utils = trpc.useUtils();
  const prefsQuery = trpc.users.getPreferences.useQuery();
  const connectedWorkersQuery = trpc.users.listConnectedWorkers.useQuery(undefined, { retry: false });
  const providersQuery = trpc.llmProviders.list.useQuery();
  const groupsQuery = trpc.groups.list.useQuery({ scope: "all" }, { retry: false });
  const resolvedTenantName = tenantName?.trim() || t("workers.tenantFallback");

  const [label, setLabel] = useState("");
  const [runtimeType, setRuntimeType] = useState<WorkerRuntimeType>("hermes_agent_gateway");
  const [llmRoutingMode, setLlmRoutingMode] = useState<WorkerLlmRoutingMode>("auto");
  const [preferredProviderId, setPreferredProviderId] = useState("");
  const [permissionPreset, setPermissionPreset] = useState<WorkerAccessPermissionPreset>("readonly");
  const [permissionScopes, setPermissionScopes] = useState<WorkerAccessPermissionScope[]>(
    getWorkerAccessPermissionScopesForPreset("readonly"),
  );
  const [quotaHourly, setQuotaHourly] = useState("");
  const [quotaDaily, setQuotaDaily] = useState("");
  const [quotaWeekly, setQuotaWeekly] = useState("");
  const [quotaMonthly, setQuotaMonthly] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("30");
  const [generatedKey, setGeneratedKey] = useState<GeneratedKey | null>(null);
  const [sharingDrafts, setSharingDrafts] = useState<Record<string, WorkerSharingDraft>>({});

  const providerOptions = useMemo<Array<{ id: number; label: string; name: string }>>(
    () => (providersQuery.data ?? []).map((provider: { id: number; displayName?: string | null; providerName: string }) => ({
      id: provider.id,
      label: provider.displayName || provider.providerName,
      name: provider.providerName,
    })),
    [providersQuery.data],
  );

  useEffect(() => {
    if (llmRoutingMode === "pinned_provider" && !preferredProviderId && providerOptions[0]) {
      setPreferredProviderId(String(providerOptions[0].id));
    }
  }, [llmRoutingMode, preferredProviderId, providerOptions]);

  useEffect(() => {
    if (permissionPreset !== "custom") {
      setPermissionScopes(getWorkerAccessPermissionScopesForPreset(permissionPreset));
    }
  }, [permissionPreset]);

  const createMutation = trpc.users.createWorkerAccessKey.useMutation({
    onSuccess: (result) => {
      setGeneratedKey({
        rawToken: result.rawToken,
        key: result.key as WorkerAccessKeyRecord,
      });
      setLabel("");
      setPermissionPreset("readonly");
      setPermissionScopes(getWorkerAccessPermissionScopesForPreset("readonly"));
      setQuotaHourly("");
      setQuotaDaily("");
      setQuotaWeekly("");
      setQuotaMonthly("");
      setExpiresInDays("30");
      utils.users.getPreferences.invalidate();
      toast.success(t("settings.workers.keyCreated"));
    },
    onError: (error) => toast.error(error.message),
  });

  const revokeMutation = trpc.users.revokeWorkerAccessKey.useMutation({
    onSuccess: () => {
      utils.users.getPreferences.invalidate();
      toast.success(t("settings.workers.keyRevoked"));
    },
    onError: (error) => toast.error(error.message),
  });

  const updateConnectedWorkerSharingMutation = trpc.users.updateConnectedWorkerSharing.useMutation({
    onSuccess: async () => {
      await utils.users.listConnectedWorkers.invalidate();
      toast.success(t("settings.workers.connectedWorkers.saved"));
    },
    onError: (error) => toast.error(error.message),
  });

  const workerKeys = prefsQuery.data?.workerAccessKeys ?? [];
  const connectedWorkers = connectedWorkersQuery.data?.workers ?? [];
  const activeWorkerKeys = workerKeys.filter((key) => !key.revokedAt).length;
  const policySummary = useMemo(() => {
    const active = workerKeys.filter((key) => !key.revokedAt);
    return {
      activeCount: active.length,
      pinnedProviderCount: active.filter((key) => key.llmRoutingMode === "pinned_provider").length,
      customPolicyCount: active.filter((key) => key.permissionPreset === "custom").length,
      quotaConfiguredCount: active.filter((key) => Boolean(key.quotaHourly || key.quotaDaily || key.quotaWeekly || key.quotaMonthly)).length,
    };
  }, [workerKeys]);

  useEffect(() => {
    if (!connectedWorkersQuery.data?.workers) {
      return;
    }
    setSharingDrafts((current) => {
      const next: Record<string, WorkerSharingDraft> = {};
      for (const worker of connectedWorkersQuery.data.workers) {
        const existing = current[worker.workerId];
        next[worker.workerId] = existing ?? {
          sharingMode: worker.sharingMode,
          groupIds: worker.sharedGroups.map((group) => group.id),
        };
      }
      return next;
    });
  }, [connectedWorkersQuery.data]);

  const canCreate = label.trim().length > 0
    && (llmRoutingMode !== "pinned_provider" || Boolean(preferredProviderId))
    && (permissionPreset !== "custom" || permissionScopes.length > 0)
    && !createMutation.isPending;

  const connectionGuides: WorkerConnectionGuide[] = [
    {
      runtimeType: "hermes_agent_gateway",
      titleKey: "settings.workers.connect.hermes.title",
      descriptionKey: "settings.workers.connect.hermes.description",
      steps: [
        "settings.workers.connect.hermes.step1",
        "settings.workers.connect.hermes.step2",
        "settings.workers.connect.hermes.step3",
      ],
    },
    {
      runtimeType: "openclaw_gateway",
      titleKey: "settings.workers.connect.openclaw.title",
      descriptionKey: "settings.workers.connect.openclaw.description",
      steps: [
        "settings.workers.connect.openclaw.step1",
        "settings.workers.connect.openclaw.step2",
        "settings.workers.connect.openclaw.step3",
      ],
    },
    {
      runtimeType: "desktop_zeroclaw_managed",
      titleKey: "settings.workers.connect.zeroclaw.title",
      descriptionKey: "settings.workers.connect.zeroclaw.description",
      steps: [
        "settings.workers.connect.zeroclaw.step1",
        "settings.workers.connect.zeroclaw.step2",
        "settings.workers.connect.zeroclaw.step3",
      ],
    },
    {
      runtimeType: "nemoclaw_sandbox",
      titleKey: "settings.workers.connect.nemoclaw.title",
      descriptionKey: "settings.workers.connect.nemoclaw.description",
      steps: [
        "settings.workers.connect.nemoclaw.step1",
        "settings.workers.connect.nemoclaw.step2",
        "settings.workers.connect.nemoclaw.step3",
      ],
    },
  ];

  function handleCreate() {
    const parsedExpiry = expiresInDays.trim() ? Number(expiresInDays) : null;
    if (expiresInDays.trim()) {
      if (parsedExpiry == null || !Number.isInteger(parsedExpiry) || parsedExpiry < 1) {
        toast.error(t("settings.workers.invalidExpiry"));
        return;
      }
    }
    const parsedQuotaHourly = quotaHourly.trim() ? Number(quotaHourly) : null;
    const parsedQuotaDaily = quotaDaily.trim() ? Number(quotaDaily) : null;
    const parsedQuotaWeekly = quotaWeekly.trim() ? Number(quotaWeekly) : null;
    const parsedQuotaMonthly = quotaMonthly.trim() ? Number(quotaMonthly) : null;
    const quotaValues = [parsedQuotaHourly, parsedQuotaDaily, parsedQuotaWeekly, parsedQuotaMonthly];
    if (quotaValues.some((value) => value != null && (!Number.isInteger(value) || value < 1))) {
      toast.error(t("settings.workers.invalidQuota"));
      return;
    }
    createMutation.mutate({
      label: label.trim(),
      runtimeType,
      llmRoutingMode,
      preferredProviderId: llmRoutingMode === "pinned_provider" && preferredProviderId
        ? Number(preferredProviderId)
        : null,
      permissionPreset,
      permissionScopes,
      quotaHourly: parsedQuotaHourly,
      quotaDaily: parsedQuotaDaily,
      quotaWeekly: parsedQuotaWeekly,
      quotaMonthly: parsedQuotaMonthly,
      expiresInDays: parsedExpiry,
    });
  }

  async function copyToken() {
    if (!generatedKey) return;
    await navigator.clipboard.writeText(generatedKey.rawToken);
    toast.success(t("common.copied"));
  }

  function togglePermissionScope(scope: WorkerAccessPermissionScope) {
    setPermissionPreset("custom");
    setPermissionScopes((current) => (
      current.includes(scope)
        ? current.filter((item) => item !== scope)
        : [...current, scope]
    ));
  }

  function runtimeLabel(runtimeType: WorkerRuntimeType): string {
    return WORKER_RUNTIME_LABELS[runtimeType] ?? runtimeType;
  }

  function updateSharingDraft(workerId: string, patch: Partial<WorkerSharingDraft>) {
    setSharingDrafts((current) => {
      const existing = current[workerId] ?? { sharingMode: "private" as const, groupIds: [] };
      return {
        ...current,
        [workerId]: {
          ...existing,
          ...patch,
        },
      };
    });
  }

  function toggleSharingGroup(workerId: string, groupId: number, checked: boolean) {
    const current = sharingDrafts[workerId] ?? { sharingMode: "private" as const, groupIds: [] };
    const nextIds = new Set(current.groupIds);
    if (checked) nextIds.add(groupId);
    else nextIds.delete(groupId);
    updateSharingDraft(workerId, { groupIds: Array.from(nextIds).sort((left, right) => left - right) });
  }

  function sharingDraftChanged(worker: ConnectedWorkerRecord): boolean {
    const draft = sharingDrafts[worker.workerId];
    if (!draft) return false;
    const currentIds = worker.sharedGroups.map((group) => group.id).sort((left, right) => left - right);
    const draftIds = [...draft.groupIds].sort((left, right) => left - right);
    return draft.sharingMode !== worker.sharingMode || JSON.stringify(draftIds) !== JSON.stringify(currentIds);
  }

  function saveConnectedWorkerSharing(worker: ConnectedWorkerRecord) {
    const draft = sharingDrafts[worker.workerId] ?? {
      sharingMode: worker.sharingMode,
      groupIds: worker.sharedGroups.map((group) => group.id),
    };
    updateConnectedWorkerSharingMutation.mutate({
      workerId: worker.workerId,
      sharingMode: draft.sharingMode,
      groupIds: draft.sharingMode === "groups" ? draft.groupIds : [],
    });
  }

  function resetConnectedWorkerSharing(worker: ConnectedWorkerRecord) {
    updateSharingDraft(worker.workerId, {
      sharingMode: worker.sharingMode,
      groupIds: worker.sharedGroups.map((group) => group.id),
    });
  }

  return (
    <div className="space-y-6">
      <DashboardSectionHeader
        eyebrow={t("settings.workers.eyebrow")}
        title={t("settings.workers.title")}
        description={injectTenantName(t("settings.workers.description", { tenantName: resolvedTenantName }), resolvedTenantName)}
      />

      {generatedKey && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-emerald-900 font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                {t("settings.workers.oneTimeKey")}
              </div>
              <p className="text-sm text-emerald-700">
                {t("settings.workers.copyNow")}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={copyToken}>
              <Copy className="mr-2 h-4 w-4" />
              {t("common.copy")}
            </Button>
          </div>
          <textarea
            readOnly
            value={generatedKey.rawToken}
            className="mt-3 min-h-28 w-full rounded-xl border border-emerald-200 bg-white p-3 font-mono text-xs text-gray-800"
          />
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-emerald-800">
            <Badge variant="secondary">ID {generatedKey.key.keyId}</Badge>
            <Badge variant="secondary">{runtimeLabel(generatedKey.key.runtimeType)}</Badge>
            <Badge variant="secondary">{generatedKey.key.llmRoutingMode}</Badge>
            <Badge variant="secondary">
              {t(WORKER_PERMISSION_PRESET_LABEL_KEYS[generatedKey.key.permissionPreset])}
            </Badge>
            <Badge variant="secondary">
              {generatedKey.key.permissionScopes.length} {t("settings.workers.permissions.scopesSelected")}
            </Badge>
            {generatedKey.key.preferredProviderName && (
              <Badge variant="secondary">{generatedKey.key.preferredProviderName}</Badge>
            )}
            {generatedKey.key.quotaHourly || generatedKey.key.quotaDaily || generatedKey.key.quotaWeekly || generatedKey.key.quotaMonthly ? (
              <Badge variant="secondary">{t("settings.workers.quotas.applied")}</Badge>
            ) : null}
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            {t("settings.workers.summary.activeKeys")}
          </div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{policySummary.activeCount}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            {t("settings.workers.summary.pinnedProvider")}
          </div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{policySummary.pinnedProviderCount}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            {t("settings.workers.summary.customPolicy")}
          </div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{policySummary.customPolicyCount}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            {t("settings.workers.summary.quotaLimited")}
          </div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{policySummary.quotaConfiguredCount}</div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <DashboardCard
          title={t("settings.workers.createTitle")}
          description={t("settings.workers.createDescription")}
          leading={<Key className="h-5 w-5 text-sky-500" />}
        >
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label className="mb-2 block">{t("settings.workers.label")}</Label>
                <Input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder={t("settings.workers.labelPlaceholder")}
                />
              </div>
              <div>
                <Label className="mb-2 block">{t("settings.workers.runtimeType")}</Label>
                <select
                  value={runtimeType}
                  onChange={(event) => setRuntimeType(event.target.value as WorkerRuntimeType)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3"
                >
                  {workerRuntimeTypeValues.map((value) => (
                    <option key={value} value={value}>
                      {WORKER_RUNTIME_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label className="mb-2 block">{t("settings.workers.routingMode")}</Label>
                <select
                  value={llmRoutingMode}
                  onChange={(event) => setLlmRoutingMode(event.target.value as WorkerLlmRoutingMode)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3"
                >
                  {workerLlmRoutingModeValues.map((value) => (
                    <option key={value} value={value}>
                      {value === "auto" ? t("settings.workers.routingAuto") : t("settings.workers.routingPinned")}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="mb-2 block">{t("settings.workers.provider")}</Label>
                <select
                  value={preferredProviderId}
                  onChange={(event) => setPreferredProviderId(event.target.value)}
                  disabled={llmRoutingMode !== "pinned_provider"}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 disabled:cursor-not-allowed disabled:bg-gray-100"
                >
                  <option value="">{t("settings.workers.providerAuto")}</option>
                  {providerOptions.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                    </option>
                  ))}
                  </select>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4">
              <div className="mb-3">
                <Label className="mb-2 block">{t("settings.workers.permissions.title")}</Label>
                <p className="text-sm text-gray-600">{t("settings.workers.permissions.description")}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label className="mb-2 block">{t("settings.workers.permissions.preset")}</Label>
                  <select
                    value={permissionPreset}
                    onChange={(event) => setPermissionPreset(event.target.value as WorkerAccessPermissionPreset)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3"
                  >
                    {workerAccessPermissionPresetValues.map((preset) => (
                      <option key={preset} value={preset}>
                        {t(WORKER_PERMISSION_PRESET_LABEL_KEYS[preset])}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-gray-500">
                    {t(WORKER_PERMISSION_PRESET_DESCRIPTION_KEYS[permissionPreset])}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="mb-2 block">{t("settings.workers.permissions.scopesLabel")}</Label>
                  <p className="text-xs text-gray-500">
                    {t("settings.workers.permissions.scopesHint")}
                  </p>
                  <div className="grid gap-3">
                    {WORKER_PERMISSION_GROUPS.map((group) => (
                      <div key={group.id} className="rounded-xl border border-white/70 bg-white p-3 shadow-sm">
                        <div className="mb-2">
                          <div className="text-sm font-medium text-gray-900">{t(group.titleKey)}</div>
                          <div className="text-xs text-gray-500">{t(group.descriptionKey)}</div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {group.scopes.map((scope) => (
                            <label key={scope} className="flex items-start gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm hover:bg-gray-50">
                              <input
                                type="checkbox"
                                className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600"
                                checked={permissionScopes.includes(scope)}
                                onChange={() => togglePermissionScope(scope)}
                              />
                              <span>
                                <span className="block font-medium text-gray-900">
                                  {t(WORKER_PERMISSION_SCOPE_LABEL_KEYS[scope])}
                                </span>
                                <span className="block text-xs text-gray-500">{scope}</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label className="mb-2 block">{t("settings.workers.expiryDays")}</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder={t("settings.workers.noExpiry")}
                  value={expiresInDays}
                  onChange={(event) => setExpiresInDays(event.target.value)}
                />
                <p className="mt-1 text-xs text-gray-500">{t("settings.workers.expiryHint")}</p>
              </div>
              <div className="space-y-4">
                <Label className="mb-2 block">{t("settings.workers.quotas.title")}</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    type="number"
                    min={1}
                    placeholder={t("settings.workers.quotas.hourly")}
                    value={quotaHourly}
                    onChange={(event) => setQuotaHourly(event.target.value)}
                  />
                  <Input
                    type="number"
                    min={1}
                    placeholder={t("settings.workers.quotas.daily")}
                    value={quotaDaily}
                    onChange={(event) => setQuotaDaily(event.target.value)}
                  />
                  <Input
                    type="number"
                    min={1}
                    placeholder={t("settings.workers.quotas.weekly")}
                    value={quotaWeekly}
                    onChange={(event) => setQuotaWeekly(event.target.value)}
                  />
                  <Input
                    type="number"
                    min={1}
                    placeholder={t("settings.workers.quotas.monthly")}
                    value={quotaMonthly}
                    onChange={(event) => setQuotaMonthly(event.target.value)}
                  />
                </div>
                <p className="text-xs text-gray-500">{t("settings.workers.quotas.hint")}</p>
                <Button
                  onClick={handleCreate}
                  disabled={!canCreate}
                  className="w-full bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500 text-white"
                >
                  {createMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Shield className="mr-2 h-4 w-4" />
                  )}
                  {t("settings.workers.createKey")}
                </Button>
              </div>
            </div>

            {llmRoutingMode === "pinned_provider" && !preferredProviderId && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {t("settings.workers.providerRequired")}
              </div>
            )}
          </div>
        </DashboardCard>

        <DashboardCard
          title={t("settings.workers.listTitle", { count: activeWorkerKeys })}
          description={t("settings.workers.listDescription")}
          leading={<RotateCcw className="h-5 w-5 text-sky-500" />}
        >
          <div className="space-y-3">
            {workerKeys.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                {t("settings.workers.noKeys")}
              </div>
            ) : (
              workerKeys.map((key) => (
                <div key={key.keyId} className="rounded-xl border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900">{key.label}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {runtimeLabel(key.runtimeType)} · {key.llmRoutingMode} · {formatDate(key.createdAt)}
                      </div>
                    </div>
                    {key.revokedAt ? (
                      <Badge variant="secondary" className="text-gray-500">{t("settings.workers.revoked")}</Badge>
                    ) : (
                      <Badge variant="outline" className="border-green-200 text-green-700">{t("settings.workers.active")}</Badge>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                    <Badge variant="secondary">{key.tokenHint}</Badge>
                    <Badge variant="secondary">{t(WORKER_PERMISSION_PRESET_LABEL_KEYS[key.permissionPreset])}</Badge>
                    <Badge variant="secondary">
                      {key.permissionScopes.length} {t("settings.workers.permissions.scopesSelected")}
                    </Badge>
                    {key.preferredProviderName ? <Badge variant="secondary">{key.preferredProviderName}</Badge> : null}
                    <Badge variant="secondary">{key.expiresAt ? formatDate(key.expiresAt) : t("settings.workers.noExpiry")}</Badge>
                    {key.quotaHourly || key.quotaDaily || key.quotaWeekly || key.quotaMonthly ? (
                      <Badge variant="secondary">{t("settings.workers.quotas.applied")}</Badge>
                    ) : null}
                  </div>
                  {(key.quotaHourly || key.quotaDaily || key.quotaWeekly || key.quotaMonthly) && (
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-500">
                      {key.quotaHourly ? <Badge variant="outline">{formatQuota(key.quotaHourly, "h", t("settings.workers.unlimited"))}</Badge> : null}
                      {key.quotaDaily ? <Badge variant="outline">{formatQuota(key.quotaDaily, "d", t("settings.workers.unlimited"))}</Badge> : null}
                      {key.quotaWeekly ? <Badge variant="outline">{formatQuota(key.quotaWeekly, "w", t("settings.workers.unlimited"))}</Badge> : null}
                      {key.quotaMonthly ? <Badge variant="outline">{formatQuota(key.quotaMonthly, "mo", t("settings.workers.unlimited"))}</Badge> : null}
                    </div>
                  )}
                  {!key.revokedAt && (
                    <div className="mt-3 flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => revokeMutation.mutate({ keyId: key.keyId })}
                        disabled={revokeMutation.isPending}
                        className="text-red-600 border-red-200 hover:bg-red-50"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t("settings.workers.revoke")}
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </DashboardCard>
      </div>

      <DashboardCard
        title={t("settings.workers.connectedWorkers.title", { count: connectedWorkers.length })}
        description={t("settings.workers.connectedWorkers.description")}
        leading={<Users className="h-5 w-5 text-sky-500" />}
      >
        <div className="space-y-4">
          {connectedWorkersQuery.isLoading ? (
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("settings.workers.connectedWorkers.loading")}
            </div>
          ) : connectedWorkers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
              {t("settings.workers.connectedWorkers.empty")}
            </div>
          ) : (
            connectedWorkers.map((worker) => {
              const draft = sharingDrafts[worker.workerId] ?? {
                sharingMode: worker.sharingMode,
                groupIds: worker.sharedGroups.map((group) => group.id),
              };
              const isDirty = sharingDraftChanged(worker);
              const isSaving = updateConnectedWorkerSharingMutation.isPending
                && updateConnectedWorkerSharingMutation.variables?.workerId === worker.workerId;
              return (
                <div key={worker.workerId} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold text-slate-950">{worker.displayName}</div>
                        <Badge variant="outline">{worker.workerTypeLabel}</Badge>
                        <Badge variant="secondary">{worker.runtimeLabel}</Badge>
                        <Badge variant={worker.status === "online" ? "outline" : "secondary"} className={worker.status === "online" ? "border-emerald-200 text-emerald-700" : ""}>
                          {t(`settings.workers.connectedWorkers.status.${worker.status}`)}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                        <Badge variant="secondary">{t("settings.workers.connectedWorkers.machine")} {worker.machineName ?? worker.machineId ?? "-"}</Badge>
                        <Badge variant="secondary">{t("settings.workers.connectedWorkers.version")} {worker.runtimeVersion ?? "-"}</Badge>
                        <Badge variant="secondary">{t("settings.workers.connectedWorkers.lastSeen")} {worker.lastSeenAt ? formatDate(worker.lastSeenAt) : t("settings.workers.connectedWorkers.notSeenYet")}</Badge>
                        {worker.preferredProviderName ? <Badge variant="secondary">{worker.preferredProviderName}</Badge> : null}
                        {worker.permissionPreset ? <Badge variant="secondary">{worker.permissionPreset}</Badge> : null}
                        {worker.quotaDisplayLabel ? <Badge variant="secondary">{worker.quotaDisplayLabel}</Badge> : null}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      {worker.sharingMode === "private"
                        ? t("settings.workers.connectedWorkers.currentShare.private")
                        : worker.sharingMode === "tenant"
                          ? t("settings.workers.connectedWorkers.currentShare.tenant")
                          : t("settings.workers.connectedWorkers.currentShare.groups", { count: worker.sharedGroups.length })}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                      <div className="text-sm font-medium text-slate-900">
                        {t("settings.workers.connectedWorkers.identityTitle")}
                      </div>
                      <div className="mt-3 space-y-2 text-sm text-slate-600">
                        <div>{t("settings.workers.connectedWorkers.type")} <span className="font-medium text-slate-900">{worker.workerTypeLabel}</span></div>
                        <div>{t("settings.workers.connectedWorkers.runtime")} <span className="font-medium text-slate-900">{worker.runtimeLabel}</span></div>
                        <div>{t("settings.workers.connectedWorkers.family")} <span className="font-medium text-slate-900">{worker.runtimeFamily}</span></div>
                        <div>{t("settings.workers.connectedWorkers.externalRef")} <span className="font-mono text-xs text-slate-800">{worker.externalReference}</span></div>
                        <div>{t("settings.workers.connectedWorkers.scopeCount")} <span className="font-medium text-slate-900">{worker.permissionScopeCount}</span></div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-slate-900">
                            {t("settings.workers.connectedWorkers.shareTitle")}
                          </div>
                          <p className="mt-1 text-sm text-slate-600">
                            {t("settings.workers.connectedWorkers.shareDescription")}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4 lg:grid-cols-3">
                        {connectedWorkerSharingModeValues.map((mode) => (
                          <label key={mode} className="flex items-start gap-3 rounded-xl border border-white/80 bg-white px-3 py-3 text-sm text-slate-700 shadow-sm">
                            <input
                              type="radio"
                              name={`sharing-${worker.workerId}`}
                              checked={draft.sharingMode === mode}
                              onChange={() => updateSharingDraft(worker.workerId, {
                                sharingMode: mode,
                                groupIds: mode === "groups" ? draft.groupIds : [],
                              })}
                              className="mt-1 h-4 w-4"
                            />
                            <span>
                              <span className="block font-medium text-slate-900">
                                {t(`settings.workers.connectedWorkers.shareModes.${mode}.label`)}
                              </span>
                              <span className="block text-xs text-slate-500">
                                {t(`settings.workers.connectedWorkers.shareModes.${mode}.description`)}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>

                      {draft.sharingMode === "groups" && (
                        <div className="mt-4 rounded-xl border border-white/80 bg-white p-3">
                          <div className="text-sm font-medium text-slate-900">
                            {t("settings.workers.connectedWorkers.groupPickerTitle")}
                          </div>
                          <div className="mt-3 space-y-2">
                            {(groupsQuery.data ?? []).length === 0 ? (
                              <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
                                {t("settings.workers.connectedWorkers.noGroups")}
                              </div>
                            ) : (
                              (groupsQuery.data ?? []).map((group: any) => (
                                <label key={group.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                                  <span className="min-w-0">
                                    <span className="block font-medium text-slate-900">{group.name}</span>
                                    <span className="block text-xs text-slate-500">{group.role}</span>
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={draft.groupIds.includes(group.id)}
                                    onChange={(event) => toggleSharingGroup(worker.workerId, group.id, event.target.checked)}
                                  />
                                </label>
                              ))
                            )}
                          </div>
                        </div>
                      )}

                      <div className="mt-4 flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => resetConnectedWorkerSharing(worker)}
                          disabled={!isDirty || isSaving}
                        >
                          {t("settings.workers.connectedWorkers.reset")}
                        </Button>
                        <Button
                          type="button"
                          onClick={() => saveConnectedWorkerSharing(worker)}
                          disabled={!isDirty || isSaving || (draft.sharingMode === "groups" && draft.groupIds.length === 0)}
                        >
                          {isSaving ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="mr-2 h-4 w-4" />
                          )}
                          {t("settings.workers.connectedWorkers.save")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DashboardCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-2">
              <div className="font-medium">{t("settings.workers.guidanceTitle")}</div>
              <p>{injectTenantName(t("settings.workers.guidanceBody", { tenantName: resolvedTenantName }), resolvedTenantName)}</p>
              <ol className="list-decimal space-y-1 pl-5 text-blue-900/90">
                <li>{t("settings.workers.guide.step1")}</li>
                <li>{t("settings.workers.guide.step2")}</li>
                <li>{t("settings.workers.guide.step3")}</li>
                <li>{t("settings.workers.guide.step4")}</li>
                <li>{t("settings.workers.guide.step5")}</li>
              </ol>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm text-emerald-900">
          <div className="font-medium">{t("settings.workers.permissions.title")}</div>
          <p className="mt-1 text-emerald-800">
            {injectTenantName(t("settings.workers.permissions.summary", { tenantName: resolvedTenantName }), resolvedTenantName)}
          </p>
          <ul className="mt-3 space-y-2 text-emerald-800/90">
            <li>{t("settings.workers.permissions.tip1")}</li>
            <li>{t("settings.workers.permissions.tip2")}</li>
            <li>{t("settings.workers.permissions.tip3")}</li>
          </ul>
        </div>

        <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4 text-sm text-amber-900">
          <div className="font-medium">{t("settings.workers.quotas.title")}</div>
          <p className="mt-1 text-amber-800">{t("settings.workers.quotas.summary")}</p>
          <ul className="mt-3 space-y-2 text-amber-800/90">
            <li>{t("settings.workers.quotas.tip1")}</li>
            <li>{t("settings.workers.quotas.tip2")}</li>
            <li>{t("settings.workers.quotas.tip3")}</li>
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-800">
          <div className="font-medium">{t("settings.workers.safety.title")}</div>
          <ul className="mt-3 space-y-2 text-slate-700">
            <li>{t("settings.workers.safety.tip1")}</li>
            <li>{t("settings.workers.safety.tip2")}</li>
            <li>{t("settings.workers.safety.tip3")}</li>
            <li>{t("settings.workers.safety.tip4")}</li>
          </ul>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4 text-sm text-cyan-950 lg:col-span-2">
          <div className="font-medium">{t("settings.workers.connect.title")}</div>
          <p className="mt-1 text-cyan-900">
            {injectTenantName(t("settings.workers.connect.description", { tenantName: resolvedTenantName }), resolvedTenantName)}
          </p>
        </div>
        {connectionGuides.map((guide) => (
          <div key={guide.runtimeType} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-800">
            <div className="font-medium text-slate-900">{t(guide.titleKey)}</div>
            <p className="mt-1 text-slate-600">
              {injectTenantName(t(guide.descriptionKey), resolvedTenantName)}
            </p>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-slate-700">
              {guide.steps.map((stepKey) => (
                <li key={stepKey}>{t(stepKey)}</li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}
