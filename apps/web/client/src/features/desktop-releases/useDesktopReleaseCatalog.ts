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
  attempt: number;
}

type DesktopReleaseCatalogCache = {
  catalog: DesktopReleaseCatalogResponse;
  updatedAt: number;
};

const CATALOG_CACHE_KEY = "smartaihub.desktop-releases.catalog.v1";
const CATALOG_CACHE_MAX_AGE_MS = 2 * 60 * 1000;
let inMemoryCatalogCache: DesktopReleaseCatalogCache | null = null;

function readCatalogCache(): DesktopReleaseCatalogCache | null {
  if (inMemoryCatalogCache) {
    return inMemoryCatalogCache;
  }
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(CATALOG_CACHE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as DesktopReleaseCatalogCache;
    if (!parsed?.catalog || typeof parsed?.updatedAt !== "number") {
      return null;
    }
    inMemoryCatalogCache = parsed;
    return parsed;
  } catch {
    return null;
  }
}

function writeCatalogCache(catalog: DesktopReleaseCatalogResponse) {
  const payload: DesktopReleaseCatalogCache = {
    catalog,
    updatedAt: Date.now(),
  };
  inMemoryCatalogCache = payload;
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage failures
  }
}

function resolveFreshCatalog(): DesktopReleaseCatalogResponse | null {
  const cache = readCatalogCache();
  if (!cache) {
    return null;
  }
  if (Date.now() - cache.updatedAt > CATALOG_CACHE_MAX_AGE_MS) {
    return cache.catalog;
  }
  return cache.catalog;
}
export function useDesktopReleaseCatalog(enabled: boolean): DesktopReleaseCatalogState {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DesktopReleaseCatalogState>(() => {
    const cached = resolveFreshCatalog();
    return {
      catalog: cached,
      isLoading: enabled,
      error: null,
      refresh: () => setRefreshNonce((value) => value + 1),
      attempt: 0,
    };
  });

  useEffect(() => {
    if (!enabled) {
      setState({
        catalog: null,
        isLoading: false,
        error: null,
        refresh: () => setRefreshNonce((value) => value + 1),
        attempt: 0,
      });
      setAttempt(0);
      return;
    }

    let cancelled = false;
    let settled = false;
    const controller = new AbortController();
    let timeoutId: number | undefined;
    const nextAttempt = attempt + 1;
    setAttempt(nextAttempt);
    const cachedCatalog = resolveFreshCatalog();
    setState((previous) => ({
      catalog: cachedCatalog ?? previous.catalog,
      isLoading: true,
      error: null,
      refresh: previous.refresh,
      attempt: previous.attempt,
    }));

    const fetchPromise = fetch("/api/desktop-releases", {
      credentials: "include",
      signal: controller.signal,
    }).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "desktop_release_catalog_unavailable",
        );
      }
      return desktopReleaseCatalogResponseSchema.parse(payload);
    });

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutId = window.setTimeout(() => {
        controller.abort();
        reject(new Error("desktop_release_catalog_timeout"));
      }, 15000);
    });

    void Promise.race([fetchPromise, timeoutPromise])
      .then((catalog) => {
        if (!cancelled) {
          settled = true;
          writeCatalogCache(catalog);
          setState({
            catalog,
            isLoading: false,
            error: null,
            refresh: () => setRefreshNonce((value) => value + 1),
            attempt: nextAttempt,
          });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          settled = true;
          const message = error instanceof DOMException && error.name === "AbortError"
            ? "desktop_release_catalog_timeout"
            : error instanceof Error
              ? error.message
              : "desktop_release_catalog_unavailable";
          const fallbackCatalog = resolveFreshCatalog();
          setState({
            catalog: fallbackCatalog ?? null,
            isLoading: false,
            error: message,
            refresh: () => setRefreshNonce((value) => value + 1),
            attempt: nextAttempt,
          });
        }
      })
      .finally(() => {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
        if (!settled) {
          controller.abort();
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [enabled, refreshNonce]);

  return {
    ...state,
    attempt,
  };
}
