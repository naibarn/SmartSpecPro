import { useState, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { getPostHog } from '@/lib/posthog';

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
  conversationId: number;
}

export interface UseSkillExecutionReturn {
  execute: (params: {
    skillId: string;
    prompt?: string;
    dynamicParams: Record<string, any>;
  }) => Promise<SkillExecutionResult | undefined>;
  isLoading: boolean;
  error: Error | null;
  result: SkillExecutionResult | null;
  reset: () => void;
}

export function useSkillExecution(
  options: UseSkillExecutionOptions
): UseSkillExecutionReturn {
  const { conversationId } = options;
  const [result, setResult] = useState<SkillExecutionResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const utils = trpc.useUtils();

  const mutation = trpc.chat.executeSkill.useMutation({
    onSuccess: (data) => {
      setResult(data as SkillExecutionResult);
      // Invalidate messages to show result
      utils.chat.getMessages.invalidate({ conversationId });

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

  const execute = useCallback(
    async (params: {
      skillId: string;
      prompt?: string;
      dynamicParams: Record<string, any>;
    }): Promise<SkillExecutionResult | undefined> => {
      setResult(null);
      setError(null);

      try {
        const _data = await mutation.mutateAsync({
          skillId: params.skillId,
          prompt: params.prompt,
          dynamicParams: params.dynamicParams,
          conversationId,
        });
        // Cast to include async handles present on the fast-return paths
        const data = _data as typeof _data & { isAsync?: boolean; taskId?: string; jobId?: string };

        // Long-running Python skills return isAsync:true + taskId immediately.
        // Poll until the background task finishes (avoids Cloudflare 100s timeout).
        if (data.isAsync && data.taskId) {
          const taskId = data.taskId;
          while (true) {
            await new Promise<void>((r) => setTimeout(r, 3000));
            const task = await utils.chat.getSkillTaskResult.fetch({ taskId });
            if (task.status === "done") {
              if (!task.result) {
                return { success: false, skillId: params.skillId, type: "text", error: "Task completed with no result" };
              }
              return task.result as SkillExecutionResult;
            }
            if (task.status === "not_found") {
              return { success: false, skillId: params.skillId, type: "text", error: "Task not found or expired" };
            }
            // status === "running" → keep polling
          }
        }

        // Sandbox-backed media skills return isAsync:true + jobId.
        if (data.isAsync && data.jobId) {
          const jobId = data.jobId;
          while (true) {
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
              return {
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
              };
            }
            if (job.status === "failed" || job.status === "timed_out") {
              return {
                success: false,
                skillId: params.skillId,
                type: "text",
                error:
                  (job as any).label
                  || "Sandbox job failed",
                isAsync: true,
                jobId,
              };
            }
            if (job.status === "canceled" || job.status === "cancelled") {
              return {
                success: false,
                skillId: params.skillId,
                type: "text",
                error: "Sandbox job was cancelled",
                isAsync: true,
                jobId,
              };
            }
            // queued/running → keep polling
          }
        }

        return data as SkillExecutionResult;
      } catch (err) {
        // Error is handled by onError callback
        return undefined;
      }
    },
    [conversationId, mutation, utils]
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return {
    execute,
    isLoading: mutation.isPending,
    error,
    result,
    reset,
  };
}
