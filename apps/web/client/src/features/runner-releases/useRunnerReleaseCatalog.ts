import { useCallback, useEffect, useRef, useState } from "react";

import {
  runnerReleaseCatalogResponseSchema,
  type RunnerReleaseArchitecture,
  type RunnerReleaseCatalogResponse,
  type RunnerReleasePlatform,
} from "@shared/runnerReleases";

export type RunnerSummary = {
  runnerId: string;
  displayName: string;
  profile: string;
  nodeKind: string;
  status: string;
  trustState: string;
  lastSeenAt: string | null;
  runnerVersion: string | null;
  platform: { os?: string; architecture?: string; target?: string } | null;
  toolCount: number;
  readyToolCount: number;
  capabilityCount: number;
  readyCapabilityCount: number;
};

export type RunnerUpdateCommand = {
  commandId: string;
  runnerId: string;
  releaseAssetId: number;
  targetVersion: string | null;
  downloadUrl: string | null;
  expectedSha256: string | null;
  status: string;
  phase: string;
  idempotencyKey: string;
  error: { code: string; message: string } | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type RunnerReleaseState = {
  catalog: RunnerReleaseCatalogResponse | null;
  runners: RunnerSummary[];
  isLoading: boolean;
  error: string | null;
  checkedAt: string | null;
};

export function detectRunnerTarget(): {
  platform: RunnerReleasePlatform;
  architecture: RunnerReleaseArchitecture;
} {
  if (typeof navigator === "undefined") return { platform: "linux", architecture: "x64" };
  const userAgent = navigator.userAgent.toLowerCase();
  const platform = userAgent.includes("mac") ? "macos" : userAgent.includes("win") ? "windows" : "linux";
  const architecture = /arm64|aarch64|apple silicon/.test(userAgent) ? "arm64" : "x64";
  return { platform, architecture };
}

export function useRunnerReleaseCatalog(enabled: boolean) {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const updateIdempotencyKeys = useRef(new Map<string, string>());
  const [state, setState] = useState<RunnerReleaseState>({
    catalog: null,
    runners: [],
    isLoading: enabled,
    error: null,
    checkedAt: null,
  });

  useEffect(() => {
    if (!enabled) {
      setState({ catalog: null, runners: [], isLoading: false, error: null, checkedAt: null });
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setState(previous => ({ ...previous, isLoading: true, error: null }));
    void Promise.all([
      fetch("/api/runner-releases?channel=stable", {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      }).then(async response => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error ?? "runner_release_catalog_unavailable");
        return runnerReleaseCatalogResponseSchema.parse(payload);
      }),
      fetch("/api/runners", {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      }).then(async response => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error ?? "runner_registry_unavailable");
        return Array.isArray(payload?.runners) ? payload.runners as RunnerSummary[] : [];
      }),
    ])
      .then(([catalog, runners]) => {
        if (!cancelled) setState({ catalog, runners, isLoading: false, error: null, checkedAt: new Date().toISOString() });
      })
      .catch(error => {
        if (!cancelled && error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) setState(previous => ({ ...previous, isLoading: false, error: error instanceof Error ? error.message : "runner_release_catalog_unavailable" }));
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, refreshNonce]);

  const requestUpdate = useCallback(async (runnerId: string, releaseAssetId: number): Promise<RunnerUpdateCommand> => {
    const key = `${runnerId}:${releaseAssetId}`;
    const idempotencyKey = updateIdempotencyKeys.current.get(key) ?? (() => {
      const generated = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      updateIdempotencyKeys.current.set(key, `dashboard:${runnerId}:${releaseAssetId}:${generated}`);
      return updateIdempotencyKeys.current.get(key)!;
    })();
    const response = await fetch(`/api/runners/${encodeURIComponent(runnerId)}/update`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ releaseAssetId, idempotencyKey }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error ?? "runner_update_request_failed");
    return payload as RunnerUpdateCommand;
  }, []);

  return {
    ...state,
    refresh: () => setRefreshNonce(value => value + 1),
    requestUpdate,
  };
}
