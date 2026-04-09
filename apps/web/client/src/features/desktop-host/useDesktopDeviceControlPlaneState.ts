import { useEffect, useState } from "react";

import {
  desktopDeviceControlPlaneStateSchema,
  type DesktopDeviceControlPlaneState,
} from "@shared/desktopHost";

interface DesktopDeviceControlPlaneStateResult {
  state: DesktopDeviceControlPlaneState | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useDesktopDeviceControlPlaneState(
  enabled: boolean,
  deviceId: string | null,
): DesktopDeviceControlPlaneStateResult {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [state, setState] = useState<DesktopDeviceControlPlaneStateResult>({
    state: null,
    isLoading: enabled && Boolean(deviceId),
    error: null,
    refresh: () => setRefreshNonce((value) => value + 1),
  });

  useEffect(() => {
    if (!enabled || !deviceId) {
      setState({
        state: null,
        isLoading: false,
        error: null,
        refresh: () => setRefreshNonce((value) => value + 1),
      });
      return;
    }

    let cancelled = false;
    setState((previous) => ({
      state: previous.state,
      isLoading: true,
      error: null,
      refresh: previous.refresh,
    }));

    void fetch(`/api/desktop-host/devices/${encodeURIComponent(deviceId)}/state`, {
      credentials: "include",
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            typeof payload?.error === "string"
              ? payload.error
              : "desktop_device_control_plane_unavailable",
          );
        }
        return desktopDeviceControlPlaneStateSchema.parse(payload);
      })
      .then((nextState) => {
        if (!cancelled) {
          setState({
            state: nextState,
            isLoading: false,
            error: null,
            refresh: () => setRefreshNonce((value) => value + 1),
          });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            state: null,
            isLoading: false,
            error: error instanceof Error
              ? error.message
              : "desktop_device_control_plane_unavailable",
            refresh: () => setRefreshNonce((value) => value + 1),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [deviceId, enabled, refreshNonce]);

  return state;
}
