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
  type: 'image' | 'video' | 'audio' | 'text' | 'action';
  resultUrl?: string;
  resultUrls?: string[];
  message?: string;
  error?: string;
  creditsUsed?: number;
  taskId?: string;
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
      setError(err);
      analytics.track('skill_form_error', {
        conversation_id: conversationId,
        error: err.message,
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
        const data = await mutation.mutateAsync({
          skillId: params.skillId,
          prompt: params.prompt,
          dynamicParams: params.dynamicParams,
          conversationId,
        });

        return data as SkillExecutionResult;
      } catch (err) {
        // Error is handled by onError callback
        return undefined;
      }
    },
    [conversationId, mutation]
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
