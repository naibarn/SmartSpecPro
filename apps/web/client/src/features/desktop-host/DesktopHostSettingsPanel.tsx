import { useEffect, useMemo, useState } from "react";

import type {
  DesktopDeviceActionRequest,
  DesktopDeviceControlPlaneState,
  DesktopHostDeviceStatusResponse,
  DesktopHostFeatureFlags,
  DesktopPackageCatalogResponse,
  DesktopDevicePolicyOverrides,
  DesktopRegisteredDeviceSummary,
  DesktopRootWritebackMode,
  DesktopRolloutGateState,
  DesktopWorkspaceProfile,
} from "@shared/desktopHost";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

import { desktopPackageStateLabels, desktopTrustClassLabels } from "./labels";
import { DesktopHostBootstrapCard } from "./DesktopHostBootstrapCard";
import { DesktopHostRolloutGatePanel } from "./DesktopHostRolloutGatePanel";
import { LocalFileRootsPanel } from "./local-files/LocalFileRootsPanel";
import { DesktopRunBadgeRow } from "./runs/DesktopRunBadgeRow";

function buildPreviewWorkspaceProfile(
  featureFlags: DesktopHostFeatureFlags,
): DesktopWorkspaceProfile {
  return {
    profileName: featureFlags.desktopAdvancedLocalMode
      ? "advanced_local"
      : "standard_managed",
    networkClass: featureFlags.desktopAdvancedLocalMode
      ? "approved_public_web"
      : "gateway_only",
    cpuLimit: featureFlags.desktopAdvancedLocalMode ? 8 : 4,
    memoryMb: featureFlags.desktopAdvancedLocalMode ? 8192 : 4096,
    mounts: [],
    outputDirectoryName: "outputs",
    connectorSidecarAllowed: featureFlags.desktopAgencyRuntime,
    writebackMode: featureFlags.desktopAdvancedLocalMode
      ? "advanced_local_override"
      : "managed_output_only",
  };
}

function buildFallbackRolloutGates(
  featureFlags: DesktopHostFeatureFlags,
): DesktopRolloutGateState[] {
  return [
    {
      gate: "device_binding_ready",
      satisfied: featureFlags.desktopHostEnabled,
      reason: featureFlags.desktopHostEnabled
        ? "proof_of_possession_device_binding_live"
        : "desktop_host_feature_flag_disabled",
    },
    {
      gate: "signed_packages_enforced",
      satisfied: featureFlags.desktopPackageSync,
      reason: featureFlags.desktopPackageSync
        ? "signed_package_verification_required"
        : "desktop_package_sync_flag_disabled",
    },
    {
      gate: "signed_updates_enforced",
      satisfied: true,
      reason: "signed_update_verification_required",
    },
    {
      gate: "managed_file_roots_default",
      satisfied: true,
      reason: "managed_file_roots_are_default",
    },
    {
      gate: "pi_gateway_only",
      satisfied: featureFlags.desktopHostEnabled,
      reason: featureFlags.desktopHostEnabled
        ? "pi_gateway_injection_enforced"
        : "desktop_host_feature_flag_disabled",
    },
    {
      gate: "agency_gateway_only",
      satisfied: featureFlags.desktopAgencyRuntime,
      reason: featureFlags.desktopAgencyRuntime
        ? "agency_gateway_injection_enforced"
        : "desktop_agency_runtime_flag_disabled",
    },
    {
      gate: "offboarding_cleanup_ready",
      satisfied: true,
      reason: "offboarding_cleanup_and_purge_live",
    },
  ];
}

function buildBootstrapSteps(input: {
  featureFlags: DesktopHostFeatureFlags;
  devices: DesktopRegisteredDeviceSummary[];
  selectedDevice: DesktopRegisteredDeviceSummary | null;
  packageCatalog: DesktopPackageCatalogResponse | null;
  localRootsCount: number;
}) {
  const syncStatus = input.selectedDevice?.packageSyncState.syncStatus ?? "idle";
  const syncDone = syncStatus === "ready" || syncStatus === "syncing";

  return [
    { id: "signin", title: "Sign in", status: "done" as const },
    {
      id: "device-registration",
      title: "Register device",
      status: input.devices.length > 0 ? "done" : "pending",
    },
    {
      id: "roots",
      title: "Approve local roots",
      status: input.localRootsCount > 0 ? "done" : "pending",
    },
    {
      id: "package-sync",
      title: "Sync signed packages",
      status: syncDone || (input.packageCatalog?.packages.length ?? 0) > 0 ? "done" : "pending",
    },
    {
      id: "agency-runtime",
      title: "Enable Agency Swarm runtime",
      status: input.featureFlags.desktopAgencyRuntime ? "done" : "pending",
    },
  ] satisfies {
    id: string;
    title: string;
    status: "pending" | "done";
  }[];
}

