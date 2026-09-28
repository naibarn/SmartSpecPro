import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "../../lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useScopedTranslation } from "../../i18n/useScopedTranslation";
import { Badge } from "@astryxdesign/core/Badge";
import { Button as ActionButton } from "@astryxdesign/core/Button";
import { List, ListItem } from "@astryxdesign/core/List";
import { DEFAULT_INFERENCE_ROUTER_POLICY } from "../../../../shared/inferenceRouterPolicy";

type ScopeType = "platform" | "tenant" | "principal";

function splitList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\n,]/)
        .map(item => item.trim())
        .filter(Boolean)
    ),
  ].sort();
}

function joinList(value: unknown): string {
  return Array.isArray(value)
    ? value.filter(item => typeof item === "string").join("\n")
    : "";
}

function diffPolicyFields(current: unknown, target: unknown) {
  const currentPolicy = current && typeof current === "object"
    ? current as Record<string, unknown>
    : {};
  const targetPolicy = target && typeof target === "object"
    ? target as Record<string, unknown>
    : {};
  return [...new Set([...Object.keys(currentPolicy), ...Object.keys(targetPolicy)])]
    .sort()
    .filter(key => JSON.stringify(currentPolicy[key]) !== JSON.stringify(targetPolicy[key]))
    .map(key => ({ key, current: currentPolicy[key], target: targetPolicy[key] }));
}

