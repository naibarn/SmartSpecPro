import { describe, expect, it } from "vitest";
import {
  getDocumentOcrCreditsPerUnit,
} from "../documentOcrSettings";
import { DOCUMENT_OCR_PROVIDER_IDS } from "../../../shared/documentOcrRouting";

describe("documentOcrSettings pricing", () => {
  const settings = {
    creditsPerPage: 2,
    billingRates: {
      legacy: {
        imageCreditsPerUnit: 0,
        pdfCreditsPerPage: 1,
      },
      landingai_ade: {
        imageCreditsPerUnit: 3,
        pdfCreditsPerPage: 4,
      },
      typhoon_ocr_1_5: {
        imageCreditsPerUnit: 5,
        pdfCreditsPerPage: 6,
      },
      google_ai_vision: {
        imageCreditsPerUnit: 7,
        pdfCreditsPerPage: 8,
      },
    },
  } as const;

  it("uses provider-specific image and PDF rates", () => {
    expect(getDocumentOcrCreditsPerUnit({
      settings,
      providerId: DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15,
      fileClass: "image",
    })).toBe(5);

    expect(getDocumentOcrCreditsPerUnit({
      settings,
      providerId: DOCUMENT_OCR_PROVIDER_IDS.googleAiVision,
      fileClass: "pdf",
    })).toBe(8);
  });

  it("falls back to the legacy bucket for unknown or legacy providers", () => {
    expect(getDocumentOcrCreditsPerUnit({
      settings,
      providerId: "pdf_document_ocr",
      fileClass: "pdf",
    })).toBe(1);

    expect(getDocumentOcrCreditsPerUnit({
      settings,
      providerId: DOCUMENT_OCR_PROVIDER_IDS.legacy,
      fileClass: "image",
    })).toBe(0);
  });

  it("falls back to the legacy credit-per-page value when billing rates are missing", () => {
    expect(getDocumentOcrCreditsPerUnit({
      settings: {
        creditsPerPage: 2,
      },
      providerId: DOCUMENT_OCR_PROVIDER_IDS.landingAiAde,
      fileClass: "pdf",
    })).toBe(2);
  });
});
