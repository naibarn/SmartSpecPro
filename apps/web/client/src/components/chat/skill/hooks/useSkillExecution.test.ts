/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSkillExecution } from './useSkillExecution';

const mockExecuteTauriLocalSkill = vi.fn();
const mockExecuteTauriLocalGemmaText = vi.fn();
const mockExecuteExternalLocalTextCompletion = vi.fn();
const mockReadConfiguredExternalLocalTextBackend = vi.fn();
vi.mock('@/features/local-ai/skills/tauriSkillRuntime', () => ({
  executeTauriLocalSkill: (...args: any[]) => mockExecuteTauriLocalSkill(...args),
  executeTauriLocalGemmaText: (...args: any[]) =>
    mockExecuteTauriLocalGemmaText(...args),
  buildGemma4LocalSkillPrompt: vi.fn((input: { prompt?: string }) =>
    input.prompt || 'generated-local-prompt'
  ),
}));

vi.mock('@/features/local-ai/adapters/externalLocalTextBackend', () => ({
  executeExternalLocalTextCompletion: (...args: any[]) =>
    mockExecuteExternalLocalTextCompletion(...args),
  readConfiguredExternalLocalTextBackend: (...args: any[]) =>
    mockReadConfiguredExternalLocalTextBackend(...args),
  shouldAllowOnDeviceLocalEngine: vi.fn(() => true),
  shouldAllowExternalLocalBackend: vi.fn(() => true),
  useExternalLocalTextBackendAvailability: () => ({
    scope: {
      tenantId: 'tenant-1',
      userId: 'user-1',
      runtimeNamespace: 'web',
    },
    backend: null,
    localEnginePreference: 'auto',
  }),
}));

vi.mock('@/features/local-ai/skills/useTauriLocalSkillRuntimeStatus', () => ({
  useTauriLocalSkillRuntimeStatus: () => ({
    available: true,
    supportsScriptBundle: true,
    supportsGemma4Text: true,
    supportsGemma4Voice: true,
    nodePath: '/usr/bin/node',
    litertLmPath: '/usr/bin/litert-lm',
    runtimeRoot: '/tmp/local-runtime',
    managedModelRoot: '/tmp/local-runtime/models',
    gemmaProfileIds: ['gemma4-e4b-tauri-balanced', 'gemma4-e2b-tauri-fast'],
    installedGemmaProfileIds: ['gemma4-e4b-tauri-balanced'],
    reason: null,
  }),
}));

// Mock PostHog
vi.mock('@/lib/posthog', () => ({
  getPostHog: vi.fn(() => ({
    capture: vi.fn(),
  })),
}));

// Mock tRPC with proper hook behavior
const mockMutateAsync = vi.fn();
const mockSaveAssistantMessageMutateAsync = vi.fn();
const mockGetSkillTaskResultFetch = vi.fn();
const mockSandboxGetJobStatusFetch = vi.fn();
const mockGetSkillFetch = vi.fn();
let mockSuccessCallback: ((data: any) => void) | null = null;
let mockErrorCallback: ((error: Error) => void) | null = null;

