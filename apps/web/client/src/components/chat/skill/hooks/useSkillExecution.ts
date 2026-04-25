import { useState, useCallback, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { getPostHog } from '@/lib/posthog';
import { describeSkillLocalExecution } from '@/features/local-ai/skills/skillLocalExecutionPolicy';
import { useTauriLocalSkillRuntimeStatus } from '@/features/local-ai/skills/useTauriLocalSkillRuntimeStatus';
import {
  executeExternalLocalTextCompletion,
  readConfiguredExternalLocalTextBackend,
  shouldAllowExternalLocalBackend,
  shouldAllowOnDeviceLocalEngine,
  useExternalLocalTextBackendAvailability,
} from '@/features/local-ai/adapters/externalLocalTextBackend';
import {
  buildGemma4LocalSkillPrompt,
  executeTauriLocalGemmaText,
  executeTauriLocalSkill,
} from '@/features/local-ai/skills/tauriSkillRuntime';
import {
  enqueueLocalSkillOutboxItem,
  flushLocalSkillOutbox,
  type LocalSkillOutboxItem,
} from '@/features/local-ai/skills/localSkillOutbox';
import type {
  LocalAiExecutionMode,
  ResolvedLocalSkillPolicy,
} from '@/features/local-ai/types/capability';

// Analytics tracking using PostHog
const analytics = {
  track: (event: string, properties?: Record<string, any>) => {
    const posthog = getPostHog();
    if (posthog) {
      posthog.capture(event, properties);
    }
    // Also log to console in development
    if (import.meta.env.DEV) {
      console.log('[Analytics]', event, properties);
    }
  },
};

export interface SkillExecutionResult {
  success: boolean;
  skillId: string;
  type: 'image' | 'video' | 'audio' | 'text' | 'action' | 'sandbox-job';
  resultUrl?: string;
  resultUrls?: string[];
  message?: string;
  error?: string;
  creditsUsed?: number;
  taskId?: string;
  jobId?: string;
  isAsync?: boolean;
}

export interface UseSkillExecutionOptions {
  conversationId?: number;
  platform?: 'web' | 'tauri';
  origin?:
    | 'chat'
    | 'team_room'
    | 'team_run'
    | 'agency'
    | 'public_api'
    | 'scheduler'
    | 'workflow_background'
    | 'channel_bridge';
  localAiEnabled?: boolean;
  localAiExecutionMode?: LocalAiExecutionMode;
  forceCloudOnly?: boolean;
  localExecutionPolicy?: ResolvedLocalSkillPolicy | null;
  preferredLocalProfileId?: string | null;
}

export interface UseSkillExecutionReturn {
  execute: (params: {
    skillId: string;
    prompt?: string;
    dynamicParams: Record<string, any>;
    localExecutionPolicy?: ResolvedLocalSkillPolicy | null;
    mutationInput?: Record<string, unknown>;
  }) => Promise<SkillExecutionResult | undefined>;
  isLoading: boolean;
  error: Error | null;
  result: SkillExecutionResult | null;
  reset: () => void;
}

interface LocalSkillDetail {
  skillFilePath?: string | null;
  localExecutionPolicy?: ResolvedLocalSkillPolicy | null;
  name?: string | null;
  description?: string | null;
  executionMode?: string | null;
}

export function useSkillExecution(
  options: UseSkillExecutionOptions
): UseSkillExecutionReturn {
  const {
    conversationId,
    platform = typeof window !== 'undefined' && (window as any).__TAURI__ != null ? 'tauri' : 'web',
    origin = 'chat',
    localAiEnabled = false,
    localAiExecutionMode = 'off',
    forceCloudOnly = false,
    localExecutionPolicy: defaultLocalExecutionPolicy = null,
    preferredLocalProfileId = null,
  } = options;
  const [result, setResult] = useState<SkillExecutionResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isAwaitingAsyncResult, setIsAwaitingAsyncResult] = useState(false);
  const tauriRuntimeStatus = useTauriLocalSkillRuntimeStatus();
  const externalLocalTextBackend = useExternalLocalTextBackendAvailability(platform);

  const utils = trpc.useUtils();
  const saveAssistantMessageMutation = trpc.chat.saveAssistantMessage.useMutation();

  const mutation = trpc.chat.executeSkill.useMutation({
    onSuccess: (data) => {
      setResult(data as SkillExecutionResult);
      // Invalidate messages to show result
      if (typeof conversationId === 'number' && conversationId > 0) {
        utils.chat.getMessages.invalidate({ conversationId });
      }

      // Track analytics
      analytics.track('skill_form_submitted', {
        skill_id: data.skillId,
        conversation_id: conversationId,
        success: data.success,
      });
    },
    onError: (err) => {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      analytics.track('skill_form_error', {
        conversation_id: conversationId,
        error: error.message,
      });
    },
  });

  const finishRemoteSkillResult = useCallback(
    async (executionResult: SkillExecutionResult) => {
      setResult(executionResult);
      if (typeof conversationId === 'number' && conversationId > 0) {
        await utils.chat.getMessages.invalidate({ conversationId });
      }
      analytics.track('skill_form_submitted', {
        skill_id: executionResult.skillId,
        conversation_id: conversationId,
        success: executionResult.success,
      });
      return executionResult;
    },
    [conversationId, utils.chat.getMessages],
  );

  const persistLocalSkillResult = useCallback(
    async (input: {
      skillId: string;
      message: string;
      runtimeKind: 'gemma4_text' | 'script_bundle';
      profileId?: string | null;
      provider?: string | null;
      model?: string | null;
    }) => {
      if (
        typeof conversationId !== 'number' ||
        conversationId <= 0 ||
        input.message.trim().length === 0
      ) {
        return true;
      }

      try {
        await saveAssistantMessageMutation.mutateAsync({
          conversationId,
          content: input.message,
          skillUsed: input.skillId,
          runtimeMetadata: {
            source: 'hybrid',
            profileId: input.profileId ?? undefined,
            provider: input.provider ?? undefined,
            model: input.model ?? undefined,
            taskClass: 'json_extraction',
          },
        });
        await utils.chat.getMessages.invalidate({ conversationId });
        return true;
      } catch {
        enqueueLocalSkillOutboxItem({
          conversationId,
          content: input.message,
          skillId: input.skillId,
          profileId: input.profileId ?? null,
          provider: input.provider ?? null,
          model: input.model ?? null,
          runtimeKind: input.runtimeKind,
        });
        return false;
      }
    },
    [conversationId, saveAssistantMessageMutation, utils.chat.getMessages],
  );

  const flushQueuedLocalSkillResults = useCallback(async () => {
    await flushLocalSkillOutbox({
      save: async (item: LocalSkillOutboxItem) => {
        try {
          await saveAssistantMessageMutation.mutateAsync({
            conversationId: item.conversationId,
            content: item.content,
            skillUsed: item.skillId,
            runtimeMetadata: {
              source: 'hybrid',
              profileId: item.profileId ?? undefined,
              provider: item.provider ?? undefined,
              model: item.model ?? undefined,
              taskClass: 'json_extraction',
            },
          });
          await utils.chat.getMessages.invalidate({
            conversationId: item.conversationId,
          });
          return true;
        } catch {
          return false;
        }
      },
    });
  }, [saveAssistantMessageMutation, utils.chat.getMessages]);

  useEffect(() => {
    void flushQueuedLocalSkillResults();
    const handleOnline = () => {
      void flushQueuedLocalSkillResults();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      return () => window.removeEventListener('online', handleOnline);
    }
    return undefined;
  }, [flushQueuedLocalSkillResults]);

  const resolveBlockedLocalExecutionMessage = (
    skillId: string,
    policy: ResolvedLocalSkillPolicy | null,
  ): string => {
    if (!localAiEnabled || localAiExecutionMode === 'off') {
      return `Local execution is disabled for ${skillId} on this account.`;
    }
    if (forceCloudOnly || localAiExecutionMode === 'cloud_only') {
      return `This workspace is currently restricted to cloud execution for ${skillId}.`;
    }
    if (!policy) {
      return `Local execution metadata is unavailable for ${skillId}.`;
    }
    if (policy.reason === 'tenant_disabled') {
      return `This tenant has Local AI disabled, so ${skillId} must run through the cloud path.`;
    }
    if (policy.reason === 'force_cloud_only') {
      return `This tenant is locked to cloud-only execution for ${skillId}.`;
    }
    if (policy.reason === 'user_local_ai_disabled') {
      return `Local AI is disabled in your account preferences for ${skillId}.`;
    }
    if (policy.reason === 'user_cloud_only_mode') {
      return `Your current Local AI mode is cloud_only, so ${skillId} will stay on the cloud path.`;
    }
    if (policy.reason === 'local_only_requires_local_safe_skill') {
      return `This skill is not approved for full local-only execution. Switch Local AI mode away from local_only or use a reviewed local-safe skill.`;
    }
    if (policy.reason === 'local_safe_requires_tauri') {
      return `This skill can only run locally inside the Tauri desktop app.`;
    }
    if (policy.reason === 'requires_network_not_local_safe') {
      return `This skill requires network access and cannot run in the local-safe tier.`;
    }
    if (policy.reason === 'requires_browser_not_local_safe') {
      return `This skill requires a browser-backed runtime and cannot run as a local-safe desktop skill.`;
    }
    if (policy.runtimeKind === 'gemma4_text') {
      return `Local text execution is not available on this device right now. Prepare a Gemma 4 model or configure a local OpenAI-compatible backend first.`;
    }
    if (policy.runtimeKind === 'script_bundle') {
      return `Tauri local script skill execution is not available in this build yet.`;
    }
    return `Local execution is not available for ${skillId} right now.`;
  };

  const execute = useCallback(
    async (params: {
      skillId: string;
      prompt?: string;
      dynamicParams: Record<string, any>;
      localExecutionPolicy?: ResolvedLocalSkillPolicy | null;
      mutationInput?: Record<string, unknown>;
    }): Promise<SkillExecutionResult | undefined> => {
      setResult(null);
      setError(null);

      let effectivePolicy =
        params.localExecutionPolicy ?? defaultLocalExecutionPolicy;
      let skillDetail: LocalSkillDetail | null = null;

      if (
        localAiEnabled &&
        !forceCloudOnly &&
        (effectivePolicy == null || localAiExecutionMode !== 'off')
      ) {
        try {
          const fetchedSkill = (await utils.skills.get.fetch({
            id: params.skillId,
            platform,
            origin,
            ...(typeof conversationId === 'number' && conversationId > 0
              ? { conversationId }
              : {}),
          })) as unknown as LocalSkillDetail & {
            localExecutionPolicy?: ResolvedLocalSkillPolicy | null;
          };
          skillDetail = {
            skillFilePath: fetchedSkill.skillFilePath ?? null,
            localExecutionPolicy: fetchedSkill.localExecutionPolicy ?? null,
            name: fetchedSkill.name ?? null,
            description: fetchedSkill.description ?? null,
            executionMode:
              typeof fetchedSkill.executionMode === 'string'
                ? fetchedSkill.executionMode
                : null,
          };
          effectivePolicy =
            params.localExecutionPolicy
            ?? fetchedSkill.localExecutionPolicy
            ?? defaultLocalExecutionPolicy;
        } catch {
          // Keep the caller-supplied policy or null and fall back safely.
        }
      }

      const localExecutionState = effectivePolicy
        ? describeSkillLocalExecution(effectivePolicy, platform, {
            scriptBundleAvailable: tauriRuntimeStatus.supportsScriptBundle,
            gemma4TextAvailable: shouldAllowOnDeviceLocalEngine(
              externalLocalTextBackend.localEnginePreference,
            )
              ? tauriRuntimeStatus.supportsGemma4Text
              : false,
            installedGemmaProfileIds:
              tauriRuntimeStatus.installedGemmaProfileIds,
            externalTextBackendAvailable:
              shouldAllowExternalLocalBackend(
                externalLocalTextBackend.localEnginePreference,
              ) && externalLocalTextBackend.backend != null,
          })
        : null;
      const localOnlyRequested =
        localAiEnabled && !forceCloudOnly && localAiExecutionMode === 'local_only';
      const allowCloudMediaRoute =
        skillDetail?.executionMode === 'media-generate';
      const localPreferred =
        localAiEnabled &&
        !forceCloudOnly &&
        (localAiExecutionMode === 'auto' ||
          localAiExecutionMode === 'prefer_local' ||
          localAiExecutionMode === 'local_only');

      if (
        localOnlyRequested &&
        !allowCloudMediaRoute &&
        !localExecutionState?.canRunLocally
      ) {
        const message = resolveBlockedLocalExecutionMessage(
          params.skillId,
          effectivePolicy,
        );
        const executionResult: SkillExecutionResult = {
          success: false,
          skillId: params.skillId,
          type: 'text',
          error: message,
        };
        setError(new Error(message));
        setResult(executionResult);
        analytics.track('skill_form_local_execution_blocked', {
          skill_id: params.skillId,
          conversation_id: conversationId,
          reason: effectivePolicy?.reason ?? 'local_only_blocked',
        });
        return executionResult;
      }

      if (localPreferred && localExecutionState?.canRunLocally) {
        if (effectivePolicy?.runtimeKind === 'gemma4_text') {
          const candidateProfiles = [
            preferredLocalProfileId,
            'gemma4-e4b-tauri-balanced',
            'gemma4-e2b-tauri-fast',
          ].filter(
            (value, index, values): value is string =>
              typeof value === 'string' &&
              value.trim().length > 0 &&
              values.indexOf(value) === index,
          );

          const detail = skillDetail;
          const localPrompt = buildGemma4LocalSkillPrompt({
            skillId: params.skillId,
            skillName: detail?.name ?? null,
            skillDescription: detail?.description ?? null,
            prompt: params.prompt,
            dynamicParams: params.dynamicParams,
          });

          let localTextError: string | null = null;
          const allowExternalBackend = shouldAllowExternalLocalBackend(
            externalLocalTextBackend.localEnginePreference,
          );
          const allowOnDeviceLocalEngine = shouldAllowOnDeviceLocalEngine(
            externalLocalTextBackend.localEnginePreference,
          );
          const configuredExternalBackend = allowExternalBackend
            ? readConfiguredExternalLocalTextBackend(
                externalLocalTextBackend.scope,
              )
            : null;
          if (configuredExternalBackend) {
            try {
              const externalResult = await executeExternalLocalTextCompletion({
                config: configuredExternalBackend,
                prompt: localPrompt,
                maxTokens: 512,
                temperature: 0.2,
              });
              await persistLocalSkillResult({
                skillId: params.skillId,
                message: externalResult.text,
                runtimeKind: 'gemma4_text',
                profileId: externalResult.model,
                provider: externalResult.provider,
                model: externalResult.model,
              });
              const executionResult: SkillExecutionResult = {
                success: true,
                skillId: params.skillId,
                type: 'text',
                message: externalResult.text,
              };
              setResult(executionResult);
              analytics.track('skill_form_local_execution_succeeded', {
                skill_id: params.skillId,
                conversation_id: conversationId,
                runtime_kind: effectivePolicy.runtimeKind,
                profile_id: externalResult.model,
                mode: localAiExecutionMode,
                local_backend: 'openai_compatible_local',
              });
              return executionResult;
            } catch (error) {
              localTextError =
                error instanceof Error
                  ? error.message
                  : 'external_local_text_backend_failed';
            }
          }

          if (platform === 'tauri' && allowOnDeviceLocalEngine) {
            for (const profileId of candidateProfiles) {
              const localTextResult = await executeTauriLocalGemmaText({
                profileId,
                prompt: localPrompt,
              });

              if (localTextResult.success) {
                await persistLocalSkillResult({
                  skillId: params.skillId,
                  message: localTextResult.text,
                  runtimeKind: 'gemma4_text',
                  profileId,
                  model: profileId,
                });
                const executionResult: SkillExecutionResult = {
                  success: true,
                  skillId: params.skillId,
                  type: 'text',
                  message: localTextResult.text,
                };
                setResult(executionResult);
                analytics.track('skill_form_local_execution_succeeded', {
                  skill_id: params.skillId,
                  conversation_id: conversationId,
                  runtime_kind: effectivePolicy.runtimeKind,
                  profile_id: profileId,
                  mode: localAiExecutionMode,
                });
                return executionResult;
              }

              localTextError = localTextResult.error ?? 'local_gemma4_text_failed';
            }
          }

          if (localOnlyRequested) {
            const message =
              localTextError ??
              resolveBlockedLocalExecutionMessage(params.skillId, effectivePolicy);
            const executionResult: SkillExecutionResult = {
              success: false,
              skillId: params.skillId,
              type: 'text',
              error: message,
            };
            setError(new Error(message));
            setResult(executionResult);
            analytics.track('skill_form_local_execution_blocked', {
              skill_id: params.skillId,
              conversation_id: conversationId,
              reason: effectivePolicy?.reason ?? 'local_gemma_runtime_failed',
            });
            return executionResult;
          }

          analytics.track('skill_form_local_execution_fallback', {
            skill_id: params.skillId,
            conversation_id: conversationId,
            runtime_kind: effectivePolicy.runtimeKind,
            mode: localAiExecutionMode,
            local_error: localTextError ?? 'unknown',
          });
        } else if (
          platform === 'tauri' &&
          effectivePolicy?.runtimeKind === 'script_bundle'
        ) {
          const localSkillPath =
            typeof skillDetail?.skillFilePath === 'string' &&
            skillDetail.skillFilePath.trim().length > 0
              ? skillDetail.skillFilePath
              : null;
          if (!localSkillPath) {
            if (localOnlyRequested) {
              const message = resolveBlockedLocalExecutionMessage(
                params.skillId,
                effectivePolicy,
              );
              const executionResult: SkillExecutionResult = {
                success: false,
                skillId: params.skillId,
                type: 'text',
                error: message,
              };
              setError(new Error(message));
              setResult(executionResult);
              return executionResult;
            }
            analytics.track('skill_form_local_execution_fallback', {
              skill_id: params.skillId,
              conversation_id: conversationId,
              runtime_kind: effectivePolicy.runtimeKind,
              mode: localAiExecutionMode,
              local_error: 'missing_skill_file_path',
            });
          } else {
          const localResult = await executeTauriLocalSkill({
            skillId: params.skillId,
            skillFilePath: localSkillPath,
            policy: effectivePolicy,
            prompt: params.prompt,
            dynamicParams: params.dynamicParams,
            conversationId,
            origin,
          });

          if (localResult.success) {
            if (typeof localResult.message === 'string' && localResult.message.trim()) {
              await persistLocalSkillResult({
                skillId: params.skillId,
                message: localResult.message,
                runtimeKind: 'script_bundle',
              });
            }
            const executionResult = localResult as SkillExecutionResult;
            setResult(executionResult);
            analytics.track('skill_form_local_execution_succeeded', {
              skill_id: params.skillId,
              conversation_id: conversationId,
              runtime_kind: effectivePolicy.runtimeKind,
              mode: localAiExecutionMode,
            });
            return executionResult;
          }

          if (localOnlyRequested) {
            setError(new Error(localResult.error || 'Local skill execution failed.'));
            setResult(localResult as SkillExecutionResult);
            analytics.track('skill_form_local_execution_blocked', {
              skill_id: params.skillId,
              conversation_id: conversationId,
              reason: effectivePolicy?.reason ?? 'local_runtime_failed',
            });
            return localResult as SkillExecutionResult;
          }

          analytics.track('skill_form_local_execution_fallback', {
            skill_id: params.skillId,
            conversation_id: conversationId,
            runtime_kind: effectivePolicy?.runtimeKind ?? 'none',
            mode: localAiExecutionMode,
            local_error: localResult.error ?? 'unknown',
          });
          }
        } else {
          analytics.track('skill_form_local_execution_fallback', {
            skill_id: params.skillId,
            conversation_id: conversationId,
            runtime_kind: effectivePolicy?.runtimeKind ?? 'none',
            mode: localAiExecutionMode,
          });
          if (localOnlyRequested) {
            const message = resolveBlockedLocalExecutionMessage(
              params.skillId,
              effectivePolicy,
            );
            const executionResult: SkillExecutionResult = {
              success: false,
              skillId: params.skillId,
              type: 'text',
              error: message,
            };
            setError(new Error(message));
            setResult(executionResult);
            return executionResult;
          }
        }
      }

      try {
        const _data = await mutation.mutateAsync({
          skillId: params.skillId,
          prompt: params.prompt,
          dynamicParams: params.dynamicParams,
          ...(typeof conversationId === 'number' && conversationId > 0
            ? { conversationId }
            : {}),
          platform,
          origin,
          requestedExecutionRoute:
            allowCloudMediaRoute
              ? 'cloud'
              :
            localAiEnabled &&
            !forceCloudOnly &&
            localAiExecutionMode === 'local_only' &&
            !allowCloudMediaRoute
              ? 'cloud'
              : localAiEnabled && !forceCloudOnly && localAiExecutionMode !== 'off'
              ? 'cloud_fallback'
              : 'cloud',
          ...(params.mutationInput ?? {}),
        });
        // Cast to include async handles present on the fast-return paths
        const data = _data as typeof _data & { isAsync?: boolean; taskId?: string; jobId?: string };

        // Long-running Python skills return isAsync:true + taskId immediately.
        // Poll until the background task finishes (avoids Cloudflare 100s timeout).
        if (data.isAsync && data.taskId) {
          const taskId = data.taskId;
          setIsAwaitingAsyncResult(true);
          const maxAttempts = 200; // 10 minutes at 3s, matching the server Python timeout.
          for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            await new Promise<void>((r) => setTimeout(r, 3000));
            const task = await utils.chat.getSkillTaskResult.fetch({ taskId });
            if (task.status === "done") {
              if (!task.result) {
                return finishRemoteSkillResult({
                  success: false,
                  skillId: params.skillId,
                  type: "text",
                  error: "Task completed with no result",
                });
              }
              return finishRemoteSkillResult(task.result as SkillExecutionResult);
            }
            if (task.status === "not_found") {
              return finishRemoteSkillResult({
                success: false,
                skillId: params.skillId,
                type: "text",
                error: "Task not found or expired",
              });
            }
            // status === "running" → keep polling
          }
          return finishRemoteSkillResult({
            success: false,
            skillId: params.skillId,
            type: "text",
            error: "Task timed out while waiting for the Python skill result",
          });
        }

        // Sandbox-backed media skills return isAsync:true + jobId.
        if (data.isAsync && data.jobId) {
          const jobId = data.jobId;
          setIsAwaitingAsyncResult(true);
          const maxAttempts = 200;
          for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            await new Promise<void>((r) => setTimeout(r, 3000));
            const job = await utils.sandbox.getJobStatus.fetch({ jobId });
            if (job.status === "completed") {
              const artifacts = Array.isArray((job as any).artifacts)
                ? (job as any).artifacts
                : [];
              const imageArtifacts = artifacts.filter((artifact: any) =>
                typeof artifact?.url === "string"
                && (
                  String(artifact?.mimeType || "").toLowerCase().startsWith("image/")
                  || String(artifact?.key || "").toLowerCase().match(/\.(png|jpe?g|webp|gif|svg)$/)
                ));
              return finishRemoteSkillResult({
                success: true,
                skillId: params.skillId,
                type: imageArtifacts.length > 0 ? "image" : "text",
                resultUrl: imageArtifacts[0]?.url,
                resultUrls: imageArtifacts.map((artifact: any) => artifact.url),
                message: imageArtifacts.length > 0
                  ? "Image generated successfully!"
                  : data.message || "Sandbox job completed successfully.",
                isAsync: true,
                jobId,
              });
            }
            if (job.status === "failed" || job.status === "timed_out") {
              return finishRemoteSkillResult({
                success: false,
                skillId: params.skillId,
                type: "text",
                error:
                  (job as any).label
                || "Sandbox job failed",
                isAsync: true,
                jobId,
              });
            }
            if (job.status === "canceled" || job.status === "cancelled") {
              return finishRemoteSkillResult({
                success: false,
                skillId: params.skillId,
                type: "text",
                error: "Sandbox job was cancelled",
                isAsync: true,
                jobId,
              });
            }
            // queued/running → keep polling
          }
          return finishRemoteSkillResult({
            success: false,
            skillId: params.skillId,
            type: "text",
            error: "Sandbox job timed out while waiting for the result",
            isAsync: true,
            jobId,
          });
        }

        return data as SkillExecutionResult;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        analytics.track('skill_form_error', {
          conversation_id: conversationId,
          error: error.message,
        });
        return undefined;
      } finally {
        setIsAwaitingAsyncResult(false);
      }
    },
    [
      conversationId,
      defaultLocalExecutionPolicy,
      forceCloudOnly,
      localAiEnabled,
      localAiExecutionMode,
      mutation,
      origin,
      platform,
      preferredLocalProfileId,
      finishRemoteSkillResult,
      tauriRuntimeStatus.installedGemmaProfileIds,
      tauriRuntimeStatus.supportsGemma4Text,
      tauriRuntimeStatus.supportsScriptBundle,
      externalLocalTextBackend.backend,
      externalLocalTextBackend.localEnginePreference,
      externalLocalTextBackend.scope,
      utils,
    ]
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setIsAwaitingAsyncResult(false);
  }, []);

  return {
    execute,
    isLoading: mutation.isPending || isAwaitingAsyncResult,
    error,
    result,
    reset,
  };
}
