import { useEffect, useState } from "react";

import {
  desktopReleaseCatalogResponseSchema,
  type DesktopReleaseCatalogResponse,
} from "@shared/desktopReleases";

interface DesktopReleaseCatalogState {
  catalog: DesktopReleaseCatalogResponse | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}
export function useDesktopReleaseCatalog(enabled: boolean): DesktopReleaseCatalogState {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [state, setState] = useState<DesktopReleaseCatalogState>({
    catalog: null,
    isLoading: enabled,
    error: null,
    refresh: () => setRefreshNonce((value) => value + 1),
  });

  useEffect(() => {
    if (!enabled) {
      setState({
        catalog: null,
        isLoading: false,
        error: null,
        refresh: () => setRefreshNonce((value) => value + 1),
      });
      return;
    }

    let cancelled = false;
    setState((previous) => ({
      catalog: previous.catalog,
      isLoading: true,
      error: null,
      refresh: previous.refresh,
    }));

    void fetch("/api/desktop-releases", {
      credentials: "include",
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            typeof payload?.error === "string"
              ? payload.error
              : "desktop_release_catalog_unavailable",
          );
        }
        return desktopReleaseCatalogResponseSchema.parse(payload);
      })
      .then((catalog) => {
        if (!cancelled) {
          setState({
            catalog,
            isLoading: false,
            error: null,
            refresh: () => setRefreshNonce((value) => value + 1),
          });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            catalog: null,
            isLoading: false,
            error:
              error instanceof Error
                ? error.message
                : "desktop_release_catalog_unavailable",
            refresh: () => setRefreshNonce((value) => value + 1),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, refreshNonce]);

  return state;
}
