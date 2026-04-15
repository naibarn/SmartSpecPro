import { describe, expect, it } from "vitest";
import {
  classifyDocumentOcrFileClass,
  DOCUMENT_OCR_PROVIDER_IDS,
  getDocumentOcrProviderLabel,
  resolveDocumentOcrRoute,
  normalizeDocumentOcrProviderId,
} from "../documentOcrRouting";

describe("documentOcrRouting", () => {
  it("classifies pdf and image uploads including webp/gif/heic/heif", () => {
    expect(classifyDocumentOcrFileClass({ mimeType: "application/pdf", fileName: "receipt.pdf" }))
      .toBe("pdf");
    expect(classifyDocumentOcrFileClass({ mimeType: "image/jpeg", fileName: "receipt.jpg" }))
      .toBe("image");
    expect(classifyDocumentOcrFileClass({ mimeType: "image/png", fileName: "receipt.png" }))
      .toBe("image");
    expect(classifyDocumentOcrFileClass({ mimeType: "image/webp", fileName: "receipt.webp" }))
      .toBe("image");
    expect(classifyDocumentOcrFileClass({ mimeType: "image/gif", fileName: "receipt.gif" }))
      .toBe("image");
    expect(classifyDocumentOcrFileClass({ mimeType: "image/heic", fileName: "receipt.heic" }))
      .toBe("image");
    expect(classifyDocumentOcrFileClass({ mimeType: "image/heif", fileName: "receipt.heif" }))
      .toBe("image");
  });

  it("normalizes Typhoon provider ids and labels", () => {
    expect(normalizeDocumentOcrProviderId("typhoon-ocr")).toBe(DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15);
    expect(normalizeDocumentOcrProviderId("landing_ai_ade")).toBe(DOCUMENT_OCR_PROVIDER_IDS.landingAiAde);
    expect(normalizeDocumentOcrProviderId("google-ai-vision")).toBe(DOCUMENT_OCR_PROVIDER_IDS.googleAiVision);
    expect(getDocumentOcrProviderLabel("legacy")).toBe("Native extraction");
    expect(getDocumentOcrProviderLabel("typhoon-ocr")).toBe("Typhoon OCR 1.5");
    expect(getDocumentOcrProviderLabel("google-ai-vision")).toBe("Google AI Vision OCR");
  });

  it("falls back to legacy routing when the selected provider key is missing", () => {
    const route = resolveDocumentOcrRoute({
      settings: {
        imageOcrProvider: "typhoon_ocr_1_5",
        pdfOcrProvider: "landingai_ade",
        typhoonOcrApiKey: "",
        landingAiApiKey: "",
      },
      mimeType: "image/jpeg",
      fileName: "receipt.jpg",
    });

    expect(route.fileClass).toBe("image");
    expect(route.requestedProviderId).toBe(DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15);
    expect(route.providerId).toBe(DOCUMENT_OCR_PROVIDER_IDS.legacy);
    expect(route.fallbackReason).toBe("missing_api_key");
    expect(route.requestHeaders).toBeNull();
  });

  it("builds Typhoon headers when the API key is configured", () => {
    const route = resolveDocumentOcrRoute({
      settings: {
        imageOcrProvider: "legacy",
        pdfOcrProvider: "typhoon_ocr_1_5",
        typhoonOcrApiKey: "typhoon-test-key",
        landingAiApiKey: "",
      },
      mimeType: "application/pdf",
      fileName: "receipt.pdf",
    });

    expect(route.fileClass).toBe("pdf");
    expect(route.providerId).toBe(DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15);
    expect(route.requestHeaders).toEqual({
      "x-typhoon-ocr-api-key": "typhoon-test-key",
    });
  });

  it("routes Google AI vision OCR without extra headers when the Google key is configured", () => {
    const route = resolveDocumentOcrRoute({
      settings: {
        imageOcrProvider: "google_ai_vision",
        pdfOcrProvider: "legacy",
        googleAiApiKey: "google-test-key",
        typhoonOcrApiKey: "",
        landingAiApiKey: "",
      },
      mimeType: "image/jpeg",
      fileName: "receipt.jpg",
    });

    expect(route.fileClass).toBe("image");
    expect(route.requestedProviderId).toBe(DOCUMENT_OCR_PROVIDER_IDS.googleAiVision);
    expect(route.providerId).toBe(DOCUMENT_OCR_PROVIDER_IDS.googleAiVision);
    expect(route.fallbackReason).toBeNull();
    expect(route.requestHeaders).toBeNull();
  });
});
