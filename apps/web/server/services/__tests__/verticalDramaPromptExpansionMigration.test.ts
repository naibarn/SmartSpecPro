import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
}));

vi.mock("../../db", () => ({ db: mockDb }));

import {
  assertPromptExpansionSchemaReady,
  buildValidatedPromptExpansionPreview,
  getLatestPromptExpansion,
  isPromptExpansionSchemaUnavailable,
  savePromptExpansionPreview,
} from "../verticalDramaPromptExpansionService";

function rejectingSelectChain(error: unknown) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => Promise.reject(error)),
  };
  return chain;
}

const validPreviewExecution = {
  skillId: "vertical-drama-prompt-expansion" as const,
  skillVersion: "2.0.0",
  executionMode: "llm-only" as const,
  provider: "test-provider",
  providerCallId: "provider-call-1",
  model: "test-model",
  attemptCount: 1,
  inputTokens: 10,
  outputTokens: 20,
  mocked: false as const,
};

const missingTableError = {
  code: "42P01",
  message: 'relation "vertical_drama_prompt_expansion_runs" does not exist',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("prompt-expansion migration compatibility", () => {
  it("recognizes missing prompt-expansion schema errors, including wrapped errors", () => {
    expect(isPromptExpansionSchemaUnavailable(missingTableError)).toBe(true);
    expect(
      isPromptExpansionSchemaUnavailable({ cause: missingTableError })
    ).toBe(true);
    expect(
      isPromptExpansionSchemaUnavailable({
        code: "23505",
        message: "duplicate key value violates unique constraint",
      })
    ).toBe(false);
  });

  it("treats an absent ledger as no applied expansion for readiness reads", async () => {
    mockDb.select.mockReturnValueOnce(rejectingSelectChain(missingTableError));

    await expect(
      getLatestPromptExpansion(
        { tenantId: "tenant-1", userId: 42 },
        { seriesId: 10 }
      )
    ).resolves.toBeNull();
  });

  it("fails before any LLM call when the expansion ledger migration is missing", async () => {
    mockDb.select.mockReturnValueOnce(rejectingSelectChain(missingTableError));
    await expect(assertPromptExpansionSchemaReady()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("0244"),
    });
  });

  it("returns a migration-specific precondition for preview writes", async () => {
    mockDb.select.mockReturnValueOnce(rejectingSelectChain(missingTableError));
    const preview = buildValidatedPromptExpansionPreview({
      prompt: "รีวิวร้านกาแฟในเชียงใหม่",
      modelOutput: JSON.stringify({
        brief: {
          title: "รีวิวร้านกาแฟ",
          oneLineSummary: "ประเมินประสบการณ์ร้านกาแฟอย่างเป็นระบบ",
          profile: "review",
          angle: "พิจารณาบรรยากาศ การบริการ เมนู และข้อจำกัดที่ผู้ชมควรรู้ก่อนตัดสินใจ",
          scope: ["บรรยากาศ", "บริการ", "เมนู"],
          factualClaims: [],
          creativeAssumptions: ["รายละเอียดที่ไม่ได้ระบุให้ตรวจสอบก่อนใช้"],
          exclusions: ["ไม่สรุปราคาเฉพาะรายการโดยไม่มีหลักฐาน"],
        },
        expandedPrompt: "รีวิวร้านกาแฟในเชียงใหม่โดยอธิบายบรรยากาศ การเดินทาง การบริการ เมนูเด่น ประสบการณ์ของผู้ใช้ ข้อดี ข้อจำกัด และสิ่งที่ควรตรวจสอบก่อนเผยแพร่ เพื่อให้ผู้ชมตัดสินใจได้อย่างมีข้อมูล",
        sources: [],
        warnings: ["ข้อมูลเฉพาะร้านต้องตรวจสอบก่อนเผยแพร่"],
        slots: [{ slotKey: "venue", title: "ภาพร้าน", description: "ภาพบรรยากาศร้านจากสถานที่จริงที่ต้องตรวจสิทธิ์ก่อนใช้", semanticRole: "scene_anchor", mediaType: "image", required: true, evidenceStatus: "needs_verification" }],
      }),
      execution: validPreviewExecution,
    });

    await expect(
      savePromptExpansionPreview(
        { tenantId: "tenant-1", userId: 42 },
        { idempotencyKey: "preview-1", preview }
      )
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("0244"),
    });
  });
});
