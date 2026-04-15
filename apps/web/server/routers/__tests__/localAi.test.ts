import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDocumentOcrRoute } from "../../../shared/documentOcrRouting";

const mocks = vi.hoisted(() => ({
  analyzeLocalAiAttachmentAssistMock: vi.fn(),
  getTenantFeatureFlagsMock: vi.fn(),
  getDocumentOcrSettingsMock: vi.fn(),
  hasEnoughCreditsMock: vi.fn(),
  deductCreditsMock: vi.fn(),
}));

vi.mock("../../services/localAiMediaAssist", () => ({
  analyzeLocalAiAttachmentAssist: mocks.analyzeLocalAiAttachmentAssistMock,
}));

vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mocks.getTenantFeatureFlagsMock,
}));

vi.mock("../../services/documentOcrSettings", () => ({
  getDocumentOcrSettings: mocks.getDocumentOcrSettingsMock,
  isOcrExtractor: (extractor: string | null | undefined) =>
    String(extractor ?? "").toLowerCase().includes("ocr"),
  resolveOcrPageCount: () => 2,
  resolveOcrProvider: (metadata: Record<string, unknown>) =>
    typeof metadata.ocr_provider === "string" ? metadata.ocr_provider : null,
  resolveDocumentOcrRouting: resolveDocumentOcrRoute,
  calculateOcrCredits: (pageCount: number, creditsPerPage: number) => pageCount * creditsPerPage,
  classifyOcrFileClass: (params: { mimeType?: string | null }) =>
    String(params.mimeType ?? "").toLowerCase() === "application/pdf" ? "pdf" : "image",
  getDocumentOcrCreditsPerUnit: (_settings: any, _providerId: string | null | undefined, fileClass: string) =>
    fileClass === "pdf" ? 2 : 2,
}));

vi.mock("../../services/creditService", () => ({
  hasEnoughCredits: mocks.hasEnoughCreditsMock,
  deductCredits: mocks.deductCreditsMock,
}));

import { localAiRouter } from "../localAi";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTenantFeatureFlagsMock.mockResolvedValue({
    localClientLlmMode: true,
  });
  mocks.getDocumentOcrSettingsMock.mockResolvedValue({
    imageOcrProvider: "typhoon_ocr_1_5",
    pdfOcrProvider: "google_ai_vision",
    typhoonOcrApiKey: "ty-key",
    landingAiApiKey: "la-key",
    googleAiApiKey: "google-key",
    creditsPerPage: 2,
  });
  mocks.hasEnoughCreditsMock.mockResolvedValue(true);
  mocks.deductCreditsMock.mockResolvedValue(undefined);
  mocks.analyzeLocalAiAttachmentAssistMock.mockResolvedValue({
    kind: "document_ocr",
    extractedText: "receipt text",
    extractor: "typhoon_ocr_1_5",
    caption: "Receipt",
    ocrText: "receipt text",
    warning: null,
    searchQuality: "full_text",
    metadata: {
      page_count: 2,
      ocr_provider: "typhoon_ocr_1_5",
    },
  });
});

describe("localAiRouter", () => {
  it("exposes OCR preview routing for chat attachments", async () => {
    const caller = localAiRouter.createCaller({
      user: {
        id: 1,
        role: "user",
        currentTenantId: "tenant-1",
      },
      tenantId: "tenant-1",
    } as any);

    const preview = await caller.getDocumentOcrPreview();

    expect(preview).toMatchObject({
      image: {
        providerId: "typhoon_ocr_1_5",
        providerLabel: "Typhoon OCR 1.5",
        ready: true,
      },
      pdf: {
        providerId: "google_ai_vision",
        providerLabel: "Google AI Vision OCR",
        ready: true,
      },
    });
  });

  it("forwards OCR intent to the attachment assist helper", async () => {
    const caller = localAiRouter.createCaller({
      user: {
        id: 1,
        role: "user",
        currentTenantId: "tenant-1",
      },
      tenantId: "tenant-1",
    } as any);

    const result = await caller.analyzeAttachmentAssist({
      fileName: "receipt.png",
      mimeType: "image/png",
      contentBase64: "Zm9v",
      mode: "document_ocr",
      analysisProfile: "document_ocr",
      captureIntent: "receipt",
    });

    expect(mocks.analyzeLocalAiAttachmentAssistMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "receipt.png",
        mimeType: "image/png",
        contentBase64: "Zm9v",
        mode: "document_ocr",
        analysisProfile: "document_ocr",
        captureIntent: "receipt",
      }),
    );
    expect(result.extractor).toBe("typhoon_ocr_1_5");
    expect(mocks.deductCreditsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 4,
        metadata: expect.objectContaining({
          service: "chat.ocr",
          source: "chat_ocr",
          ocrProvider: "typhoon_ocr_1_5",
        }),
      }),
    );
  });
});
