import { renderHook, act, waitFor } from '@testing-library/react';
import { useSkillExecution } from './useSkillExecution';

// Mock tRPC
jest.mock('@/lib/trpc', () => ({
  trpc: {
    chat: {
      executeSkill: {
        useMutation: jest.fn(() => ({
          mutateAsync: jest.fn(),
          isPending: false,
          error: null,
        })),
      },
    },
    useUtils: jest.fn(() => ({
      chat: {
        getMessages: {
          invalidate: jest.fn(),
        },
      },
    })),
  },
}));

import { trpc } from '@/lib/trpc';

const mockMutateAsync = jest.fn();
const mockInvalidate = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (trpc.chat.executeSkill.useMutation as jest.Mock).mockReturnValue({
    mutateAsync: mockMutateAsync,
    isPending: false,
    error: null,
  });
  (trpc.useUtils as jest.Mock).mockReturnValue({
    chat: {
      getMessages: {
        invalidate: mockInvalidate,
      },
    },
  });
});

describe('useSkillExecution', () => {
  it('returns initial state', () => {
    const { result } = renderHook(() =>
      useSkillExecution({ conversationId: 123 })
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.result).toBeNull();
  });

  it('calls executeSkill mutation', async () => {
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

  it('sets result on success', async () => {
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

    await act(async () => {
      await result.current.execute({
        skillId: 'test-skill',
        dynamicParams: {},
      });
    });

    expect(result.current.result).toEqual(mockResult);
    expect(result.current.error).toBeNull();
  });

  it('sets error on failure', async () => {
    const mockError = new Error('Execution failed');
    mockMutateAsync.mockRejectedValue(mockError);

    const { result } = renderHook(() =>
      useSkillExecution({ conversationId: 123 })
    );

    await act(async () => {
      await result.current.execute({
        skillId: 'test-skill',
        dynamicParams: {},
      });
    });

    expect(result.current.error).toBe(mockError);
    expect(result.current.result).toBeNull();
  });

  it('invalidates messages cache on success', async () => {
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

    expect(mockInvalidate).toHaveBeenCalledWith({ conversationId: 123 });
  });

  it('resets state', async () => {
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

    expect(result.current.result).not.toBeNull();

    act(() => {
      result.current.reset();
    });

    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('clears previous result on new execution', async () => {
    const mockResult1 = {
      success: true,
      skillId: 'skill-1',
      type: 'text',
    };
    const mockResult2 = {
      success: true,
      skillId: 'skill-2',
      type: 'text',
    };
    mockMutateAsync
      .mockResolvedValueOnce(mockResult1)
      .mockResolvedValueOnce(mockResult2);

    const { result } = renderHook(() =>
      useSkillExecution({ conversationId: 123 })
    );

    await act(async () => {
      await result.current.execute({
        skillId: 'skill-1',
        dynamicParams: {},
      });
    });

    expect(result.current.result?.skillId).toBe('skill-1');

    await act(async () => {
      await result.current.execute({
        skillId: 'skill-2',
        dynamicParams: {},
      });
    });

    expect(result.current.result?.skillId).toBe('skill-2');
  });
});
