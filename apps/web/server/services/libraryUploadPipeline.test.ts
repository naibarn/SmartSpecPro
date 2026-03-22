import { afterEach, describe, expect, it, vi } from "vitest";

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
      metadata: {
        analysis_profile: "document_ocr",
      },
    });

    expect(result.extractor).toBe("image_document_ocr");
    expect(result.searchQuality).toBe("full_text");
    expect(result.extractedText).toContain("White modern house");
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
