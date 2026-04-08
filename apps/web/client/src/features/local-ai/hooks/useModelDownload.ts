import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { LocalAiCatalogEntry } from "../types/capability";
import type { LocalAiDeviceStateScope } from "../types/deviceState";
import {
  readLocalAiDeviceState,
  writeLocalAiDeviceState,
} from "../state/localAiDeviceStateStorage";
import {
  cancelBrowserLocalRuntimeModelDownload,
  cacheBrowserLocalRuntimeModel,
  getBrowserLocalRuntimeModelDownloadProgress,
  removeCachedBrowserLocalRuntimeModel,
} from "../adapters/browserLocalRuntime";
import {
  prepareTauriLocalGemmaModel,
  repairTauriLocalGemmaModel,
  removeTauriLocalGemmaModel,
  updateTauriLocalGemmaModel,
  verifyTauriLocalGemmaModel,
} from "../skills/tauriSkillRuntime";

export interface LocalAiModelDownloadState {
  action: "download" | "remove" | "verify" | "repair" | "update" | null;
  status:
    | "idle"
    | "blocked"
    | "downloading"
    | "paused"
    | "success"
    | "error";
  reason: string | null;
  activeProfileId: string | null;
  downloadedBytes: number;
  totalBytes: number | null;
  progressPercent: number | null;
  resumable: boolean;
  updatedAt: string | null;
}

interface UseModelDownloadOptions {
  scope?: LocalAiDeviceStateScope | null;
  catalog?: LocalAiCatalogEntry[] | null;
}

function mergeUnique(values: string[], nextValue: string): string[] {
  if (values.includes(nextValue)) {
    return values;
  }
  return [...values, nextValue];
}

