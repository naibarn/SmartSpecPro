import { useEffect, useState } from "react";

import {
  desktopReleaseBuildHistoryResponseSchema,
  type DesktopReleaseBuildHistoryResponse,
} from "@shared/desktopReleaseBuilds";

interface DesktopReleaseBuildHistoryState {
  history: DesktopReleaseBuildHistoryResponse | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  attempt: number;
}

export function useDesktopReleaseBuildHistory(enabled: boolean, limit = 8): DesktopReleaseBuildHistoryState {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DesktopReleaseBuildHistoryState>({
    history: null,
    isLoading: enabled,
    error: null,
    refresh: () => setRefreshNonce((value) => value + 1),
    attempt: 0,
  });

  useEffect(() => {
    if (!enabled) {
      setState({
        history: null,
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
    setState((previous) => ({
      history: previous.history,
      isLoading: true,
      error: null,
      refresh: previous.refresh,
      attempt: previous.attempt,
    }));

    const fetchPromise = fetch(`/api/desktop-releases/builds/history?limit=${encodeURIComponent(String(limit))}`, {
      credentials: "include",
      signal: controller.signal,
    }).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "desktop_release_build_history_unavailable",
        );
      }
      return desktopReleaseBuildHistoryResponseSchema.parse(payload);
    });

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutId = window.setTimeout(() => {
        controller.abort();
        reject(new Error("desktop_release_build_history_timeout"));
      }, 15000);
    });

    void Promise.race([fetchPromise, timeoutPromise])
      .then((history) => {
        if (!cancelled) {
          settled = true;
          setState({
            history,
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
            ? "desktop_release_build_history_timeout"
            : error instanceof Error
              ? error.message
              : "desktop_release_build_history_unavailable";
          setState({
            history: null,
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
  }, [enabled, limit, refreshNonce]);

  return {
    ...state,
    attempt,
  };
}
