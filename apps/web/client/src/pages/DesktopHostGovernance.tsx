import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, MonitorPlay, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { HelpButton } from "@/components/help";
import { DashboardSurface } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { DesktopHostSettingsPanel } from "@/features/desktop-host/DesktopHostSettingsPanel";
import { useDesktopDeviceControlPlaneState } from "@/features/desktop-host/useDesktopDeviceControlPlaneState";
import { useDesktopHostStatus } from "@/features/desktop-host/useDesktopHostStatus";
import { useDesktopPackageCatalog } from "@/features/desktop-host/useDesktopPackageCatalog";
import { useTenantFeatureFlag } from "@/hooks/useTenantFeatureFlag";
import {
  desktopDeviceActionResponseSchema,
  desktopDeviceDisableResponseSchema,
  desktopDevicePolicyOverrideResponseSchema,
  desktopRootActionResponseSchema,
  type DesktopDeviceActionRequest,
  type DesktopDevicePolicyOverrides,
} from "@shared/desktopHost";

function roleLabel(role?: string | null) {
  if (role === "admin") {
    return "Admin";
  }
  if (role === "domain_admin") {
    return "Domain admin";
  }
  return "Team member";
}

export default function DesktopHostGovernance() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const desktopHostEnabled = useTenantFeatureFlag("desktopHostEnabled");
  const desktopAdvancedLocalModeEnabled = useTenantFeatureFlag("desktopAdvancedLocalMode");
  const desktopPackageSyncEnabled = useTenantFeatureFlag("desktopPackageSync");
  const desktopAgencyRuntimeEnabled = useTenantFeatureFlag("desktopAgencyRuntime");
  const desktopWorkerProjectionEnabled = useTenantFeatureFlag("desktopWorkerProjection");
  const tenantStatus = useDesktopHostStatus(
    desktopHostEnabled
      && Boolean(user?.currentTenantId)
      && (user?.role === "admin" || user?.role === "domain_admin"),
    "tenant",
  );
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [disableDeviceId, setDisableDeviceId] = useState<string | null>(null);
  const [rootActionKey, setRootActionKey] = useState<string | null>(null);
  const [deviceActionKey, setDeviceActionKey] = useState<string | null>(null);
  const [policyOverrideDeviceId, setPolicyOverrideDeviceId] = useState<string | null>(null);
  const selectedDevice = useMemo(
    () => tenantStatus.status?.devices.find((device) => device.deviceId === selectedDeviceId)
      ?? tenantStatus.status?.devices[0]
      ?? null,
    [selectedDeviceId, tenantStatus.status?.devices],
  );
  const controlPlaneState = useDesktopDeviceControlPlaneState(
    desktopHostEnabled,
    selectedDevice?.deviceId ?? null,
  );
  const packageCatalog = useDesktopPackageCatalog(
    desktopHostEnabled && desktopPackageSyncEnabled,
  );

  const releaseWorkspacePath = user?.role === "admin" ? "/admin/desktop-host" : "/domain-admin/desktop-host";
  const helpPage = user?.role === "admin" ? "/admin/desktop-host/governance" : "/domain-admin/desktop-host/governance";

  useEffect(() => {
    if (!selectedDeviceId && tenantStatus.status?.devices[0]?.deviceId) {
      setSelectedDeviceId(tenantStatus.status.devices[0].deviceId);
      return;
    }
    if (
      selectedDeviceId
      && !(tenantStatus.status?.devices ?? []).some((device) => device.deviceId === selectedDeviceId)
    ) {
      setSelectedDeviceId(tenantStatus.status?.devices[0]?.deviceId ?? null);
    }
  }, [selectedDeviceId, tenantStatus.status?.devices]);

  const handleDisableDevice = async (deviceId: string) => {
    setDisableDeviceId(deviceId);
    try {
      const device = tenantStatus.status?.devices.find((candidate) => candidate.deviceId === deviceId) ?? null;
      const response = await fetch(`/api/desktop-host/devices/${encodeURIComponent(deviceId)}/disable`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: "admin_requested_disable",
          cleanupOnNextContact: true,
          packageCachePaths: device?.packageCachePaths ?? [],
          localRoots: device?.localRoots ?? [],
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "desktop_device_disable_failed");
      }
      desktopDeviceDisableResponseSchema.parse(payload);
      toast.success("Desktop device disabled and cleanup scheduled.");
      tenantStatus.refresh();
      controlPlaneState.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disable desktop device");
    } finally {
      setDisableDeviceId(null);
    }
  };

  const handleRootAction = async (
    deviceId: string,
    rootId: string,
    actionType: "reindex_root" | "purge_root_derived_store" | "revoke_root",
  ) => {
    const inFlightKey = `${rootId}:${actionType}`;
    setRootActionKey(inFlightKey);
    try {
      const response = await fetch(
        `/api/desktop-host/devices/${encodeURIComponent(deviceId)}/roots/${encodeURIComponent(rootId)}/actions`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            actionType,
            note: "tenant_console_requested_action",
          }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "desktop_root_action_failed");
      }
      desktopRootActionResponseSchema.parse(payload);
      toast.success(actionType === "revoke_root" ? "Root revoked from the device." : "Root action queued.");
      tenantStatus.refresh();
      controlPlaneState.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to queue root action");
    } finally {
      setRootActionKey(null);
    }
  };

  const handleDeviceAction = async (
    deviceId: string,
    actionType: DesktopDeviceActionRequest["actionType"],
  ) => {
    setDeviceActionKey(actionType);
    try {
      const response = await fetch(`/api/desktop-host/devices/${encodeURIComponent(deviceId)}/actions`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actionType,
          note: "tenant_console_requested_action",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "desktop_device_action_failed");
      }
      desktopDeviceActionResponseSchema.parse(payload);
      toast.success("Desktop device action queued.");
      tenantStatus.refresh();
      controlPlaneState.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to queue desktop device action");
    } finally {
      setDeviceActionKey(null);
    }
  };

  const handleSavePolicyOverrides = async (
    deviceId: string,
    overrides: DesktopDevicePolicyOverrides,
  ) => {
    setPolicyOverrideDeviceId(deviceId);
    try {
      const response = await fetch(`/api/desktop-host/devices/${encodeURIComponent(deviceId)}/policy-overrides`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          overrides,
          note: "tenant_console_policy_override",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "desktop_policy_override_failed");
      }
      desktopDevicePolicyOverrideResponseSchema.parse(payload);
      toast.success("Device policy overrides saved.");
      tenantStatus.refresh();
      controlPlaneState.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save device policy overrides");
    } finally {
      setPolicyOverrideDeviceId(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <DashboardSurface className="overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-sky-50">
        <div className="flex flex-col gap-6 p-6 lg:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-indigo-700">
                <Sparkles className="h-4 w-4" />
                Governance
              </div>
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                  Desktop host governance
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
                  Manage enrolled desktop devices, policy posture, local roots, package sync,
                  and trust state from a dedicated console.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-sky-200 bg-white text-sky-700">
                  {roleLabel(user?.role)}
                </Badge>
                <Badge
                  variant="outline"
                  className={desktopHostEnabled
                    ? "border-emerald-200 bg-white text-emerald-700"
                    : "border-amber-200 bg-white text-amber-700"}
                >
                  {desktopHostEnabled ? "Desktop Host enabled" : "Desktop Host preview"}
                </Badge>
                <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                  {desktopAdvancedLocalModeEnabled ? "Advanced local mode" : "Managed mode"}
                </Badge>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(releaseWorkspacePath)}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to release workspace
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/dashboard")}
              >
                <MonitorPlay className="mr-2 h-4 w-4" />
                Back to dashboard
              </Button>
              <HelpButton
                page={helpPage}
                topic="desktop-host"
                variant="outline"
                size="sm"
                label="Help"
              />
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-2xl border border-indigo-100 bg-white/90 p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                Devices
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Enrolled desktops, last contact, and access restrictions.
              </p>
            </div>
            <div className="rounded-2xl border border-indigo-100 bg-white/90 p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                Policy
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Control roots, package sync, and local workspace posture in one place.
              </p>
            </div>
            <div className="rounded-2xl border border-indigo-100 bg-white/90 p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                Release handoff
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Release publishing is handled on the separate workspace page.
              </p>
            </div>
          </div>
        </div>
      </DashboardSurface>

      {desktopHostEnabled ? (
        <DesktopHostSettingsPanel
          featureFlags={{
            desktopHostEnabled,
            desktopAdvancedLocalMode: desktopAdvancedLocalModeEnabled,
            desktopPackageSync: desktopPackageSyncEnabled,
            desktopAgencyRuntime: desktopAgencyRuntimeEnabled,
            desktopWorkerProjection: desktopWorkerProjectionEnabled,
          }}
          status={tenantStatus.status}
          statusLoading={tenantStatus.isLoading}
          statusError={tenantStatus.error}
          selectedDeviceId={selectedDevice?.deviceId ?? null}
          onSelectedDeviceIdChange={setSelectedDeviceId}
          controlPlaneState={controlPlaneState.state}
          controlPlaneLoading={controlPlaneState.isLoading}
          controlPlaneError={controlPlaneState.error}
          packageCatalog={packageCatalog.catalog}
          packageCatalogLoading={packageCatalog.isLoading}
          packageCatalogError={packageCatalog.error}
          onDisableDevice={handleDisableDevice}
          disableInFlightDeviceId={disableDeviceId}
          onRequestRootAction={handleRootAction}
          rootActionInFlightKey={rootActionKey}
          onRequestDeviceAction={handleDeviceAction}
          deviceActionInFlightKey={deviceActionKey}
          onSavePolicyOverrides={handleSavePolicyOverrides}
          policyOverrideInFlightDeviceId={policyOverrideDeviceId}
          adminConsoleHref={null}
          scopeLabel="tenant"
        />
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-800">
          Desktop Host is not enabled for this tenant yet. Turn on the tenant feature flag before
          using managed desktop governance.
        </div>
      )}
    </div>
  );
}
