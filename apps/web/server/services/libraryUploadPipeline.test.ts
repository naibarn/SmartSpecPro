import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./appRuntimeConfig", () => ({
  getAppRuntimeConfig: vi.fn(async () => ({
    pythonBackendUrl: "http://python.test",
    proxyToken: "proxy-token",
    webGatewayToken: "gateway-token",
  })),
  getPreferredInternalToken: vi.fn(async () => "proxy-token"),
}));

vi.mock("./documentOcrSettings", () => ({
  getDocumentOcrSettings: vi.fn(async () => ({
    imageOcrProvider: "legacy",
    pdfOcrProvider: "legacy",
    typhoonOcrApiKey: "",
    landingAiApiKey: "",
    googleAiApiKey: "",
    creditsPerPage: 1,
  })),
  resolveDocumentOcrRouting: vi.fn(() => ({
    fileClass: "legacy",
    requestedProviderId: "legacy",
    providerId: "legacy",
    fallbackReason: "legacy_default",
    requestHeaders: null,
  })),
}));

vi.mock("./traceContext", () => ({
  getTraceId: vi.fn(() => "trace-ocr-123"),
}));

import {
  buildUploadPipelineState,
  computeLibraryUploadChecksum,
  enrichLibraryUploadContent,
  validateLibraryUploadSignature,
} from "./libraryUploadPipeline";

