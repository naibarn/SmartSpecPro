import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetDb = vi.fn();
const mockResolveEnabledLlmModelId = vi.fn();
const mockGetProviderForModel = vi.fn();
const mockRunPlanner = vi.fn();
const mockRecordStepAttempt = vi.fn();
const mockDeductCreditsForModel = vi.fn();
const mockAuditLog = vi.fn();

vi.mock("../../db", () => ({
  getDb: (...args: unknown[]) => mockGetDb(...args),
}));

vi.mock("../../services/enabledLlmModels", () => ({
  resolveEnabledLlmModelId: (...args: unknown[]) => mockResolveEnabledLlmModelId(...args),
}));

vi.mock("../../services/llmRouter", () => ({
  getProviderForModel: (...args: unknown[]) => mockGetProviderForModel(...args),
}));

vi.mock("../../services/taskPlannerMiddleware", () => ({
  runPlanner: (...args: unknown[]) => mockRunPlanner(...args),
  recordStepAttempt: (...args: unknown[]) => mockRecordStepAttempt(...args),
}));

vi.mock("../../services/creditService", () => ({
  deductCreditsForModel: (...args: unknown[]) => mockDeductCreditsForModel(...args),
}));

vi.mock("../../services/auditLogger", () => ({
  auditLogger: {
    log: (...args: unknown[]) => mockAuditLog(...args),
  },
}));

import { scheduledMessagesRouter } from "../scheduledMessages";

function createCaller() {
  return scheduledMessagesRouter.createCaller({
    user: {
      id: 1,
      openId: "user-open-id",
      email: "user@example.com",
      name: "Tester",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      currentTenantId: "tenant-1",
      registeredDomain: "tenant-1",
    },
    tenantId: "tenant-1",
    userToken: null,
    privateVaultToken: null,
    publicUrl: "https://example.com",
    req: { ip: "127.0.0.1", headers: {}, protocol: "https" } as any,
    res: {} as any,
  });
}

describe("scheduledMessages.parseIntent", () => {
  beforeEach(() => {
    mockGetDb.mockResolvedValue({});
    mockResolveEnabledLlmModelId.mockResolvedValue("gpt-4o-mini");
    mockGetProviderForModel.mockResolvedValue({
      providerName: "OpenRouter",
      baseUrl: "https://provider.example",
      apiKey: "secret",
    });
    mockRunPlanner.mockResolvedValue(null);
    mockRecordStepAttempt.mockResolvedValue(undefined);
    mockDeductCreditsForModel.mockResolvedValue(undefined);
    mockAuditLog.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("falls back to a manual schedule draft when upstream LLM returns an error", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response("upstream exploded", { status: 500 }),
    );

    const caller = createCaller();
    const result = await caller.parseIntent({
      message: "เตือนฉันเรื่องประชุมพรุ่งนี้",
      model: "gpt-4o-mini",
    });

    expect(result).toEqual({
      prompt: "เตือนฉันเรื่องประชุมพรุ่งนี้",
      cronExpression: null,
      scheduledAt: null,
      isRecurring: false,
      emailNotify: true,
      description: "เตือนฉันเรื่องประชุมพรุ่งนี้",
      timezone: "Asia/Bangkok",
    });
  });

  it("falls back when the provider response cannot be parsed as JSON schedule data", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: "I think maybe tomorrow morning, not sure",
            },
          },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 8 },
      }), { status: 200 }),
    );

    const caller = createCaller();
    const result = await caller.parseIntent({
      message: "ช่วยเตือนฉันโทรหาลูกค้าพรุ่งนี้",
      model: "gpt-4o-mini",
    });

    expect(result).toEqual({
      prompt: "ช่วยเตือนฉันโทรหาลูกค้าพรุ่งนี้",
      cronExpression: null,
      scheduledAt: null,
      isRecurring: false,
      emailNotify: true,
      description: "ช่วยเตือนฉันโทรหาลูกค้าพรุ่งนี้",
      timezone: "Asia/Bangkok",
    });
    expect(mockDeductCreditsForModel).toHaveBeenCalledTimes(1);
  });

  it("charges schedule parsing from chat as chat usage instead of scheduler usage", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                prompt: "เตือนฉันพรุ่งนี้",
                cronExpression: null,
                scheduledAt: "2026-04-03T09:00:00.000Z",
                isRecurring: false,
                emailNotify: true,
                description: "เตือนฉันพรุ่งนี้",
                timezone: "Asia/Bangkok",
              }),
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      }), { status: 200 }),
    );

    const caller = createCaller();
    await caller.parseIntent({
      message: "เตือนฉันพรุ่งนี้",
      model: "gpt-4o-mini",
      sourceType: "chat",
    });

    expect(mockDeductCreditsForModel).toHaveBeenCalledWith(expect.objectContaining({
      sourceType: "chat",
      metadata: expect.objectContaining({
        operation: "schedule_intent_parse",
        initiatedFrom: "chat",
      }),
    }));
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      requestType: "chat",
    }));
  });

  it("falls back when no enabled model is available for schedule parsing", async () => {
    mockResolveEnabledLlmModelId.mockResolvedValueOnce(null);

    const caller = createCaller();
    const result = await caller.parseIntent({
      message: "นัดทุกวันจันทร์ 8 โมงเช้า",
    });

    expect(result).toEqual({
      prompt: "นัดทุกวันจันทร์ 8 โมงเช้า",
      cronExpression: null,
      scheduledAt: null,
      isRecurring: false,
      emailNotify: true,
      description: "นัดทุกวันจันทร์ 8 โมงเช้า",
      timezone: "Asia/Bangkok",
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