export function useModelDownload(options: UseModelDownloadOptions = {}) {
  const scope = options.scope ?? null;
  const catalog = options.catalog ?? [];
  const queryClient = useQueryClient();
  const [state, setState] = useState<LocalAiModelDownloadState>({
    action: null,
    status: "idle",
    reason: null,
    activeProfileId: null,
    downloadedBytes: 0,
    totalBytes: null,
    progressPercent: null,
    resumable: false,
    updatedAt: null,
  });
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const commitState = useCallback(
    (nextOrUpdater: SetStateAction<LocalAiModelDownloadState>) => {
      setState((current) => {
        const next =
          typeof nextOrUpdater === "function"
            ? (
                nextOrUpdater as (
                  current: LocalAiModelDownloadState,
                ) => LocalAiModelDownloadState
              )(current)
            : nextOrUpdater;
        stateRef.current = next;
        return next;
      });
    },
    [],
  );

  const isModelInstalled = useCallback(
    (profileId: string): boolean => {
      if (!scope) {
        return false;
      }
      return readLocalAiDeviceState(scope).installedModelIds.includes(profileId);
    },
    [scope],
  );

  const startDownload = useCallback(
    async (
      profile: LocalAiCatalogEntry,
      options?: { resume?: boolean; retry?: boolean },
    ) => {
      if (!scope) {
        commitState({
          action: "download",
          status: "blocked",
          reason: "device_scope_unavailable",
          activeProfileId: profile.id,
          downloadedBytes: 0,
          totalBytes: null,
          progressPercent: null,
          resumable: false,
          updatedAt: new Date().toISOString(),
        });
        return false;
      }

      const deviceState = readLocalAiDeviceState(scope);
      if (!deviceState.allowDownloads) {
        commitState({
          action: "download",
          status: "blocked",
          reason: "downloads_disabled_for_device",
          activeProfileId: profile.id,
          downloadedBytes: 0,
          totalBytes: null,
          progressPercent: null,
          resumable: false,
          updatedAt: new Date().toISOString(),
        });
        return false;
      }
      if (profile.status !== "allowed") {
        commitState({
          action: "download",
          status: "blocked",
          reason: "profile_not_allowed",
          activeProfileId: profile.id,
          downloadedBytes: 0,
          totalBytes: null,
          progressPercent: null,
          resumable: false,
          updatedAt: new Date().toISOString(),
        });
        return false;
      }
      if (!profile.supportedPlatforms.includes(scope.runtimeNamespace)) {
        commitState({
          action: "download",
          status: "blocked",
          reason: "profile_not_supported_on_this_surface",
          activeProfileId: profile.id,
          downloadedBytes: 0,
          totalBytes: null,
          progressPercent: null,
          resumable: false,
          updatedAt: new Date().toISOString(),
        });
        return false;
      }

      const installedBudgetMb = deviceState.installedModelIds
        .filter((entryId) => entryId !== profile.id)
        .reduce((sum, entryId) => {
          const installedEntry =
            catalog.find((catalogEntry) => catalogEntry.id === entryId) ?? null;
          return sum + (installedEntry?.approximateSizeMb ?? 0);
        }, 0);
      if (
        profile.approximateSizeMb + installedBudgetMb >
        deviceState.storageBudgetMb
      ) {
        commitState({
          action: "download",
          status: "blocked",
          reason: "storage_budget_exceeded",
          activeProfileId: profile.id,
          downloadedBytes: 0,
          totalBytes: null,
          progressPercent: null,
          resumable: false,
          updatedAt: new Date().toISOString(),
        });
        return false;
      }

      commitState({
        action: "download",
        status: "downloading",
        reason: null,
        activeProfileId: profile.id,
        downloadedBytes: 0,
        totalBytes: null,
        progressPercent: null,
        resumable: Boolean(options?.resume),
        updatedAt: new Date().toISOString(),
      });

      try {
        if (scope.runtimeNamespace === "tauri") {
          const prepared = await prepareTauriLocalGemmaModel(profile.id);
          if (!prepared.installed) {
            throw new Error(prepared.error ?? "tauri_model_prepare_failed");
          }
          await queryClient.invalidateQueries({
            queryKey: ["local-ai", "tauri-skill-runtime"],
          });
        } else {
          await cacheBrowserLocalRuntimeModel(profile, {
            resume: options?.resume,
            retry: options?.retry,
            onProgress: (progress) => {
              commitState({
                action: "download",
                status: "downloading",
                reason: null,
                activeProfileId: profile.id,
                downloadedBytes: progress.downloadedBytes,
                totalBytes: progress.totalBytes,
                progressPercent: progress.progressPercent,
                resumable: progress.resumable,
                updatedAt: new Date().toISOString(),
              });
            },
          });
        }
        writeLocalAiDeviceState(scope, {
          consentedModelIds: mergeUnique(
            deviceState.consentedModelIds,
            profile.id,
          ),
          installedModelIds: mergeUnique(
            deviceState.installedModelIds,
            profile.id,
          ),
          lastCapabilityCheckAt: new Date().toISOString(),
        });
        commitState({
          action: "download",
          status: "success",
          reason: null,
          activeProfileId: profile.id,
          downloadedBytes: 0,
          totalBytes: null,
          progressPercent: 100,
          resumable: false,
          updatedAt: new Date().toISOString(),
        });
        return true;
      } catch (error) {
        const browserProgress =
          scope.runtimeNamespace === "web"
            ? getBrowserLocalRuntimeModelDownloadProgress(profile.id)
            : null;
        const cancelled =
          error instanceof Error && error.message === "model_download_cancelled";
        commitState({
          action: "download",
          status: cancelled ? "paused" : "error",
          reason:
            error instanceof Error ? error.message : "model_download_failed",
          activeProfileId: profile.id,
          downloadedBytes: browserProgress?.downloadedBytes ?? 0,
          totalBytes: browserProgress?.totalBytes ?? null,
          progressPercent: browserProgress?.progressPercent ?? null,
          resumable: browserProgress?.resumable ?? false,
          updatedAt: new Date().toISOString(),
        });
        return false;
      }
    },
    [catalog, commitState, queryClient, scope],
  );

  const removeDownloadedModel = useCallback(
    async (profile: LocalAiCatalogEntry) => {
      if (!scope) {
        return false;
      }

      commitState({
        action: "remove",
        status: "downloading",
        reason: null,
        activeProfileId: profile.id,
        downloadedBytes: 0,
        totalBytes: null,
        progressPercent: null,
        resumable: false,
        updatedAt: new Date().toISOString(),
      });

      try {
        if (!profile.supportedPlatforms.includes(scope.runtimeNamespace)) {
          throw new Error("profile_not_supported_on_this_surface");
        }
        if (scope.runtimeNamespace === "tauri") {
          const removed = await removeTauriLocalGemmaModel(profile.id);
          if (removed.error) {
            throw new Error(removed.error);
          }
          if (removed.installed && removed.managed) {
            throw new Error(removed.error ?? "tauri_model_remove_failed");
          }
          await queryClient.invalidateQueries({
            queryKey: ["local-ai", "tauri-skill-runtime"],
          });
        } else {
          await removeCachedBrowserLocalRuntimeModel(profile);
        }
        const deviceState = readLocalAiDeviceState(scope);
        writeLocalAiDeviceState(scope, {
          installedModelIds: deviceState.installedModelIds.filter(
            (entryId) => entryId !== profile.id,
          ),
          lastCapabilityCheckAt: new Date().toISOString(),
        });
        commitState({
          action: "remove",
          status: "success",
          reason: null,
          activeProfileId: profile.id,
          downloadedBytes: 0,
          totalBytes: null,
          progressPercent: null,
          resumable: false,
          updatedAt: new Date().toISOString(),
        });
        return true;
      } catch (error) {
        commitState({
          action: "remove",
          status: "error",
          reason:
            error instanceof Error ? error.message : "model_remove_failed",
          activeProfileId: profile.id,
          downloadedBytes: 0,
          totalBytes: null,
          progressPercent: null,
          resumable: false,
          updatedAt: new Date().toISOString(),
        });
        return false;
      }
    },
    [commitState, queryClient, scope],
  );

  const cancelDownload = useCallback(
    (profileId: string) => {
      if (!scope || scope.runtimeNamespace !== "web") {
        return false;
      }
      const cancelled = cancelBrowserLocalRuntimeModelDownload(profileId);
      if (cancelled) {
        const progress = getBrowserLocalRuntimeModelDownloadProgress(profileId);
        commitState({
          action: "download",
          status: "paused",
          reason: "model_download_cancelled",
          activeProfileId: profileId,
          downloadedBytes: progress?.downloadedBytes ?? 0,
          totalBytes: progress?.totalBytes ?? null,
          progressPercent: progress?.progressPercent ?? null,
          resumable: progress?.resumable ?? false,
          updatedAt: new Date().toISOString(),
        });
      }
      return cancelled;
    },
    [commitState, scope],
  );

  const resumeDownload = useCallback(
    async (profile: LocalAiCatalogEntry) => startDownload(profile, { resume: true }),
    [startDownload],
  );

  const retryDownload = useCallback(
    async (profile: LocalAiCatalogEntry) => startDownload(profile, { retry: true }),
    [startDownload],
  );

  const clearDownloadError = useCallback(() => {
    commitState({
      action: null,
      status: "idle",
      reason: null,
      activeProfileId: null,
      downloadedBytes: 0,
      totalBytes: null,
      progressPercent: null,
      resumable: false,
      updatedAt: null,
    });
  }, [commitState]);

  const getSnapshot = useCallback(() => stateRef.current, []);

  const refreshRuntimeStatus = useCallback(async () => {
    if (scope?.runtimeNamespace === "tauri") {
      await queryClient.invalidateQueries({
        queryKey: ["local-ai", "tauri-skill-runtime"],
      });
    }
  }, [queryClient, scope?.runtimeNamespace]);

  const verifyInstalledModel = useCallback(
    async (profile: LocalAiCatalogEntry) => {
      if (scope?.runtimeNamespace !== "tauri") {
        return null;
      }
      commitState((current) => ({
        ...current,
        action: "verify",
        status: "downloading",
        reason: null,
        activeProfileId: profile.id,
        updatedAt: new Date().toISOString(),
      }));
      const result = await verifyTauriLocalGemmaModel(profile.id);
      commitState({
        action: "verify",
        status: result.verified ? "success" : "error",
        reason: result.error ?? result.verificationError ?? null,
        activeProfileId: profile.id,
        downloadedBytes: 0,
        totalBytes: null,
        progressPercent: result.verified ? 100 : null,
        resumable: false,
        updatedAt: new Date().toISOString(),
      });
      await refreshRuntimeStatus();
      return result;
    },
    [commitState, refreshRuntimeStatus, scope?.runtimeNamespace],
  );

  const updateInstalledModel = useCallback(
    async (profile: LocalAiCatalogEntry) => {
      if (scope?.runtimeNamespace !== "tauri") {
        return null;
      }
      commitState((current) => ({
        ...current,
        action: "update",
        status: "downloading",
        reason: null,
        activeProfileId: profile.id,
        updatedAt: new Date().toISOString(),
      }));
      const result = await updateTauriLocalGemmaModel(profile.id);
      if (scope) {
        writeLocalAiDeviceState(scope, {
          installedModelIds: result.installed
            ? mergeUnique(readLocalAiDeviceState(scope).installedModelIds, profile.id)
            : readLocalAiDeviceState(scope).installedModelIds.filter(
                (entryId) => entryId !== profile.id,
              ),
          lastCapabilityCheckAt: new Date().toISOString(),
        });
      }
      commitState({
        action: "update",
        status: result.error ? "error" : "success",
        reason: result.error ?? result.verificationError ?? null,
        activeProfileId: profile.id,
        downloadedBytes: 0,
        totalBytes: null,
        progressPercent: result.installed ? 100 : null,
        resumable: false,
        updatedAt: new Date().toISOString(),
      });
      await refreshRuntimeStatus();
      return result;
    },
    [commitState, refreshRuntimeStatus, scope],
  );

  const repairInstalledModel = useCallback(
    async (profile: LocalAiCatalogEntry) => {
      if (scope?.runtimeNamespace !== "tauri") {
        return null;
      }
      commitState((current) => ({
        ...current,
        action: "repair",
        status: "downloading",
        reason: null,
        activeProfileId: profile.id,
        updatedAt: new Date().toISOString(),
      }));
      const result = await repairTauriLocalGemmaModel(profile.id);
      if (scope) {
        writeLocalAiDeviceState(scope, {
          installedModelIds: result.installed
            ? mergeUnique(readLocalAiDeviceState(scope).installedModelIds, profile.id)
            : readLocalAiDeviceState(scope).installedModelIds.filter(
                (entryId) => entryId !== profile.id,
              ),
          lastCapabilityCheckAt: new Date().toISOString(),
        });
      }
      commitState({
        action: "repair",
        status: result.error ? "error" : "success",
        reason: result.error ?? result.verificationError ?? null,
        activeProfileId: profile.id,
        downloadedBytes: 0,
        totalBytes: null,
        progressPercent: result.installed ? 100 : null,
        resumable: false,
        updatedAt: new Date().toISOString(),
      });
      await refreshRuntimeStatus();
      return result;
    },
    [commitState, refreshRuntimeStatus, scope],
  );

  return useMemo(
    () => ({
      ...state,
      startDownload,
      resumeDownload,
      retryDownload,
      cancelDownload,
      removeDownloadedModel,
      verifyInstalledModel,
      updateInstalledModel,
      repairInstalledModel,
      clearDownloadError,
      getSnapshot,
      refreshRuntimeStatus,
      isModelInstalled,
    }),
    [
      clearDownloadError,
      cancelDownload,
      getSnapshot,
      isModelInstalled,
      removeDownloadedModel,
      repairInstalledModel,
      refreshRuntimeStatus,
      resumeDownload,
      retryDownload,
      startDownload,
      state,
      updateInstalledModel,
      verifyInstalledModel,
    ],
  );
}