vi.mock('@/lib/trpc', () => ({
  trpc: {
    chat: {
      saveAssistantMessage: {
        useMutation: vi.fn(() => ({
          mutateAsync: (...args: any[]) =>
            mockSaveAssistantMessageMutateAsync(...args),
          isPending: false,
          error: null,
        })),
      },
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
      skills: {
        get: {
          fetch: (...args: any[]) => mockGetSkillFetch(...args),
        },
      },
      chat: {
        getMessages: {
          invalidate: vi.fn(),
        },
        getSkillTaskResult: {
          fetch: (...args: any[]) => mockGetSkillTaskResultFetch(...args),
        },
      },
      sandbox: {
        getJobStatus: {
          fetch: (...args: any[]) => mockSandboxGetJobStatusFetch(...args),
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
    mockSaveAssistantMessageMutateAsync.mockReset();
    mockSaveAssistantMessageMutateAsync.mockResolvedValue({
      id: 999,
      runtimeMetadata: {
        source: 'hybrid',
        taskClass: 'json_extraction',
      },
    });
    mockGetSkillTaskResultFetch.mockReset();
    mockSandboxGetJobStatusFetch.mockReset();
    mockGetSkillFetch.mockReset();
    mockExecuteTauriLocalSkill.mockReset();
    mockExecuteTauriLocalGemmaText.mockReset();
    mockExecuteExternalLocalTextCompletion.mockReset();
    mockReadConfiguredExternalLocalTextBackend.mockReset();
    mockExecuteTauriLocalSkill.mockResolvedValue({
      success: false,
      skillId: 'test-skill',
      type: 'text',
      error: 'Local runtime unavailable',
    });
    mockExecuteTauriLocalGemmaText.mockResolvedValue({
      success: false,
      profileId: 'gemma4-e4b-tauri-balanced',
      text: '',
      error: 'Local runtime unavailable',
    });
    mockReadConfiguredExternalLocalTextBackend.mockReturnValue(null);
    mockGetSkillFetch.mockResolvedValue({
      skillFilePath: "/tmp/test-skill/SKILL.md",
      localExecutionPolicy: null,
    });
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
      platform: 'web',
      origin: 'chat',
      requestedExecutionRoute: 'cloud',
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

  it('fails closed in local_only mode when the skill cannot run locally', async () => {
    const { result } = renderHook(() =>
      useSkillExecution({
        conversationId: 123,
        platform: 'web',
        localAiEnabled: true,
        localAiExecutionMode: 'local_only',
        localExecutionPolicy: {
          tier: 'local_safe',
          runtimeKind: 'gemma4_text',
          eligible: false,
          reviewed: true,
          allowOffline: true,
          requiresTauri: true,
          reason: 'local_safe_requires_tauri',
          warnings: [],
          derivedFrom: ['frontmatter'],
          signals: {
            requiresNetwork: false,
            requiresBrowser: false,
            maxRuntimeSeconds: null,
            maxInputMb: null,
            sandboxProfileSlug: null,
          },
          localScriptManifest: null,
        },
      })
    );

    let executionResult;
    await act(async () => {
      executionResult = await result.current.execute({
        skillId: 'test-skill',
        dynamicParams: {},
      });
    });

    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(executionResult).toEqual({
      success: false,
      skillId: 'test-skill',
      type: 'text',
      error: 'This skill can only run locally inside the Tauri desktop app.',
    });
  });

  it('runs local-safe text skills through the configured external local backend on web', async () => {
    mockReadConfiguredExternalLocalTextBackend.mockReturnValue({
      baseUrl: 'http://localhost:8000',
      apiKey: 'local-dev-token',
      model: 'HauhauCS/Gemma-4-E2B',
      requestTimeoutMs: 30000,
    });
    mockExecuteExternalLocalTextCompletion.mockResolvedValue({
      text: 'Local backend reply',
      model: 'HauhauCS/Gemma-4-E2B',
      provider: 'openai_compatible_local',
    });

    const { result } = renderHook(() =>
      useSkillExecution({
        conversationId: 123,
        platform: 'web',
        localAiEnabled: true,
        localAiExecutionMode: 'prefer_local',
        localExecutionPolicy: {
          tier: 'local_safe',
          runtimeKind: 'gemma4_text',
          eligible: true,
          reviewed: true,
          allowOffline: true,
          requiresTauri: false,
          reason: 'local_safe_text_skill',
          warnings: [],
          derivedFrom: ['frontmatter'],
          signals: {
            requiresNetwork: false,
            requiresBrowser: false,
            maxRuntimeSeconds: null,
            maxInputMb: null,
            sandboxProfileSlug: null,
          },
          localScriptManifest: null,
        },
      })
    );

    let executionResult;
    await act(async () => {
      executionResult = await result.current.execute({
        skillId: 'test-skill',
        prompt: 'hello',
        dynamicParams: { topic: 'ocean' },
      });
    });

    expect(mockExecuteExternalLocalTextCompletion).toHaveBeenCalledTimes(1);
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(executionResult).toEqual({
      success: true,
      skillId: 'test-skill',
      type: 'text',
      message: 'Local backend reply',
    });
  });

  it('falls back to cloud execution in prefer_local mode when no local runtime is bundled', async () => {
    const mockResult = {
      success: true,
      skillId: 'test-skill',
      type: 'text',
      message: 'cloud fallback',
    };
    mockMutateAsync.mockResolvedValue(mockResult);

    const { result } = renderHook(() =>
      useSkillExecution({
        conversationId: 123,
        platform: 'tauri',
        localAiEnabled: true,
        localAiExecutionMode: 'prefer_local',
        localExecutionPolicy: {
          tier: 'local_safe',
          runtimeKind: 'script_bundle',
          eligible: true,
          reviewed: true,
          allowOffline: true,
          requiresTauri: true,
          reason: 'local_safe_script_skill',
          warnings: [],
          derivedFrom: ['frontmatter', 'bundle_manifest'],
          signals: {
            requiresNetwork: false,
            requiresBrowser: false,
            maxRuntimeSeconds: null,
            maxInputMb: null,
            sandboxProfileSlug: null,
          },
          localScriptManifest: {
            runtimeKind: 'node_bundle',
            reviewedEntry: 'dist/index.mjs',
            artifactDigestSha256: 'a'.repeat(64),
            permissionProfile: 'tauri-local-safe-default',
            inputRoots: ['inputs'],
            outputRoots: ['outputs'],
            maxOutputMb: 24,
            provenance: {},
          },
        },
      })
    );

    let executionResult;
    await act(async () => {
      executionResult = await result.current.execute({
        skillId: 'test-skill',
        dynamicParams: { topic: 'ocean' },
      });
    });

    expect(mockMutateAsync).toHaveBeenCalledWith({
      skillId: 'test-skill',
      prompt: undefined,
      dynamicParams: { topic: 'ocean' },
      conversationId: 123,
      platform: 'tauri',
      origin: 'chat',
      requestedExecutionRoute: 'cloud_fallback',
    });
    expect(executionResult).toEqual(mockResult);
  });

  it('uses the Tauri local runner before cloud when a reviewed local-safe script skill is available', async () => {
    mockExecuteTauriLocalSkill.mockResolvedValue({
      success: true,
      skillId: 'test-skill',
      type: 'text',
      message: 'local success',
    });

    const { result } = renderHook(() =>
      useSkillExecution({
        conversationId: 123,
        platform: 'tauri',
        localAiEnabled: true,
        localAiExecutionMode: 'prefer_local',
        localExecutionPolicy: {
          tier: 'local_safe',
          runtimeKind: 'script_bundle',
          eligible: true,
          reviewed: true,
          allowOffline: true,
          requiresTauri: true,
          reason: 'local_safe_script_skill',
          warnings: [],
          derivedFrom: ['frontmatter', 'bundle_manifest'],
          signals: {
            requiresNetwork: false,
            requiresBrowser: false,
            maxRuntimeSeconds: null,
            maxInputMb: null,
            sandboxProfileSlug: null,
          },
          localScriptManifest: {
            runtimeKind: 'node_bundle',
            reviewedEntry: 'dist/index.mjs',
            artifactDigestSha256: 'a'.repeat(64),
            permissionProfile: 'tauri-local-safe-default',
            inputRoots: ['inputs'],
            outputRoots: ['outputs'],
            maxOutputMb: 24,
            provenance: {},
          },
        },
      })
    );

    let executionResult;
    await act(async () => {
      executionResult = await result.current.execute({
        skillId: 'test-skill',
        dynamicParams: { topic: 'ocean' },
      });
    });

    expect(mockExecuteTauriLocalSkill).toHaveBeenCalled();
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(executionResult).toEqual({
      success: true,
      skillId: 'test-skill',
      type: 'text',
      message: 'local success',
    });
  });

  it('uses Gemma 4 local text execution for reviewed local-safe text skills on Tauri', async () => {
    mockExecuteTauriLocalGemmaText.mockResolvedValue({
      success: true,
      profileId: 'gemma4-e4b-tauri-balanced',
      text: 'local gemma answer',
    });

    const { result } = renderHook(() =>
      useSkillExecution({
        conversationId: 123,
        platform: 'tauri',
        localAiEnabled: true,
        localAiExecutionMode: 'prefer_local',
        preferredLocalProfileId: 'gemma4-e4b-tauri-balanced',
        localExecutionPolicy: {
          tier: 'local_safe',
          runtimeKind: 'gemma4_text',
          eligible: true,
          reviewed: true,
          allowOffline: true,
          requiresTauri: true,
          reason: 'local_safe_text_skill',
          warnings: [],
          derivedFrom: ['frontmatter'],
          signals: {
            requiresNetwork: false,
            requiresBrowser: false,
            maxRuntimeSeconds: null,
            maxInputMb: null,
            sandboxProfileSlug: null,
          },
          localScriptManifest: null,
        },
      })
    );

    let executionResult;
    await act(async () => {
      executionResult = await result.current.execute({
        skillId: 'test-skill',
        prompt: 'Summarize this',
        dynamicParams: { audience: 'exec' },
      });
    });

    expect(mockExecuteTauriLocalGemmaText).toHaveBeenCalledWith({
      profileId: 'gemma4-e4b-tauri-balanced',
      prompt: 'Summarize this',
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(executionResult).toEqual({
      success: true,
      skillId: 'test-skill',
      type: 'text',
      message: 'local gemma answer',
    });
  });

  it('polls sandbox media jobs and returns generated image urls', async () => {
    vi.useFakeTimers();
    mockMutateAsync.mockResolvedValue({
      success: true,
      skillId: 'image-creator',
      type: 'sandbox-job',
      isAsync: true,
      jobId: 'job-123',
      message: 'Job dispatched',
    });
    mockSandboxGetJobStatusFetch.mockResolvedValue({
      jobId: 'job-123',
      status: 'completed',
      artifacts: [
        { url: 'https://example.com/out.png', mimeType: 'image/png', key: 'out.png' },
      ],
    });

    const { result } = renderHook(() =>
      useSkillExecution({ conversationId: 123 })
    );

    let executionResult: any;
    const executionPromise = result.current.execute({
      skillId: 'image-creator',
      dynamicParams: {},
    });

    await vi.advanceTimersByTimeAsync(3000);
    await act(async () => {
      executionResult = await executionPromise;
    });

    expect(mockSandboxGetJobStatusFetch).toHaveBeenCalledWith({ jobId: 'job-123' });
    expect(executionResult).toEqual({
      success: true,
      skillId: 'image-creator',
      type: 'image',
      resultUrl: 'https://example.com/out.png',
      resultUrls: ['https://example.com/out.png'],
      message: 'Image generated successfully!',
      isAsync: true,
      jobId: 'job-123',
    });
    vi.useRealTimers();
  });

  it('keeps loading while polling async Python skills and returns the final result', async () => {
    vi.useFakeTimers();
    mockMutateAsync.mockResolvedValue({
      success: true,
      skillId: 'python-skill',
      type: 'text',
      isAsync: true,
      taskId: 'task-123',
      message: 'Started',
    });
    mockGetSkillTaskResultFetch.mockResolvedValueOnce({
      status: 'running',
      skillId: 'python-skill',
      result: null,
    }).mockResolvedValueOnce({
      status: 'done',
      skillId: 'python-skill',
      result: {
        success: true,
        skillId: 'python-skill',
        type: 'text',
        message: 'Final output',
      },
    });

    const { result } = renderHook(() =>
      useSkillExecution({ conversationId: 123 })
    );

    let executionResult: any;
    const executionPromise = result.current.execute({
      skillId: 'python-skill',
      dynamicParams: { topic: 'ocean' },
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.isLoading).toBe(true);

    await vi.advanceTimersByTimeAsync(3000);
    expect(result.current.isLoading).toBe(true);

    await vi.advanceTimersByTimeAsync(3000);
    await act(async () => {
      executionResult = await executionPromise;
    });

    expect(mockGetSkillTaskResultFetch).toHaveBeenCalledWith({ taskId: 'task-123' });
    expect(executionResult).toEqual({
      success: true,
      skillId: 'python-skill',
      type: 'text',
      message: 'Final output',
    });
    expect(result.current.result).toEqual(executionResult);
    expect(result.current.isLoading).toBe(false);
    vi.useRealTimers();
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