function InferenceConnectivityProbeRow({
  deploymentId,
  deploymentRevision,
  modelId,
  providerModelId,
  endpointSurface,
}: {
  deploymentId: string;
  deploymentRevision: string;
  modelId: string;
  providerModelId: string;
  endpointSurface: string;
}) {
  const { t } = useScopedTranslation("admin");
  const queryClient = useQueryClient();
  const runsQuery = trpc.llmProviders.listInferenceConnectivityProbeRuns.useQuery({
    deploymentId,
    limit: 5,
  });
  const runMutation = trpc.llmProviders.runInferenceConnectivityProbe.useMutation({
    onSuccess: async result => {
      setProbeMessage(t(`admin.llmProviders.probe.${result.status}`));
      await queryClient.invalidateQueries({
        queryKey: [["llmProviders", "listInferenceConnectivityProbeRuns"]],
      });
    },
    onError: () => setProbeMessage(t("admin.llmProviders.probe.requestFailed")),
  });
  const [probeMessage, setProbeMessage] = useState<string | null>(null);
  const [capabilityMessage, setCapabilityMessage] = useState<string | null>(null);
  const capabilityMutation = trpc.llmProviders.runInferenceCapabilityProbe.useMutation({
    onSuccess: async result => {
      setCapabilityMessage(
        result.status === "blocked"
          ? `${t("admin.llmProviders.capabilityProbe.blocked")}: ${result.reasonCode}`
          : `${t(`admin.llmProviders.capabilityProbe.${result.status}`)}${result.reasonCode ? ` · ${result.reasonCode}` : ""}`
      );
      await queryClient.invalidateQueries({
        queryKey: [["llmProviders", "listInferenceConnectivityProbeRuns"]],
      });
    },
    onError: () => setCapabilityMessage(t("admin.llmProviders.capabilityProbe.requestFailed")),
  });
  const certificationMutation = trpc.llmProviders.certifyInferenceProfileCandidate.useMutation({
    onSuccess: async result => {
      setCapabilityMessage(
        result.ok
          ? t("admin.llmProviders.profile.certified")
          : t("admin.llmProviders.profile.certificationBlocked")
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [["llmProviders", "listInferenceProfileCandidates"]],
        }),
        queryClient.invalidateQueries({
          queryKey: [["llmProviders", "listInferenceProfiles"]],
        }),
      ]);
    },
    onError: () => setCapabilityMessage(t("admin.llmProviders.profile.certificationFailed")),
  });
  const latest = runsQuery.data?.[0];
  const latestCapability = runsQuery.data?.find(run => run.probeKind === "capability_suite");
  const latestCapabilityResult = latestCapability?.resultJson as
    | { qualificationStatus?: string }
    | undefined;
  const capabilityPassed = latestCapability?.status === "passed" &&
    latestCapabilityResult?.qualificationStatus === "passed";
  const reportedQualificationStatus = latest?.probeKind === "capability_suite"
    ? (latest.resultJson as { qualificationStatus?: string }).qualificationStatus
    : undefined;
  const latestStatus = latest?.probeKind === "capability_suite"
    ? ["passed", "failed", "incomplete"].includes(reportedQualificationStatus ?? "")
      ? reportedQualificationStatus
      : "failed"
    : latest?.status;
  const latestBadge = latest?.probeKind === "capability_suite"
    ? latestStatus
      ? <Badge label={t(`admin.llmProviders.capabilityProbe.${latestStatus}`)} variant={latestStatus === "incomplete" ? "warning" : latestStatus === "passed" ? "success" : "error"} />
      : null
    : latestStatus === "passed"
    ? <Badge label={t("admin.llmProviders.probe.passed")} variant="success" />
    : latestStatus === "failed"
      ? <Badge label={t("admin.llmProviders.probe.failed")} variant="error" />
      : latestStatus === "blocked"
        ? <Badge label={t("admin.llmProviders.probe.blocked")} variant="warning" />
        : null;

  return (
    <ListItem
      label={`${modelId} · ${deploymentRevision}`}
      description={
        <>
          <p>{`${providerModelId} · ${endpointSurface}`}</p>
          <p>
          {runsQuery.isError
            ? t("admin.llmProviders.probe.historyFailed")
            : latest
              ? `${t("admin.llmProviders.probe.latest")}: ${latest.runId.slice(0, 8)} · ${new Date(latest.finishedAt).toLocaleString()}`
              : t("admin.llmProviders.probe.notRun")}
            {latestBadge ? <> · {latestBadge}</> : null}
          </p>
        </>
      }
      endContent={
        <span className="flex flex-col items-end gap-1">
          <span className="max-w-md text-right text-xs text-muted-foreground">
            {t("admin.llmProviders.capabilityProbe.description")}
          </span>
          <ActionButton
            label={t("admin.llmProviders.probe.run")}
            variant="secondary"
            size="sm"
            isLoading={runMutation.isPending}
            isDisabled={runsQuery.isLoading || runMutation.isPending}
            onClick={() => {
              setProbeMessage(null);
              runMutation.mutate({ deploymentId });
            }}
          >
            {runMutation.isPending
              ? t("admin.llmProviders.probe.running")
              : t("admin.llmProviders.probe.run")}
          </ActionButton>
          {capabilityPassed ? (
            <ActionButton
              label={t("admin.llmProviders.profile.certify")}
              variant="secondary"
              size="sm"
              isLoading={certificationMutation.isPending}
              isDisabled={runsQuery.isLoading || certificationMutation.isPending}
              onClick={() => certificationMutation.mutate({ deploymentId })}
            >
              {certificationMutation.isPending
                ? t("admin.llmProviders.profile.certifying")
                : t("admin.llmProviders.profile.certify")}
            </ActionButton>
          ) : null}
          <ActionButton
            label={t("admin.llmProviders.capabilityProbe.run")}
            variant="secondary"
            size="sm"
            isLoading={capabilityMutation.isPending}
            isDisabled={runsQuery.isLoading || runMutation.isPending || capabilityMutation.isPending}
            onClick={() => {
              setCapabilityMessage(null);
              capabilityMutation.mutate({ deploymentId });
            }}
          >
            {capabilityMutation.isPending
              ? t("admin.llmProviders.capabilityProbe.running")
              : t("admin.llmProviders.capabilityProbe.run")}
          </ActionButton>
          {probeMessage ? <span role="status">{probeMessage}</span> : null}
          {capabilityMessage ? <span role="status">{capabilityMessage}</span> : null}
        </span>
      }
    />
  );
}

