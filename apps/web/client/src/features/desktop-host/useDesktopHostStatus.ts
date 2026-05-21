import { useEffect, useState } from "react";

import {
  desktopHostDeviceStatusResponseSchema,
  type DesktopHostDeviceStatusResponse,
} from "@shared/desktopHost";

interface DesktopHostStatusState {
  status: DesktopHostDeviceStatusResponse | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

function emptyDesktopHostStatus(): DesktopHostDeviceStatusResponse {
  return {
    generatedAt: new Date().toISOString(),
    devices: [],
  };
}

function isSoftDesktopHostStatusError(responseStatus: number, errorCode: unknown): boolean {
  return responseStatus === 403
    && typeof errorCode === "string"
    && [
      "desktop_host_tenant_required",
      "desktop_host_tenant_mismatch",
      "desktop_device_forbidden",
      "feature_disabled",
    ].includes(errorCode);
}

export function useDesktopHostStatus(
  enabled: boolean,
  scope: "user" | "tenant" = "user",
): DesktopHostStatusState {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [state, setState] = useState<DesktopHostStatusState>({
    status: null,
    isLoading: enabled,
    error: null,
    refresh: () => setRefreshNonce((value) => value + 1),
  });

  useEffect(() => {
    if (!enabled) {
      setState({
        status: null,
        isLoading: false,
        error: null,
        refresh: () => setRefreshNonce((value) => value + 1),
      });
      return;
    }

    let cancelled = false;
    setState((previous) => ({
      status: previous.status,
      isLoading: true,
      error: null,
      refresh: previous.refresh,
    }));

    const url = scope === "tenant"
      ? "/api/desktop-host/devices?scope=tenant"
      : "/api/desktop-host/devices";
    void fetch(url, {
      credentials: "include",
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (isSoftDesktopHostStatusError(response.status, payload?.error)) {
            return emptyDesktopHostStatus();
          }
          throw new Error(
            typeof payload?.error === "string" ? payload.error : "desktop_host_status_unavailable",
          );
        }
        return desktopHostDeviceStatusResponseSchema.parse(payload);
      })
      .then((status) => {
        if (!cancelled) {
          setState({
            status,
            isLoading: false,
            error: null,
            refresh: () => setRefreshNonce((value) => value + 1),
          });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: null,
            isLoading: false,
            error: error instanceof Error ? error.message : "desktop_host_status_unavailable",
            refresh: () => setRefreshNonce((value) => value + 1),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, refreshNonce, scope]);

  return state;
}