function formatTimestamp(value?: string | null) {
  if (!value) {
    return "Not reported yet";
  }

  return value.replace("T", " ").replace(".000Z", "Z");
}

function formatBytes(value: number) {
  if (value >= 1_048_576) {
    return `${(value / 1_048_576).toFixed(value % 1_048_576 === 0 ? 0 : 1)} MB`;
  }
  if (value >= 1024) {
    return `${Math.round(value / 1024)} KB`;
  }
  return `${value} B`;
}

function formatWorkspaceProfile(profile: DesktopWorkspaceProfile | null | undefined) {
  if (!profile) {
    return "Not reported yet";
  }
  return `${profile.profileName} / ${profile.networkClass}`;
}

function formatStateLabel(value: string) {
  return value.replace(/_/g, " ");
}

function formatPresence(device: DesktopRegisteredDeviceSummary) {
  const presence = device.presence ?? {
    status: device.healthStatus === "disabled" ? "disabled" : "offline",
    lastSeenAgeSeconds: null,
  };
  if (presence.status === "disabled") {
    return "Disabled";
  }
  if (presence.lastSeenAgeSeconds == null) {
    return presence.status === "offline" ? "Offline" : "Not reported yet";
  }
  if (presence.lastSeenAgeSeconds < 60) {
    return `Seen ${presence.lastSeenAgeSeconds}s ago`;
  }
  const minutes = Math.round(presence.lastSeenAgeSeconds / 60);
  if (minutes < 60) {
    return `Seen ${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  return `Seen ${hours}h ago`;
}

type PolicyToggleChoice = "inherit" | "allow" | "restrict";

function overrideToChoice(value: boolean | null | undefined): PolicyToggleChoice {
  if (value === true) {
    return "allow";
  }
  if (value === false) {
    return "restrict";
  }
  return "inherit";
}

function choiceToOverride(value: PolicyToggleChoice): boolean | null {
  if (value === "allow") {
    return true;
  }
  if (value === "restrict") {
    return false;
  }
  return null;
}

function buildPolicyFormState(overrides: DesktopDevicePolicyOverrides | null | undefined) {
  return {
    allowAdvancedLocalMode: overrideToChoice(overrides?.allowAdvancedLocalMode),
    allowPackageSync: overrideToChoice(overrides?.allowPackageSync),
    allowAgencyRuntime: overrideToChoice(overrides?.allowAgencyRuntime),
    allowWorkerProjection: overrideToChoice(overrides?.allowWorkerProjection),
    maxLocalRoots: overrides?.maxLocalRoots != null ? String(overrides.maxLocalRoots) : "",
    outputWritebackMode: overrides?.outputWritebackMode ?? "inherit",
  };
}

function buildPolicyOverridePayload(state: ReturnType<typeof buildPolicyFormState>): DesktopDevicePolicyOverrides {
  const parsedMaxLocalRoots = Number.parseInt(state.maxLocalRoots, 10);
  return {
    allowAdvancedLocalMode: choiceToOverride(state.allowAdvancedLocalMode),
    allowPackageSync: choiceToOverride(state.allowPackageSync),
    allowAgencyRuntime: choiceToOverride(state.allowAgencyRuntime),
    allowWorkerProjection: choiceToOverride(state.allowWorkerProjection),
    maxLocalRoots: Number.isInteger(parsedMaxLocalRoots) && parsedMaxLocalRoots > 0
      ? parsedMaxLocalRoots
      : null,
    outputWritebackMode: state.outputWritebackMode === "inherit"
      ? null
      : state.outputWritebackMode as DesktopRootWritebackMode,
  };
}

function isTenantContextMissingError(error: string | null | undefined): boolean {
  return error === "desktop_host_tenant_required" || error === "desktop_host_tenant_mismatch";
}

export function DesktopHostSettingsPanel(props: {
  featureFlags: DesktopHostFeatureFlags;
  status?: DesktopHostDeviceStatusResponse | null;
  statusLoading?: boolean;
  statusError?: string | null;
  selectedDeviceId?: string | null;
  onSelectedDeviceIdChange?: (deviceId: string) => void;
  controlPlaneState?: DesktopDeviceControlPlaneState | null;
  controlPlaneLoading?: boolean;
  controlPlaneError?: string | null;
  packageCatalog?: DesktopPackageCatalogResponse | null;
  packageCatalogLoading?: boolean;
  packageCatalogError?: string | null;
  onDisableDevice?: (deviceId: string) => Promise<void> | void;
  disableInFlightDeviceId?: string | null;
  onRequestRootAction?: (
    deviceId: string,
    rootId: string,
    actionType: "reindex_root" | "purge_root_derived_store" | "revoke_root",
  ) => Promise<void> | void;
  rootActionInFlightKey?: string | null;
  onRequestDeviceAction?: (
    deviceId: string,
    actionType: DesktopDeviceActionRequest["actionType"],
  ) => Promise<void> | void;
  deviceActionInFlightKey?: string | null;
  onSavePolicyOverrides?: (
    deviceId: string,
    overrides: DesktopDevicePolicyOverrides,
  ) => Promise<void> | void;
  policyOverrideInFlightDeviceId?: string | null;
  adminConsoleHref?: string | null;
  scopeLabel?: "user" | "tenant";
}) {
  const {
    featureFlags,
    status = null,
    statusLoading = false,
    statusError = null,
    selectedDeviceId = null,
    onSelectedDeviceIdChange,
    controlPlaneState = null,
    controlPlaneLoading = false,
    controlPlaneError = null,
    packageCatalog = null,
    packageCatalogLoading = false,
    packageCatalogError = null,
    onDisableDevice,
    disableInFlightDeviceId = null,
    onRequestRootAction,
    rootActionInFlightKey = null,
    onRequestDeviceAction,
    deviceActionInFlightKey = null,
    onSavePolicyOverrides,
    policyOverrideInFlightDeviceId = null,
    adminConsoleHref = null,
    scopeLabel = "user",
  } = props;
  const devices = status?.devices ?? [];
  const selectedDevice = useMemo(() => (
    devices.find((device) => device.deviceId === selectedDeviceId) ?? devices[0] ?? null
  ), [devices, selectedDeviceId]);
  const policySnapshot = controlPlaneState?.policySnapshot ?? null;
  const effectiveWorkspaceProfile = selectedDevice?.currentWorkspaceProfile
    ?? policySnapshot?.workspaceProfiles[0]
    ?? buildPreviewWorkspaceProfile(featureFlags);
  const effectiveLocalRoots = selectedDevice?.localRoots.length
    ? selectedDevice.localRoots
    : policySnapshot?.localRoots ?? [];
  const rolloutGates = policySnapshot?.rolloutGates ?? buildFallbackRolloutGates(featureFlags);
  const bootstrapSteps = buildBootstrapSteps({
    featureFlags,
    devices,
    selectedDevice,
    packageCatalog,
    localRootsCount: effectiveLocalRoots.length,
  });
  const runLabels = selectedDevice?.lastRunSummary?.selection.labels ?? {
    surface: "desktop" as const,
    runtime: featureFlags.desktopAgencyRuntime ? "agency_swarm" : "pi",
    locality: "hybrid" as const,
    workspace: "local_workspace" as const,
    trustClass: "org_verified" as const,
  };
  const parserCapability = selectedDevice?.capabilities.localFileService ?? null;
  const attestationSupport = selectedDevice?.capabilities.deviceAttestationSupport ?? null;
  const [disableCandidateId, setDisableCandidateId] = useState<string | null>(null);
  const [deviceFilter, setDeviceFilter] = useState("");
  const [policyForm, setPolicyForm] = useState(() => buildPolicyFormState(selectedDevice?.policyOverrides));
  useEffect(() => {
    setPolicyForm(buildPolicyFormState(selectedDevice?.policyOverrides));
  }, [selectedDevice?.deviceId, selectedDevice?.policyOverrides]);
  const normalizedDeviceFilter = deviceFilter.trim().toLowerCase();
  const visibleDevices = normalizedDeviceFilter.length === 0
    ? devices
    : devices.filter((device) =>
      `${device.displayName} ${device.deviceId} ${device.machineName ?? ""} ${device.owner?.name ?? ""} ${device.owner?.email ?? ""}`
        .toLowerCase()
        .includes(normalizedDeviceFilter)
    );
  const visiblePackages = normalizedDeviceFilter.length === 0
    ? packageCatalog?.packages ?? []
    : (packageCatalog?.packages ?? []).filter((pkg) =>
      `${pkg.name} ${pkg.packageId} ${pkg.signerId}`
        .toLowerCase()
        .includes(normalizedDeviceFilter)
    );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Desktop Host
            </div>
            <h3 className="text-xl font-semibold text-slate-900">
              Unified web + desktop managed mode
            </h3>
            <p className="max-w-3xl text-sm text-slate-600">
              This view shows the governed Desktop Host posture: device-bound enrollment,
              signed package sync, gateway-only local runtimes, managed local roots, and explicit
              rollout gates.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge
              variant="outline"
              className={featureFlags.desktopHostEnabled
                ? "border-emerald-200 bg-white text-emerald-700"
                : "border-amber-200 bg-white text-amber-700"}
            >
              {featureFlags.desktopHostEnabled ? "Desktop Host enabled" : "Desktop Host preview"}
            </Badge>
            <Badge variant="outline" className="border-sky-200 bg-white text-sky-700">
              {scopeLabel === "tenant" ? "Tenant governance" : "Personal posture"}
            </Badge>
            <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
              {featureFlags.desktopAdvancedLocalMode ? "Advanced local mode" : "Managed mode"}
            </Badge>
            {adminConsoleHref && (
              <a
                href={adminConsoleHref}
                className="inline-flex items-center rounded-md border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
              >
                Open tenant console
              </a>
            )}
          </div>
        </div>
      </div>

      <DesktopRunBadgeRow labels={runLabels} />

      <div className="grid gap-4 xl:grid-cols-2">
        <DesktopHostBootstrapCard steps={bootstrapSteps} />
        <DesktopHostRolloutGatePanel gates={rolloutGates} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <header className="mb-3">
            <h3 className="text-sm font-semibold text-slate-900">
              {scopeLabel === "tenant" ? "Tenant Devices" : "Enrolled Devices"}
            </h3>
            <p className="text-xs text-slate-500">
              Device-bound proof-of-possession, package sync, and parser posture reported by
              Desktop Host.
            </p>
            <div className="mt-3">
              <Input
                value={deviceFilter}
                onChange={(event) => setDeviceFilter(event.target.value)}
                placeholder={scopeLabel === "tenant" ? "Filter devices or packages" : "Filter devices"}
                className="h-9"
              />
            </div>
          </header>

          {statusLoading ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">
              Loading enrolled device posture...
            </div>
          ) : isTenantContextMissingError(statusError) ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-4 text-xs text-sky-700">
              {scopeLabel === "tenant"
                ? "Select a tenant to load live Desktop Host posture."
                : "Desktop Host posture requires a selected tenant."}
            </div>
          ) : statusError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-4 text-xs text-rose-700">
              Unable to load device posture: {statusError}
            </div>
          ) : visibleDevices.length > 0 ? (
            <div className="space-y-3">
              {visibleDevices.map((device) => {
                const isSelected = device.deviceId === selectedDevice?.deviceId;
                const syncState = device.packageSyncState.syncStatus;
                return (
                  <article
                    key={device.deviceId}
                    className={isSelected
                      ? "rounded-xl border border-sky-200 bg-sky-50/60 px-3 py-3"
                      : "rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-slate-900">{device.displayName}</div>
                        <div className="text-xs text-slate-500">
                          {device.deviceId} • {device.platform.os} {device.platform.arch}
                        </div>
                        {(device.owner?.name || device.owner?.email) && (
                          <div className="mt-1 text-xs text-slate-500">
                            Owner: {device.owner?.name ?? "Unknown user"}
                            {device.owner?.email ? ` • ${device.owner.email}` : ""}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={device.healthStatus === "disabled"
                            ? "border-rose-200 bg-white text-rose-700"
                            : "border-emerald-200 bg-white text-emerald-700"}
                        >
                          {device.healthStatus}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={(device.accessState ?? "active") === "active"
                            ? "border-sky-200 bg-white text-sky-700"
                            : (device.accessState ?? "active") === "quarantined" || (device.accessState ?? "active") === "disabled"
                              ? "border-rose-200 bg-white text-rose-700"
                              : "border-amber-200 bg-white text-amber-700"}
                        >
                          {formatStateLabel(device.accessState ?? "active")}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={(device.presence?.status ?? "offline") === "online"
                            ? "border-emerald-200 bg-white text-emerald-700"
                            : (device.presence?.status ?? "offline") === "stale"
                              ? "border-amber-200 bg-white text-amber-700"
                              : "border-slate-200 bg-white text-slate-700"}
                        >
                          {formatStateLabel(device.presence?.status ?? "offline")}
                        </Badge>
                        <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                          Sync {syncState}
                        </Badge>
                        {onSelectedDeviceIdChange && (
                          <Button
                            type="button"
                            size="sm"
                            variant={isSelected ? "default" : "outline"}
                            onClick={() => onSelectedDeviceIdChange(device.deviceId)}
                          >
                            {isSelected ? "Selected" : "View details"}
                          </Button>
                        )}
                        {onDisableDevice && device.healthStatus !== "disabled" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 border-rose-200 bg-white px-3 text-rose-700 hover:bg-rose-50"
                            disabled={disableInFlightDeviceId === device.deviceId}
                            onClick={() => setDisableCandidateId(device.deviceId)}
                          >
                            {disableInFlightDeviceId === device.deviceId ? "Disabling..." : "Disable device"}
                          </Button>
                        )}
                      </div>
                    </div>

                    <dl className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                      <div>
                        <dt className="font-medium text-slate-700">Enrollment</dt>
                        <dd>{formatTimestamp(device.enrolledAt)}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-700">Last seen</dt>
                        <dd>{formatPresence(device)}{device.lastSeenAt ? ` • ${formatTimestamp(device.lastSeenAt)}` : ""}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-700">Access state</dt>
                        <dd>{formatStateLabel(device.accessState ?? "active")}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-700">Owner</dt>
                        <dd>{device.owner?.name ?? device.owner?.email ?? "Not reported yet"}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-700">PoP posture</dt>
                        <dd>
                          {device.capabilities.deviceIdentity
                            ? `${device.capabilities.deviceIdentity.keyAlgorithm} / ${device.capabilities.deviceIdentity.proofKind}`
                            : "Not reported yet"}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-700">Attestation</dt>
                        <dd>
                          {device.capabilities.deviceIdentity
                            ? `${device.capabilities.deviceIdentity.attestationMode} / ${device.capabilities.deviceIdentity.secretStorage}`
                            : "Not reported yet"}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-700">Key protection</dt>
                        <dd>
                          {device.capabilities.deviceIdentity
                            ? `${device.capabilities.deviceIdentity.storageProtection ?? "best_effort"} / ${device.capabilities.deviceIdentity.storageProvider ?? "filesystem"}`
                            : "Not reported yet"}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-700">Hardware posture</dt>
                        <dd>
                          {device.capabilities.deviceIdentity
                            ? `${device.capabilities.deviceIdentity.hardwareBacked ? "Hardware-backed" : "Software-backed"} / ${device.capabilities.deviceIdentity.osAttested ? "OS-attested" : "No attestation evidence"}`
                            : "Not reported yet"}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-700">Attestation provider</dt>
                        <dd>
                          {device.capabilities.deviceIdentity
                            ? device.capabilities.deviceIdentity.attestationProvider ?? "derived_runtime"
                            : "Not reported yet"}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-700">Attestation claims</dt>
                        <dd>
                          {device.capabilities.deviceIdentity?.attestationClaims?.length
                            ? device.capabilities.deviceIdentity.attestationClaims.slice(0, 3).join(", ")
                            : "No claims reported"}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-700">Roots</dt>
                        <dd>{device.localRoots.length}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-700">Workspace</dt>
                        <dd>{formatWorkspaceProfile(device.currentWorkspaceProfile)}</dd>
                      </div>
                    </dl>
                    {device.pendingActions.some((action) => action.rootId == null) && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {device.pendingActions
                          .filter((action) => action.rootId == null)
                          .map((action) => (
                            <Badge
                              key={action.actionId}
                              variant="outline"
                              className="border-amber-200 bg-white text-amber-700"
                            >
                              {formatStateLabel(action.actionType)}
                            </Badge>
                          ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">
              {devices.length > 0
                ? "No devices match the current filter."
                : "No enrolled desktop devices reported yet. The first managed desktop sign-in should register a device identity and publish its posture here."}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <header className="mb-3">
            <h3 className="text-sm font-semibold text-slate-900">Control Plane</h3>
            <p className="text-xs text-slate-500">
              Live policy snapshot, workspace posture, and package sync details for the selected device.
            </p>
          </header>

          {controlPlaneLoading ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">
              Loading control plane state...
            </div>
          ) : isTenantContextMissingError(controlPlaneError) ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-4 text-xs text-sky-700">
              {scopeLabel === "tenant"
                ? "Select a tenant and a device to inspect its control plane snapshot."
                : "A selected tenant is required to inspect the control plane."}
            </div>
          ) : controlPlaneError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-4 text-xs text-rose-700">
              Unable to load control plane state: {controlPlaneError}
            </div>
          ) : selectedDevice ? (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <dl className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-slate-700">Owner</dt>
                  <dd>
                    {selectedDevice.owner?.name ?? selectedDevice.owner?.email ?? "Not reported yet"}
                    {selectedDevice.owner?.email && selectedDevice.owner?.name
                      ? ` • ${selectedDevice.owner.email}`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">Presence</dt>
                  <dd>{formatPresence(selectedDevice)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">Access state</dt>
                  <dd>{formatStateLabel(selectedDevice.accessState ?? "active")}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">Policy version</dt>
                  <dd>{policySnapshot?.policyVersion ?? "Not reported yet"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">Policy expires</dt>
                  <dd>{formatTimestamp(policySnapshot?.expiresAt ?? null)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">Workspace profile</dt>
                  <dd>{formatWorkspaceProfile(effectiveWorkspaceProfile)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">Package sync</dt>
                  <dd>{selectedDevice.packageSyncState.syncStatus}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">Synced packages</dt>
                  <dd>{selectedDevice.packageSyncState.packageCount}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">Last sync</dt>
                  <dd>{formatTimestamp(selectedDevice.packageSyncState.lastSyncAt)}</dd>
                </div>
              </dl>
              {selectedDevice.lastRunSummary && (
                <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                  Last reported execution: {selectedDevice.lastRunSummary.selection.selectedRuntime}
                  {" / "}
                  {selectedDevice.lastRunSummary.selection.reason}
                  {" / "}
                  {formatTimestamp(selectedDevice.lastRunSummary.reportedAt)}
                </div>
              )}
              {selectedDevice.packageSyncState.lastError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  Last sync error: {selectedDevice.packageSyncState.lastError}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">
              Select a device to inspect its control plane snapshot.
            </div>
          )}
        </section>
      </div>

      {(selectedDevice && (onSavePolicyOverrides || onRequestDeviceAction)) && (
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <header className="mb-3">
              <h3 className="text-sm font-semibold text-slate-900">Device Policy Overrides</h3>
              <p className="text-xs text-slate-500">
                Per-device restrictions can narrow tenant policy without changing the tenant-wide default.
              </p>
            </header>

            <div className="grid gap-3 md:grid-cols-2">
              {([
                ["allowAdvancedLocalMode", "Advanced local mode"],
                ["allowPackageSync", "Package sync"],
                ["allowAgencyRuntime", "Agency runtime"],
                ["allowWorkerProjection", "Worker projection"],
              ] as const).map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <div className="text-xs font-medium text-slate-700">{label}</div>
                  <Select
                    value={policyForm[key]}
                    onValueChange={(value) =>
                      setPolicyForm((current) => ({
                        ...current,
                        [key]: value as PolicyToggleChoice,
                      }))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inherit">Inherit tenant default</SelectItem>
                      <SelectItem value="allow">Allow on this device</SelectItem>
                      <SelectItem value="restrict">Restrict on this device</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <div className="space-y-1">
                <div className="text-xs font-medium text-slate-700">Max local roots</div>
                <Input
                  inputMode="numeric"
                  value={policyForm.maxLocalRoots}
                  onChange={(event) =>
                    setPolicyForm((current) => ({
                      ...current,
                      maxLocalRoots: event.target.value.replace(/[^\d]/g, ""),
                    }))
                  }
                  placeholder="Inherit tenant limit"
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs font-medium text-slate-700">Writeback ceiling</div>
                <Select
                  value={policyForm.outputWritebackMode}
                  onValueChange={(value) =>
                    setPolicyForm((current) => ({
                      ...current,
                      outputWritebackMode: value as ReturnType<typeof buildPolicyFormState>["outputWritebackMode"],
                    }))
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inherit">Inherit tenant default</SelectItem>
                    <SelectItem value="read_search_only">Read/search only</SelectItem>
                    <SelectItem value="managed_output_only">Managed output only</SelectItem>
                    <SelectItem value="user_confirmed_root_write">User-confirmed root write</SelectItem>
                    <SelectItem value="advanced_local_override">Advanced local override</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                These overrides are reflected in the next policy snapshot and can only reduce access unless the tenant already allows the feature.
              </div>
              {onSavePolicyOverrides && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    void onSavePolicyOverrides(
                      selectedDevice.deviceId,
                      buildPolicyOverridePayload(policyForm),
                    )
                  }
                  disabled={policyOverrideInFlightDeviceId === selectedDevice.deviceId}
                >
                  {policyOverrideInFlightDeviceId === selectedDevice.deviceId ? "Saving..." : "Save overrides"}
                </Button>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <header className="mb-3">
              <h3 className="text-sm font-semibold text-slate-900">Remote Actions</h3>
              <p className="text-xs text-slate-500">
                Use these controls to trigger re-auth, token revocation, run cancellation, or temporary quarantine without disabling the device completely.
              </p>
            </header>

            <div className="flex flex-wrap gap-2">
              {([
                ["force_reauth", "Force re-auth"],
                ["revoke_runtime_tokens", "Revoke runtime tokens"],
                ["cancel_active_runs", "Cancel active runs"],
              ] as const).map(([actionType, label]) => (
                <Button
                  key={actionType}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!onRequestDeviceAction || deviceActionInFlightKey === actionType}
                  onClick={() => onRequestDeviceAction?.(selectedDevice.deviceId, actionType)}
                >
                  {deviceActionInFlightKey === actionType ? "Submitting..." : label}
                </Button>
              ))}

              {selectedDevice.accessState === "quarantined" || selectedDevice.accessState === "reauth_required" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                  disabled={!onRequestDeviceAction || deviceActionInFlightKey === "resume_device_access"}
                  onClick={() => onRequestDeviceAction?.(selectedDevice.deviceId, "resume_device_access")}
                >
                  {deviceActionInFlightKey === "resume_device_access" ? "Submitting..." : "Resume device access"}
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-amber-200 bg-white text-amber-700 hover:bg-amber-50"
                  disabled={!onRequestDeviceAction || deviceActionInFlightKey === "quarantine_device" || selectedDevice.accessState === "disabled"}
                  onClick={() => onRequestDeviceAction?.(selectedDevice.deviceId, "quarantine_device")}
                >
                  {deviceActionInFlightKey === "quarantine_device" ? "Submitting..." : "Quarantine device"}
                </Button>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
              Current access posture: <span className="font-medium text-slate-900">{formatStateLabel(selectedDevice.accessState ?? "active")}</span>
              {" • "}
              {selectedDevice.warningFlags.length > 0
                ? `Warnings: ${selectedDevice.warningFlags.join(", ")}`
                : "No warning flags reported"}
            </div>
          </section>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <header className="mb-3">
            <h3 className="text-sm font-semibold text-slate-900">Rich Document Parser</h3>
            <p className="text-xs text-slate-500">
              Preview and snippet extraction for managed local files must stay isolated and fail-closed.
            </p>
          </header>

          {statusLoading ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">
              Loading parser capability posture...
            </div>
          ) : parserCapability ? (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-sky-200 bg-white text-sky-700">
                  {parserCapability.isolationMode}
                </Badge>
                <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                  OCR {parserCapability.ocrEnabled ? "enabled" : "disabled"}
                </Badge>
                <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                  Active content {parserCapability.activeContentExecutionAllowed ? "allowed" : "blocked"}
                </Badge>
                <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                  PDF {parserCapability.pdfExtractor}
                </Badge>
                <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                  Render {parserCapability.renderBackend ?? "none"}
                </Badge>
              </div>

              <dl className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-slate-700">Supported formats</dt>
                  <dd>{parserCapability.supportedFormats.join(", ") || "None reported"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">Bounded input</dt>
                  <dd>{formatBytes(parserCapability.maxInputBytes)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">Parser timeout</dt>
                  <dd>{parserCapability.timeoutMs} ms</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">Managed mode</dt>
                  <dd>{parserCapability.enabled ? "Isolated helper enabled" : "Disabled"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">OCR provider</dt>
                  <dd>{parserCapability.ocrProvider}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">Macro inspection</dt>
                  <dd>{parserCapability.macroInspectionSupported ? "Supported" : "Unavailable"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">Embedded media</dt>
                  <dd>{parserCapability.embeddedMediaInspectionSupported ? "Supported" : "Unavailable"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">Office renderer</dt>
                  <dd>{parserCapability.officeRenderer ?? "none"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">Rendered formats</dt>
                  <dd>{parserCapability.renderedPreviewFormats?.join(", ") || "None reported"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">Complex docs</dt>
                  <dd>{parserCapability.complexDocumentSupport ?? "text_extraction_only"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">Multi-page rendering</dt>
                  <dd>{parserCapability.multiPageRenderingSupported ? `Up to ${parserCapability.maxRenderedPages ?? 0} pages` : "Single-page or extraction only"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">OCR layout mode</dt>
                  <dd>{parserCapability.ocrLayoutMode ?? "plain_text"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">Layout analysis</dt>
                  <dd>{parserCapability.layoutAnalysisMode ?? "none"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">Rendered preview</dt>
                  <dd>{parserCapability.fullRenderingSupported ? "Rendering + extraction" : "Extraction only"}</dd>
                </div>
              </dl>

              {attestationSupport && (
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                  <div className="mb-2 text-xs font-medium text-slate-700">Attestation Broker</div>
                  <dl className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                    <div>
                      <dt className="font-medium text-slate-700">Evidence source</dt>
                      <dd>{attestationSupport.evidenceSource}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-700">Default mode</dt>
                      <dd>{attestationSupport.defaultMode}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-700">Provider hint</dt>
                      <dd>{attestationSupport.providerHint}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-700">Helper status</dt>
                      <dd>
                        {attestationSupport.helperConfigured
                          ? attestationSupport.helperReachable
                            ? "Configured and reachable"
                            : "Configured but unreachable"
                          : "Not configured"}
                      </dd>
                    </div>
                  </dl>
                  {!!attestationSupport.notes.length && (
                    <div className="mt-2 text-xs text-slate-500">
                      {attestationSupport.notes.join(" ")}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">
              No parser capability has been reported yet. Desktop Host should publish isolated
              parser support during registration or heartbeat.
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <header className="mb-3">
            <h3 className="text-sm font-semibold text-slate-900">Desktop Package Catalog</h3>
            <p className="text-xs text-slate-500">
              Signed packages, trust class, revocation posture, and runtime destination that Desktop Host can materialize.
            </p>
            <div className="mt-2 text-xs text-slate-500">
              Showing {visiblePackages.length} of {packageCatalog?.packages.length ?? 0} packages
            </div>
          </header>

          {packageCatalogLoading ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">
              Loading package catalog...
            </div>
          ) : isTenantContextMissingError(packageCatalogError) ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-4 text-xs text-sky-700">
              {scopeLabel === "tenant"
                ? "Select a tenant to load the package catalog."
                : "Desktop package sync requires a selected tenant."}
            </div>
          ) : packageCatalogError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-4 text-xs text-rose-700">
              Unable to load package catalog: {packageCatalogError}
            </div>
          ) : visiblePackages.length ? (
            <div className="space-y-3">
              {visiblePackages.slice(0, 8).map((pkg) => (
                <article
                  key={pkg.packageId}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-slate-900">{pkg.name}</div>
                      <div className="text-xs text-slate-500">
                        {pkg.packageId} • v{pkg.version}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                        {desktopTrustClassLabels[pkg.trustClass]}
                      </Badge>
                      <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                        {desktopPackageStateLabels[pkg.state]}
                      </Badge>
                      <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                        {pkg.runtimeDestination}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-slate-600">
                    Signer {pkg.signerId} / {pkg.signerKeyVersion}
                    {pkg.summary ? ` • ${pkg.summary}` : ""}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Source {pkg.source} • {pkg.availableOnDesktop ? "Desktop-ready" : "Server-only"}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">
              {(packageCatalog?.packages.length ?? 0) > 0
                ? "No packages match the current filter."
                : "No desktop packages are available yet for this tenant."}
            </div>
          )}
        </section>
      </div>

      <LocalFileRootsPanel
        roots={effectiveLocalRoots}
        workspaceProfile={effectiveWorkspaceProfile}
        pendingActions={selectedDevice?.pendingActions ?? []}
        actionInFlightKey={rootActionInFlightKey}
        onRequestAction={selectedDevice && onRequestRootAction
          ? (rootId, actionType) => onRequestRootAction(selectedDevice.deviceId, rootId, actionType)
          : undefined}
      />

      <AlertDialog open={Boolean(disableCandidateId)} onOpenChange={(open) => {
        if (!open) {
          setDisableCandidateId(null);
        }
      }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable desktop device?</AlertDialogTitle>
            <AlertDialogDescription>
              This blocks new runs, rotates access on the next contact, and schedules cleanup for
              package cache and derived local-root data tracked for the device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (disableCandidateId && onDisableDevice) {
                  void onDisableDevice(disableCandidateId);
                }
                setDisableCandidateId(null);
              }}
            >
              Disable device
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
