import { useEffect, useState } from "react";

import {
  desktopPackageCatalogResponseSchema,
  type DesktopPackageCatalogResponse,
} from "@shared/desktopHost";

interface DesktopPackageCatalogState {
  catalog: DesktopPackageCatalogResponse | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useDesktopPackageCatalog(enabled: boolean): DesktopPackageCatalogState {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [state, setState] = useState<DesktopPackageCatalogState>({
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

    void fetch("/api/desktop-host/packages/catalog", {
      credentials: "include",
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            typeof payload?.error === "string" ? payload.error : "desktop_package_catalog_unavailable",
          );
        }
        return desktopPackageCatalogResponseSchema.parse(payload);
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
            error: error instanceof Error ? error.message : "desktop_package_catalog_unavailable",
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