describe("libraryUploadPipeline", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SMARTSPEC_PROXY_TOKEN;
  });

  it("rejects mismatched file signatures", () => {
    const pdfBytes = Buffer.from("%PDF-1.7 fake", "utf8");

    expect(() => validateLibraryUploadSignature(pdfBytes, "image/png", "png"))
      .toThrow("declared file type");
  });

  it("computes deterministic checksums", () => {
    const checksum = computeLibraryUploadChecksum(Buffer.from("hello world", "utf8"));
    expect(checksum).toHaveLength(64);
    expect(checksum).toBe(computeLibraryUploadChecksum(Buffer.from("hello world", "utf8")));
  });

  it("returns inline text enrichment for text-like uploads", async () => {
    const result = await enrichLibraryUploadContent({
      fileBuffer: Buffer.from("hello world", "utf8"),
      fileName: "notes.txt",
      fileType: "text/plain",
      extension: "txt",
      fallbackText: "hello world",
    });

    expect(result).toEqual({
      extractedText: "hello world",
      extractor: "inline_text",
      warnings: [],
      searchQuality: "full_text",
      stageMessage: "Text extracted and queued for semantic indexing.",
      extraMetadata: {},
    });
  });

  it("keeps image uploads metadata-only unless OCR or real-world vision is explicitly requested", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await enrichLibraryUploadContent({
      fileBuffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb]),
      fileName: "house.jpg",
      fileType: "image/jpeg",
      extension: "jpg",
      fallbackText: null,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.extractor).toBe("image_metadata_only");
    expect(result.searchQuality).toBe("metadata_only");
  });

  it("uses internal media enrichment for image uploads when real-world OCR is requested", async () => {
    process.env.SMARTSPEC_PROXY_TOKEN = "proxy-token";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        text: "White modern house with pool",
        method: "image_document_ocr",
        search_quality: "full_text",
        caption: "White modern house with pool",
        metadata: {
          ocr_text: "",
          objects: ["house", "pool"],
        },
      }),
    }));

    const result = await enrichLibraryUploadContent({
      fileBuffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb]),
      fileName: "house.jpg",
      fileType: "image/jpeg",
      extension: "jpg",
      fallbackText: null,
      externalProcessingAllowed: true,
      metadata: {
        analysis_profile: "document_ocr",
        finance_capture_intent: "transfer_slip",
      },
    });

    expect(result.extractor).toBe("image_document_ocr");
    expect(result.searchQuality).toBe("full_text");
    expect(result.extractedText).toContain("White modern house");
    const fetchCall = (global.fetch as any).mock.calls[0];
    const init = fetchCall?.[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.capture_intent).toBe("transfer_slip");
    expect((init.headers as Record<string, string>)["x-trace-id"]).toBe("trace-ocr-123");
    expect((init.headers as Record<string, string>)["x-proxy-token"]).toBe("proxy-token");
  });

  it("uses internal media enrichment for transfer slips when the unified LLM parser is requested", async () => {
    process.env.SMARTSPEC_PROXY_TOKEN = "proxy-token";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        text: "สรุปรายการสลิปโอนเงิน\nจำนวนเงิน: 726.00 THB",
        method: "image_unified_llm_parser",
        search_quality: "full_text",
        caption: "Transfer slip",
        metadata: {
          unified_payin_slip_summary: "สรุปรายการสลิปโอนเงิน\nจำนวนเงิน: 726.00 THB",
          analysis_profile: "finance_payin_llm_parser",
        },
      }),
    }));

    const result = await enrichLibraryUploadContent({
      fileBuffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb]),
      fileName: "transfer-slip.jpg",
      fileType: "image/jpeg",
      extension: "jpg",
      fallbackText: null,
      externalProcessingAllowed: true,
      metadata: {
        analysis_profile: "finance_payin_llm_parser",
        finance_capture_intent: "transfer_slip",
      },
    });

    expect(result.extractor).toBe("image_unified_llm_parser");
    expect(result.extractedText).toContain("สรุปรายการสลิปโอนเงิน");
    const fetchCall = (global.fetch as any).mock.calls[0];
    const init = fetchCall?.[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.analysis_profile).toBe("finance_payin_llm_parser");
    expect(body.capture_intent).toBe("transfer_slip");
  });

  it("forwards sourceUrl to internal media enrichment when provided", async () => {
    process.env.SMARTSPEC_PROXY_TOKEN = "proxy-token";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        text: "Krungthai transfer slip",
        method: "image_document_ocr",
        search_quality: "full_text",
        metadata: {
          ocr_text: "Krungthai transfer slip",
        },
      }),
    }));

    const result = await enrichLibraryUploadContent({
      fileBuffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb]),
      fileName: "transfer-slip.jpg",
      fileType: "image/jpeg",
      extension: "jpg",
      fallbackText: null,
      sourceUrl: "https://cdn.example.com/library/uploads/tenant-1/7/transfer-slip.jpg",
      externalProcessingAllowed: true,
      metadata: {
        analysis_profile: "document_ocr",
        finance_capture_intent: "transfer_slip",
      },
    });

    expect(result.extractor).toBe("image_document_ocr");
    const fetchCall = (global.fetch as any).mock.calls[0];
    const init = fetchCall?.[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.source_url).toBe("https://cdn.example.com/library/uploads/tenant-1/7/transfer-slip.jpg");
  });

  it("forwards document OCR analysis profile for scanned PDF uploads", async () => {
    process.env.SMARTSPEC_PROXY_TOKEN = "proxy-token";
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        text: "โอนเงิน 250 บาท ไป SCB Main",
        method: "pdf_document_ocr",
        warning: null,
        metadata: {
          ocr_provider: "landingai_ade",
          provider_request_id: "job-ade-123",
          source_url_kind: "public_url",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await enrichLibraryUploadContent({
      fileBuffer: Buffer.from("%PDF-1.7 scanned slip", "utf8"),
      fileName: "transfer-slip.pdf",
      fileType: "application/pdf",
      extension: "pdf",
      fallbackText: null,
      externalProcessingAllowed: true,
      metadata: {
        analysis_profile: "document_ocr",
        finance_capture_intent: "transfer_slip",
      },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const fetchCall = fetchSpy.mock.calls[0];
    expect(fetchCall?.[0]).toContain("/api/internal/library/extract-text");
    const init = fetchCall?.[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.analysis_profile).toBe("document_ocr");
    expect(body.capture_intent).toBe("transfer_slip");
    expect((init.headers as Record<string, string>)["x-trace-id"]).toBe("trace-ocr-123");
    expect(result.extractor).toBe("pdf_document_ocr");
    expect(result.searchQuality).toBe("full_text");
    expect(result.extractedText).toContain("SCB Main");
    expect(result.extraMetadata).toMatchObject({
      ocr_provider: "landingai_ade",
      provider_request_id: "job-ade-123",
      source_url_kind: "public_url",
    });
  });

  it("creates pipeline states with timestamps", () => {
    const state = buildUploadPipelineState("indexing", {
      checksumSha256: "abc",
      searchQuality: "full_text",
    });

    expect(state.stage).toBe("indexing");
    expect(state.checksumSha256).toBe("abc");
    expect(state.searchQuality).toBe("full_text");
    expect(typeof state.updatedAt).toBe("string");
  });
});