export function AdminInferencePolicyPanel() {
  const { t } = useScopedTranslation("admin");
  const queryClient = useQueryClient();
  const [scopeType, setScopeType] = useState<ScopeType>("platform");
  const [tenantId, setTenantId] = useState("");
  const [principalRef, setPrincipalRef] = useState("");
  const [ready, setReady] = useState(false);
  const [requireZeroDataRetention, setRequireZeroDataRetention] =
    useState(false);
  const [providerIds, setProviderIds] = useState("");
  const [regions, setRegions] = useState("");
  const [credentialOwners, setCredentialOwners] = useState("");
  const [scoreCalibrationRevision, setScoreCalibrationRevision] = useState(
    DEFAULT_INFERENCE_ROUTER_POLICY.scoreCalibrationRevision
  );
  const [routingWeights, setRoutingWeights] = useState(
    DEFAULT_INFERENCE_ROUTER_POLICY.weights
  );
  const [revokeTargetType, setRevokeTargetType] = useState<"model" | "deployment">("deployment");
  const [revokeTargetId, setRevokeTargetId] = useState("");
  const [revokeExpiry, setRevokeExpiry] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [profileJson, setProfileJson] = useState("");
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [selectedPolicyRevision, setSelectedPolicyRevision] = useState("");

  const policiesQuery = trpc.llmProviders.listInferencePolicies.useQuery();
  const profilesQuery = trpc.llmProviders.listInferenceProfileCandidates.useQuery();
  const activeProfilesQuery = trpc.llmProviders.listInferenceProfiles.useQuery();
  const revocationsQuery = trpc.llmProviders.listInferenceRevocations.useQuery(
    {
      tenantId: tenantId.trim(),
      ...(scopeType === "principal" && principalRef.trim()
        ? { principalRef: principalRef.trim() }
        : {}),
    },
    { enabled: scopeType !== "platform" && tenantId.trim().length > 0 }
  );
  const heads = policiesQuery.data ?? [];
  const scopeKey =
    scopeType === "platform"
      ? "platform"
      : scopeType === "tenant"
        ? tenantId.trim()
        : `${tenantId.trim()}:${principalRef.trim()}`;
  const current = useMemo(
    () =>
      heads.find(
        head => head.scopeType === scopeType && head.scopeKey === scopeKey
      ),
    [heads, scopeKey, scopeType]
  );
  const policyRevisionScopeReady =
    scopeType === "platform" ||
    (tenantId.trim().length > 0 &&
      (scopeType === "tenant" || principalRef.trim().length > 0));
  const policyHistoryQuery = trpc.llmProviders.listInferencePolicyRevisions.useQuery(
    { scopeType, scopeKey, limit: 50 },
    { enabled: policyRevisionScopeReady }
  );
  const policyRevisionHistory = policyHistoryQuery.data?.revisions ?? [];
  const selectedPolicyVersion = policyRevisionHistory.find(
    item => item.revision === selectedPolicyRevision
  );
  const policyRevisionDiff = selectedPolicyVersion && current
    ? diffPolicyFields(current.policyJson, selectedPolicyVersion.policyJson)
    : [];

  useEffect(() => {
    const policy = current?.policyJson;
    setReady(policy?.ready === true);
    setRequireZeroDataRetention(policy?.requireZeroDataRetention === true);
    setProviderIds(joinList(policy?.allowedProviderIds));
    setRegions(joinList(policy?.allowedRegions));
    setCredentialOwners(joinList(policy?.allowedCredentialOwnerRefs));
    const routingPolicy = policy?.routingPolicy;
    setScoreCalibrationRevision(
      typeof routingPolicy?.scoreCalibrationRevision === "string"
        ? routingPolicy.scoreCalibrationRevision
        : DEFAULT_INFERENCE_ROUTER_POLICY.scoreCalibrationRevision
    );
    setRoutingWeights(
      routingPolicy?.weights ?? DEFAULT_INFERENCE_ROUTER_POLICY.weights
    );
  }, [current]);

  const publishMutation = trpc.llmProviders.publishInferencePolicy.useMutation({
    onSuccess: async result => {
      setStatus(`${t("admin.llmProviders.policy.saved")} ${result.revision}`);
      await queryClient.invalidateQueries({
        queryKey: [["llmProviders", "listInferencePolicies"]],
      });
      await queryClient.invalidateQueries({
        queryKey: [["llmProviders", "listInferencePolicyRevisions"]],
      });
      await queryClient.invalidateQueries({
        queryKey: [["llmProviders", "listInferenceRevocations"]],
      });
    },
    onError: error => setStatus(error.message),
  });

  const rollbackPolicyMutation = trpc.llmProviders.rollbackInferencePolicy.useMutation({
    onSuccess: async result => {
      setStatus(
        result.changed
          ? `${t("admin.llmProviders.policy.rolledBack")} ${result.revision}`
          : t("admin.llmProviders.policy.alreadyCurrent")
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [["llmProviders", "listInferencePolicies"]],
        }),
        queryClient.invalidateQueries({
          queryKey: [["llmProviders", "listInferencePolicyRevisions"]],
        }),
      ]);
    },
    onError: error => setStatus(error.message),
  });

  const revokeMutation = trpc.llmProviders.createInferenceRevocation.useMutation({
    onSuccess: async () => {
      setStatus(t("admin.llmProviders.policy.revoked"));
      await queryClient.invalidateQueries({
        queryKey: [["llmProviders", "listInferencePolicies"]],
      });
      setRevokeTargetId("");
      setRevokeExpiry("");
    },
    onError: error => setStatus(error.message),
  });

  const publishProfileMutation =
    trpc.llmProviders.publishInferenceProfile.useMutation({
      onSuccess: async result => {
        if (result.ok) {
          setProfileStatus(
            `${t("admin.llmProviders.profile.published")}: ${result.deploymentRevision}`
          );
          setProfileJson("");
          await queryClient.invalidateQueries({
            queryKey: [["llmProviders", "listInferenceProfileCandidates"]],
          });
          return;
        }
        const fieldDetails =
          result.code === "PROFILE_INVALID" && result.fields?.length
            ? ` (${result.fields.join(", ")})`
            : "";
        const messageKey =
          result.code === "SERVER_PROBE_REQUIRED_FOR_ACTIVATION"
            ? "admin.llmProviders.profile.activationBlocked"
            : result.code === "PROFILE_REVISION_CONFLICT"
              ? "admin.llmProviders.profile.revisionConflict"
              : "admin.llmProviders.profile.invalid";
        setProfileStatus(`${t(messageKey)}${fieldDetails}`);
      },
      onError: () =>
        setProfileStatus(t("admin.llmProviders.profile.publishFailed")),
    });

  const publishProfile = () => {
    let profileInput: unknown;
    try {
      profileInput = JSON.parse(profileJson);
    } catch {
      setProfileStatus(t("admin.llmProviders.profile.invalidJson"));
      return;
    }
    setProfileStatus(null);
    publishProfileMutation.mutate({ profileInput });
  };

  const canPublish =
    scopeType === "platform" ||
    (tenantId.trim().length > 0 &&
      (scopeType === "tenant" || principalRef.trim().length > 0));
  const routingWeightTotal = Object.values(routingWeights).reduce(
    (total, weight) => total + Number(weight),
    0
  );
  const routingPolicyValid =
    scopeType !== "platform" ||
    (scoreCalibrationRevision.trim().length > 0 && routingWeightTotal === 1_000_000);

  const publish = () => {
    const policy = {
      ready,
      requireZeroDataRetention,
      allowedProviderIds: splitList(providerIds),
      allowedRegions: splitList(regions),
      allowedCredentialOwnerRefs: splitList(credentialOwners),
      ...(scopeType === "platform"
        ? {
            routingPolicy: {
              scoreCalibrationRevision: scoreCalibrationRevision.trim(),
              weights: routingWeights,
            },
          }
        : {}),
    };
    if (scopeType === "platform") {
      publishMutation.mutate({ scopeType, policy });
    } else if (scopeType === "tenant") {
      publishMutation.mutate({ scopeType, tenantId: tenantId.trim(), policy });
    } else {
      publishMutation.mutate({
        scopeType,
        tenantId: tenantId.trim(),
        principalRef: principalRef.trim(),
        policy,
      });
    }
  };

  const revoke = () => {
    if (scopeType === "platform" || !tenantId.trim() || !revokeTargetId.trim() || !revokeExpiry) return;
    const expiry = new Date(revokeExpiry);
    if (!Number.isFinite(expiry.getTime())) return;
    revokeMutation.mutate({
      scopeType,
      tenantId: tenantId.trim(),
      ...(scopeType === "principal" ? { principalRef: principalRef.trim() } : {}),
      targetType: revokeTargetType,
      targetId: revokeTargetId.trim(),
      reasonCode: "operator_action",
      expiresAt: expiry.toISOString(),
    });
  };

  return (
    <section
      aria-labelledby="inference-policy-title"
      className="mb-8 rounded-xl border border-border/60 bg-card p-5 shadow-sm sm:p-6"
    >
      <header className="mb-5">
        <h2
          id="inference-policy-title"
          className="text-lg font-semibold text-foreground"
        >
          {t("admin.llmProviders.policy.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("admin.llmProviders.policy.description")}
        </p>
      </header>

      <fieldset className="grid gap-4 md:grid-cols-2">
        <Label className="grid gap-2">
          {t("admin.llmProviders.policy.scope")}
          <select
            aria-label={t("admin.llmProviders.policy.scope")}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={scopeType}
            onChange={event => setScopeType(event.target.value as ScopeType)}
          >
            <option value="platform">
              {t("admin.llmProviders.policy.platform")}
            </option>
            <option value="tenant">
              {t("admin.llmProviders.policy.tenant")}
            </option>
            <option value="principal">
              {t("admin.llmProviders.policy.principal")}
            </option>
          </select>
        </Label>
        {scopeType !== "platform" && (
          <Label className="grid gap-2">
            {t("admin.llmProviders.policy.tenantId")}
            <Input
              value={tenantId}
              onChange={event => setTenantId(event.target.value)}
            />
          </Label>
        )}
        {scopeType === "principal" && (
          <Label className="grid gap-2">
            {t("admin.llmProviders.policy.principalId")}
            <Input
              value={principalRef}
              onChange={event => setPrincipalRef(event.target.value)}
            />
          </Label>
        )}
        <Label className="grid gap-2">
          {t("admin.llmProviders.policy.providers")}
          <Textarea
            rows={3}
            value={providerIds}
            onChange={event => setProviderIds(event.target.value)}
            placeholder="openai&#10;anthropic"
          />
        </Label>
        <Label className="grid gap-2">
          {t("admin.llmProviders.policy.regions")}
          <Textarea
            rows={3}
            value={regions}
            onChange={event => setRegions(event.target.value)}
            placeholder="TH&#10;SG"
          />
        </Label>
        <Label className="grid gap-2 md:col-span-2">
          {t("admin.llmProviders.policy.credentialOwners")}
          <Textarea
            rows={3}
            value={credentialOwners}
            onChange={event => setCredentialOwners(event.target.value)}
            placeholder="platform:default"
          />
        </Label>
      </fieldset>

      {scopeType === "platform" && (
        <fieldset className="mt-4 grid gap-4 rounded-md border border-border/60 p-4 sm:grid-cols-2">
          <legend className="px-2 text-sm font-medium">
            {t("admin.llmProviders.policy.routingTitle")}
          </legend>
          <Label className="grid gap-2 sm:col-span-2">
            {t("admin.llmProviders.policy.scoreCalibrationRevision")}
            <Input
              value={scoreCalibrationRevision}
              onChange={event => setScoreCalibrationRevision(event.target.value)}
              maxLength={256}
            />
          </Label>
          {([
            ["qualityPpm", "quality"],
            ["costPpm", "cost"],
            ["latencyPpm", "latency"],
            ["reliabilityPpm", "reliability"],
            ["compatibilityPpm", "compatibility"],
          ] as const).map(([key, labelKey]) => (
            <Label className="grid gap-2" key={key}>
              {t(`admin.llmProviders.policy.weight.${labelKey}`)}
              <Input
                type="number"
                min={0}
                max={1_000_000}
                step={1}
                value={routingWeights[key]}
                onChange={event =>
                  setRoutingWeights(current => ({
                    ...current,
                    [key]: Number(event.target.value),
                  }))
                }
              />
            </Label>
          ))}
          <p className="text-xs text-muted-foreground sm:col-span-2" role="status">
            {t("admin.llmProviders.policy.weightTotal", {
              total: routingWeightTotal.toLocaleString(),
            })}
          </p>
        </fieldset>
      )}

      <fieldset className="mt-4 grid gap-3 sm:grid-cols-2">
        <Label className="flex items-center gap-3">
          <Switch checked={ready} onCheckedChange={setReady} />
          {t("admin.llmProviders.policy.ready")}
        </Label>
        <Label className="flex items-center gap-3">
          <Switch
            checked={requireZeroDataRetention}
            onCheckedChange={setRequireZeroDataRetention}
          />
          {t("admin.llmProviders.policy.requireZdr")}
        </Label>
      </fieldset>

      <footer className="mt-5 flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p
          className="text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {policiesQuery.isLoading
            ? t("admin.llmProviders.policy.loading")
            : current
              ? `${t("admin.llmProviders.policy.currentRevision")}: ${current.revision}`
              : t("admin.llmProviders.policy.noPolicy")}
          {status ? ` · ${status}` : ""}
        </p>
        <Button
          type="button"
          disabled={
            !canPublish || !routingPolicyValid || policiesQuery.isLoading || publishMutation.isPending
          }
          onClick={publish}
        >
          {publishMutation.isPending
            ? t("admin.llmProviders.policy.saving")
            : t("admin.llmProviders.policy.publish")}
        </Button>
      </footer>

      <section className="mt-6 border-t border-border/60 pt-5" aria-labelledby="inference-policy-history-title">
        <h3 id="inference-policy-history-title" className="text-base font-semibold text-foreground">
          {t("admin.llmProviders.policy.revisionHistory")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("admin.llmProviders.policy.revisionHistoryDescription")}
        </p>
        {policyHistoryQuery.isLoading ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("admin.llmProviders.policy.loading")}</p>
        ) : policyHistoryQuery.isError ? (
          <p className="mt-3 text-sm text-destructive" role="status">{t("admin.llmProviders.policy.historyFailed")}</p>
        ) : policyRevisionHistory.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("admin.llmProviders.policy.noRevisionHistory")}</p>
        ) : (
          <fieldset className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Label className="grid gap-2">
              {t("admin.llmProviders.policy.compareRevision")}
              <select
                aria-label={t("admin.llmProviders.policy.compareRevision")}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={selectedPolicyRevision}
                onChange={event => setSelectedPolicyRevision(event.target.value)}
              >
                <option value="">{t("admin.llmProviders.policy.selectRevision")}</option>
                {policyRevisionHistory.map(item => (
                  <option value={item.revision} key={item.revision}>
                    {`${item.revision.slice(0, 24)} · ${new Date(item.createdAt).toLocaleString()}`}
                  </option>
                ))}
              </select>
            </Label>
            <Button
              type="button"
              variant="outline"
              className="self-end"
              disabled={
                !current ||
                !selectedPolicyVersion ||
                selectedPolicyVersion.revision === current.revision ||
                rollbackPolicyMutation.isPending
              }
              onClick={() => {
                if (!selectedPolicyVersion) return;
                rollbackPolicyMutation.mutate({
                  scopeType,
                  scopeKey,
                  revision: selectedPolicyVersion.revision,
                });
              }}
            >
              {rollbackPolicyMutation.isPending
                ? t("admin.llmProviders.policy.rollingBack")
                : t("admin.llmProviders.policy.rollback")}
            </Button>
            {selectedPolicyVersion && (
              <section className="grid gap-2 sm:col-span-2" aria-live="polite">
                <p className="text-xs text-muted-foreground">
                  {t("admin.llmProviders.policy.revisionAuthoredBy", {
                    id: selectedPolicyVersion.createdByUserId ?? "system",
                  })}
                </p>
                {selectedPolicyVersion.revision === current?.revision ? (
                  <p className="text-sm text-muted-foreground">{t("admin.llmProviders.policy.currentRevisionSelected")}</p>
                ) : policyRevisionDiff.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("admin.llmProviders.policy.noRevisionDiff")}</p>
                ) : (
                  <ul className="grid gap-2">
                    {policyRevisionDiff.map(item => (
                      <li className="grid gap-1 rounded-md border border-border/60 p-3 text-xs" key={item.key}>
                        <strong>{item.key}</strong>
                        <span>{`${t("admin.llmProviders.policy.currentValue")}: ${JSON.stringify(item.current) ?? "∅"}`}</span>
                        <span>{`${t("admin.llmProviders.policy.selectedValue")}: ${JSON.stringify(item.target) ?? "∅"}`}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </fieldset>
        )}
        {policyHistoryQuery.data?.events && policyHistoryQuery.data.events.length > 0 && (
          <List className="mt-4">
            {policyHistoryQuery.data.events.map((event, index) => (
              <ListItem
                key={`${event.createdAt}-${index}`}
                label={t(`admin.llmProviders.policy.event.${event.action}`)}
                description={`${event.fromRevision?.slice(0, 20) ?? "∅"} → ${event.toRevision.slice(0, 20)} · ${t("admin.llmProviders.policy.revisionAuthoredBy", { id: event.actorUserId ?? "system" })} · ${new Date(event.createdAt).toLocaleString()}`}
              />
            ))}
          </List>
        )}
      </section>

      <section className="mt-6 border-t border-border/60 pt-5" aria-labelledby="inference-probes-title">
        <h3 id="inference-probes-title" className="text-base font-semibold text-foreground">
          {t("admin.llmProviders.probe.title")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("admin.llmProviders.probe.description")}
        </p>
        {profilesQuery.isLoading ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("admin.llmProviders.policy.loading")}</p>
        ) : profilesQuery.isError || (profilesQuery.data && !profilesQuery.data.ok) ? (
          <p className="mt-3 text-sm text-destructive" role="status">{t("admin.llmProviders.probe.loadFailed")}</p>
        ) : profilesQuery.data?.ok && profilesQuery.data.profiles.length > 0 ? (
          <List density="compact" hasDividers>
            {profilesQuery.data.profiles.map(profile => (
              <InferenceConnectivityProbeRow
                key={`${profile.deployment.deploymentId}:${profile.deployment.revision}`}
                deploymentId={profile.deployment.deploymentId}
                deploymentRevision={profile.deployment.revision}
                modelId={profile.model.logicalModelId}
                providerModelId={profile.model.providerNativeModelId}
                endpointSurface={profile.deployment.endpointSurface}
              />
            ))}
          </List>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{t("admin.llmProviders.probe.noProfiles")}</p>
        )}
      </section>

      <section className="mt-6 border-t border-border/60 pt-5" aria-labelledby="inference-active-profiles-title">
        <h3 id="inference-active-profiles-title" className="text-base font-semibold text-foreground">
          {t("admin.llmProviders.profile.activeTitle")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("admin.llmProviders.profile.activeDescription")}
        </p>
        {activeProfilesQuery.isLoading ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("admin.llmProviders.policy.loading")}</p>
        ) : activeProfilesQuery.isError || !activeProfilesQuery.data?.ok ? (
          <p className="mt-3 text-sm text-destructive" role="status">{t("admin.llmProviders.profile.activeLoadFailed")}</p>
        ) : activeProfilesQuery.data.profiles.length > 0 ? (
          <List density="compact" hasDividers>
            {activeProfilesQuery.data.profiles.map(profile => (
              <ListItem
                key={`${profile.deployment.deploymentId}:${profile.deployment.revision}`}
                label={`${profile.model.logicalModelId} · ${profile.deployment.revision}`}
                description={`${profile.model.providerNativeModelId} · ${profile.deployment.providerId} · ${profile.deployment.region} · ${profile.deployment.probe.evidenceRef}`}
                endContent={<Badge label={t("admin.llmProviders.profile.activeStatus")} variant="success" />}
              />
            ))}
          </List>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{t("admin.llmProviders.profile.noActiveProfiles")}</p>
        )}
      </section>

      <section
        className="mt-6 border-t border-border/60 pt-5"
        aria-labelledby="inference-profile-title"
      >
        <h3
          id="inference-profile-title"
          className="text-base font-semibold text-foreground"
        >
          {t("admin.llmProviders.profile.title")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("admin.llmProviders.profile.description")}
        </p>
        <Label className="mt-3 grid gap-2">
          {t("admin.llmProviders.profile.jsonLabel")}
          <Textarea
            aria-label={t("admin.llmProviders.profile.jsonLabel")}
            rows={12}
            value={profileJson}
            onChange={event => setProfileJson(event.target.value)}
            placeholder='{"model": { ... }, "deployment": { ... }}'
            spellCheck={false}
          />
        </Label>
        <footer className="mt-3 flex flex-col gap-3 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
            {profileStatus ?? t("admin.llmProviders.profile.candidateOnly")}
          </p>
          <Button
            type="button"
            disabled={!profileJson.trim() || publishProfileMutation.isPending}
            onClick={publishProfile}
          >
            {publishProfileMutation.isPending
              ? t("admin.llmProviders.profile.publishing")
              : t("admin.llmProviders.profile.publish")}
          </Button>
        </footer>
      </section>

      <section className="mt-6 border-t border-border/60 pt-5" aria-labelledby="inference-revocation-title">
        <h3 id="inference-revocation-title" className="text-base font-semibold text-foreground">
          {t("admin.llmProviders.policy.emergencyRevocation")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("admin.llmProviders.policy.revocationDescription")}
        </p>
        <fieldset className="mt-4 grid gap-4 md:grid-cols-2">
          <Label className="grid gap-2">
            {t("admin.llmProviders.policy.revokeTargetType")}
            <select
              aria-label={t("admin.llmProviders.policy.revokeTargetType")}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={revokeTargetType}
              onChange={event => setRevokeTargetType(event.target.value as "model" | "deployment")}
            >
              <option value="deployment">{t("admin.llmProviders.policy.deployment")}</option>
              <option value="model">{t("admin.llmProviders.policy.model")}</option>
            </select>
          </Label>
          <Label className="grid gap-2">
            {t("admin.llmProviders.policy.revokeTargetId")}
            <Input value={revokeTargetId} onChange={event => setRevokeTargetId(event.target.value)} />
          </Label>
          <Label className="grid gap-2">
            {t("admin.llmProviders.policy.revokeExpiry")}
            <Input type="datetime-local" value={revokeExpiry} onChange={event => setRevokeExpiry(event.target.value)} />
          </Label>
        </fieldset>
        <footer className="mt-4 flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {scopeType === "platform"
              ? t("admin.llmProviders.policy.revokeTenantOnly")
              : t("admin.llmProviders.policy.revokeExpiryRequired")}
          </p>
          <Button
            type="button"
            variant="destructive"
            disabled={scopeType === "platform" || !tenantId.trim() || !revokeTargetId.trim() || !revokeExpiry || revokeMutation.isPending}
            onClick={revoke}
          >
            {revokeMutation.isPending
              ? t("admin.llmProviders.policy.revoking")
              : t("admin.llmProviders.policy.revoke")}
          </Button>
        </footer>
        {scopeType !== "platform" && tenantId.trim() && (
          <div className="mt-4" aria-live="polite">
            <h4 className="text-sm font-semibold text-foreground">
              {t("admin.llmProviders.policy.revocationHistory")}
            </h4>
            {revocationsQuery.isLoading ? (
              <p className="mt-2 text-sm text-muted-foreground">{t("admin.llmProviders.policy.loading")}</p>
            ) : (revocationsQuery.data ?? []).length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{t("admin.llmProviders.policy.noRevocations")}</p>
            ) : (
              <ul className="mt-2 grid gap-2">
                {(revocationsQuery.data ?? []).map(item => (
                  <li key={item.id} className="rounded-md border border-border/60 p-3 text-sm">
                    <p className="font-medium">{item.targetType}: {item.targetId}</p>
                    <p className="text-muted-foreground">
                      {item.reasonCode} · {t("admin.llmProviders.policy.revocationActor", { id: item.createdByUserId ?? "system" })} · {new Date(item.createdAt).toLocaleString()} · {item.expiresAt && new Date(item.expiresAt).getTime() > Date.now()
                        ? t("admin.llmProviders.policy.revocationActiveUntil", { date: new Date(item.expiresAt).toLocaleString() })
                        : t("admin.llmProviders.policy.revocationExpired")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </section>
  );
}
