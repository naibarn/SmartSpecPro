/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSkillExecution } from './useSkillExecution';

// Mock PostHog
vi.mock('@/lib/posthog', () => ({
  getPostHog: vi.fn(() => ({
    capture: vi.fn(),
  })),
}));

// Mock tRPC with proper hook behavior
const mockMutateAsync = vi.fn();
let mockSuccessCallback: ((data: any) => void) | null = null;
let mockErrorCallback: ((error: Error) => void) | null = null;

vi.mock('@/lib/trpc', () => ({
  trpc: {
    chat: {
      executeSkill: {
        useMutation: vi.fn((options?: { onSuccess?: (data: any) => void; onError?: (error: Error) => void }) => {
          if (options?.onSuccess) mockSuccessCallback = options.onSuccess;
          if (options?.onError) mockErrorCallback = options.onError;
          return {
            mutateAsync: (...args: any[]) => mockMutateAsync(...args),
            isPending: false,
            error: null,
          };
        }),
      },
    },
    useUtils: vi.fn(() => ({
      chat: {
        getMessages: {
          invalidate: vi.fn(),
        },
      },
    })),
  },
}));

describe('useSkillExecution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSuccessCallback = null;
    mockErrorCallback = null;
  });

  it('returns initial state', () => {
    const { result } = renderHook(() =>
      useSkillExecution({ conversationId: 123 })
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.result).toBeNull();
  });

  it('calls executeSkill mutation with correct parameters', async () => {
    const mockResult = {
      success: true,
      skillId: 'test-skill',
      type: 'text',
      message: 'Success',
    };
    mockMutateAsync.mockResolvedValue(mockResult);

    const { result } = renderHook(() =>
      useSkillExecution({ conversationId: 123 })
    );

    await act(async () => {
      await result.current.execute({
        skillId: 'test-skill',
        dynamicParams: { key: 'value' },
      });
    });

    expect(mockMutateAsync).toHaveBeenCalledWith({
      skillId: 'test-skill',
      prompt: undefined,
      dynamicParams: { key: 'value' },
      conversationId: 123,
    });
  });

  it('returns result on successful execution', async () => {
    const mockResult = {
      success: true,
      skillId: 'test-skill',
      type: 'image',
      resultUrls: ['http://example.com/image.png'],
    };
    mockMutateAsync.mockResolvedValue(mockResult);

    const { result } = renderHook(() =>
      useSkillExecution({ conversationId: 123 })
    );

    let executionResult;
    await act(async () => {
      executionResult = await result.current.execute({
        skillId: 'test-skill',
        dynamicParams: {},
      });
    });

    expect(executionResult).toEqual(mockResult);
  });

  it('returns undefined on execution failure', async () => {
    const mockError = new Error('Execution failed');
    mockMutateAsync.mockRejectedValue(mockError);

    const { result } = renderHook(() =>
      useSkillExecution({ conversationId: 123 })
    );

    let executionResult;
    await act(async () => {
      executionResult = await result.current.execute({
        skillId: 'test-skill',
        dynamicParams: {},
      });
    });

    // Should return undefined when error occurs
    expect(executionResult).toBeUndefined();
  });

  it.skip('isLoading is true during execution', async () => {
    let resolveMutation: (value: any) => void;
    const mutationPromise = new Promise((resolve) => {
      resolveMutation = resolve;
    });
    mockMutateAsync.mockReturnValue(mutationPromise);

    const { result } = renderHook(() =>
      useSkillExecution({ conversationId: 123 })
    );

    act(() => {
      result.current.execute({
        skillId: 'test-skill',
        dynamicParams: {},
      });
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveMutation!({ success: true, skillId: 'test-skill' });
    });

    expect(result.current.isLoading).toBe(false);
  });

  it('reset clears error and result', async () => {
    const mockResult = {
      success: true,
      skillId: 'test-skill',
      type: 'text',
    };
    mockMutateAsync.mockResolvedValue(mockResult);

    const { result } = renderHook(() =>
      useSkillExecution({ conversationId: 123 })
    );

    await act(async () => {
      await result.current.execute({
        skillId: 'test-skill',
        dynamicParams: {},
      });
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
