import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, MonitorPlay } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HelpButton } from "@/components/help";
import { useAuth } from "@/contexts/AuthContext";
import { DesktopHostSettingsPanel } from "@/features/desktop-host/DesktopHostSettingsPanel";
import { DesktopReleasePanel } from "@/features/desktop-releases/DesktopReleasePanel";
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

export default function AdminDesktopHost() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const helpPage = user?.role === "admin" ? "/admin/desktop-host" : "/domain-admin/desktop-host";
  const desktopHostEnabled = useTenantFeatureFlag("desktopHostEnabled");
  const desktopAdvancedLocalModeEnabled = useTenantFeatureFlag("desktopAdvancedLocalMode");
  const desktopPackageSyncEnabled = useTenantFeatureFlag("desktopPackageSync");
  const desktopAgencyRuntimeEnabled = useTenantFeatureFlag("desktopAgencyRuntime");
  const desktopWorkerProjectionEnabled = useTenantFeatureFlag("desktopWorkerProjection");
  const tenantStatus = useDesktopHostStatus(desktopHostEnabled, "tenant");
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
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div className="flex flex-col gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
            <MonitorPlay className="h-4 w-4" />
            Desktop Host
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Tenant Desktop Governance</h1>
          <p className="max-w-3xl text-sm text-slate-600">
            Manage enrolled desktop devices, live policy posture, local roots, package sync, and
            trust state for this tenant.
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-indigo-200 bg-white text-indigo-700">
              {user?.role === "admin" ? "Admin" : "Domain admin"}
            </Badge>
            <Badge
              variant="outline"
              className={desktopHostEnabled
                ? "border-emerald-200 bg-white text-emerald-700"
                : "border-amber-200 bg-white text-amber-700"}
            >
              {desktopHostEnabled ? "Desktop Host enabled" : "Desktop Host disabled"}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to dashboard
          </Button>
          <HelpButton page={helpPage} topic="desktop-host" variant="outline" size="sm" />
        </div>
      </div>

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
          scopeLabel="tenant"
        />
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-800">
          Desktop Host is not enabled for this tenant yet. Turn on the tenant feature flag before
          using managed desktop governance.
        </div>
      )}

      <DesktopReleasePanel
        variant="admin"
        enabled={Boolean(user)}
        canTriggerBuild={user?.role === "admin"}
      />
    </div>
  );
}
